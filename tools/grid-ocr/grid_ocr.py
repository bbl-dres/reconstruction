#!/usr/bin/env python3
r"""
grid_ocr.py -- sweep the mouse over an on-screen grid, screenshot a fixed region
after every move, OCR it, and log the results to a CSV.

Typical use: a chart / map / heatmap shows a readout or tooltip in a fixed place
(e.g. the bottom-right of the screen) for whatever is under the cursor, and you
want those values for every cell of a grid.

Interactive (default):
    python grid_ocr.py --out-dir D:\captures --cols 10 --rows 10

    1. A dark overlay appears. Drag a rectangle over the GRID area the cursor
       should sweep. Esc cancels.
    2. A second overlay appears. Drag a rectangle over the CAPTURE area that
       is screenshotted after every move.
    3. After a countdown the sweep runs. Abort with Ctrl+C in the console, or
       by slamming the mouse into a corner of the primary screen (fail-safe).

Non-interactive:
    python grid_ocr.py --regions D:\captures\run_20261009_120000\regions.json
    python grid_ocr.py --grid 100,200,800,600 --capture 3300,1400,500,180
    python grid_ocr.py --list-monitors

Outputs, inside <out-dir>/<run-name>/:
    results.csv       index,row,col,cursor_x,cursor_y,timestamp,screenshot,text
    screenshots/      shot_0001_r000_c000.png ...
    regions.json      grid + capture rectangles, reusable via --regions
    grid_preview.png  the grid area with every planned cursor position marked
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import platform
import shutil
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable

IS_WINDOWS = platform.system() == "Windows"
CSV_COLUMNS = ["index", "row", "col", "cursor_x", "cursor_y", "timestamp", "screenshot", "text"]


# --------------------------------------------------------------------------- DPI
def enable_dpi_awareness() -> None:
    """Make Windows hand us physical pixels. Must run before tkinter / pyautogui / mss load,
    otherwise a 125 % scaled 3840x1600 screen looks like 3072x1280 and every rectangle is off."""
    if not IS_WINDOWS:
        return
    import ctypes

    try:  # DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, Windows 10 1703+
        fn = ctypes.windll.user32.SetProcessDpiAwarenessContext
        fn.argtypes, fn.restype = [ctypes.c_void_p], ctypes.c_bool
        if fn(ctypes.c_void_p(-4)):
            return
    except Exception:
        pass
    try:  # PROCESS_PER_MONITOR_DPI_AWARE, Windows 8.1+
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
        return
    except Exception:
        pass
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass


# ----------------------------------------------------------------------- Regions
@dataclass(frozen=True)
class Region:
    x: int
    y: int
    w: int
    h: int

    def as_mss(self) -> dict:
        return {"left": self.x, "top": self.y, "width": self.w, "height": self.h}

    def as_dict(self) -> dict:
        return {"x": self.x, "y": self.y, "w": self.w, "h": self.h}

    @classmethod
    def from_dict(cls, d: dict) -> "Region":
        return cls(int(d["x"]), int(d["y"]), int(d["w"]), int(d["h"]))

    @classmethod
    def parse(cls, text: str) -> "Region":
        try:
            x, y, w, h = (int(p.strip()) for p in text.split(","))
        except ValueError:
            raise argparse.ArgumentTypeError(f"expected x,y,w,h (four integers), got {text!r}")
        if w <= 0 or h <= 0:
            raise argparse.ArgumentTypeError("width and height must be positive")
        return cls(x, y, w, h)

    def __str__(self) -> str:
        return f"x={self.x} y={self.y} w={self.w} h={self.h}"


@dataclass(frozen=True)
class Point:
    row: int
    col: int
    x: int
    y: int


def virtual_screen() -> Region:
    """Bounding box of all monitors, in physical pixels."""
    if IS_WINDOWS:
        import ctypes

        m = ctypes.windll.user32.GetSystemMetrics
        return Region(m(76), m(77), m(78), m(79))  # SM_XVIRTUALSCREEN .. SM_CYVIRTUALSCREEN
    import tkinter as tk

    root = tk.Tk()
    root.withdraw()
    r = Region(0, 0, root.winfo_screenwidth(), root.winfo_screenheight())
    root.destroy()
    return r


def select_region(title: str, hint: str, color: str) -> Region | None:
    """Translucent overlay over every monitor; drag a rectangle. Returns None on Esc."""
    import tkinter as tk
    import tkinter.font as tkfont

    vs = virtual_screen()
    root = tk.Tk()
    root.title(title)
    root.overrideredirect(True)
    root.geometry(f"{vs.w}x{vs.h}+{vs.x}+{vs.y}")
    root.attributes("-topmost", True)
    try:
        root.attributes("-alpha", 0.35)
    except tk.TclError:
        pass
    root.configure(bg="black")
    canvas = tk.Canvas(root, bg="black", highlightthickness=0, cursor="crosshair")
    canvas.pack(fill="both", expand=True)

    # Banner centred on the primary monitor. Screen (0,0) is canvas (-vs.x, -vs.y).
    bx, by = -vs.x + root.winfo_screenwidth() // 2, -vs.y + 70
    big = tkfont.Font(family="Segoe UI", size=22, weight="bold")
    small = tkfont.Font(family="Segoe UI", size=12)
    canvas.create_text(bx, by, text=title, fill=color, font=big)
    canvas.create_text(bx, by + 40, text=f"{hint}   -   drag to select, Esc to cancel", fill="white", font=small)
    size_label = canvas.create_text(0, 0, text="", fill="white", font=small, anchor="nw", state="hidden")

    state: dict = {"origin": None, "rect": None, "result": None}

    def on_press(e):
        state["origin"] = (e.x, e.y, e.x_root, e.y_root)
        try:
            state["rect"] = canvas.create_rectangle(e.x, e.y, e.x, e.y, outline=color, width=2, fill=color, stipple="gray25")
        except tk.TclError:  # stipple unsupported (macOS)
            state["rect"] = canvas.create_rectangle(e.x, e.y, e.x, e.y, outline=color, width=2)

    def on_drag(e):
        if state["origin"] is None:
            return
        x0, y0 = state["origin"][:2]
        canvas.coords(state["rect"], x0, y0, e.x, e.y)
        canvas.itemconfigure(size_label, text=f"{abs(e.x - x0)} x {abs(e.y - y0)}", state="normal")
        canvas.coords(size_label, min(x0, e.x), max(y0, e.y) + 6)

    def on_release(e):
        if state["origin"] is None:
            return
        sx0, sy0 = state["origin"][2:]
        w, h = abs(e.x_root - sx0), abs(e.y_root - sy0)
        if w < 3 or h < 3:  # a click, not a drag: reset and let the user try again
            canvas.delete(state["rect"])
            canvas.itemconfigure(size_label, state="hidden")
            state["origin"] = state["rect"] = None
            return
        state["result"] = Region(min(sx0, e.x_root), min(sy0, e.y_root), w, h)
        root.quit()

    def on_escape(_e):
        state["result"] = None
        root.quit()

    canvas.bind("<ButtonPress-1>", on_press)
    canvas.bind("<B1-Motion>", on_drag)
    canvas.bind("<ButtonRelease-1>", on_release)
    root.bind("<Escape>", on_escape)
    root.after(50, root.focus_force)
    root.mainloop()
    root.destroy()
    time.sleep(0.25)  # let the compositor actually remove the overlay before we screenshot
    return state["result"]


def plan_points(grid: Region, cols: int, rows: int, snake: bool) -> list[Point]:
    """Cell centres of a cols x rows lattice over `grid`, row-major (boustrophedon if snake)."""
    cw, ch = grid.w / cols, grid.h / rows
    points: list[Point] = []
    for r in range(rows):
        col_order = range(cols) if (not snake or r % 2 == 0) else range(cols - 1, -1, -1)
        for c in col_order:
            points.append(Point(r, c, round(grid.x + (c + 0.5) * cw), round(grid.y + (r + 0.5) * ch)))
    return points


# --------------------------------------------------------------------------- OCR
WIN_TESSERACT_PATHS = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
]


def find_tesseract(explicit: str | None) -> str | None:
    if explicit:
        return explicit if os.path.isfile(explicit) else None
    found = shutil.which("tesseract")
    if found:
        return found
    return next((p for p in WIN_TESSERACT_PATHS if os.path.isfile(p)), None)


def clean_text(raw: str) -> str:
    """Collapse whitespace; join non-empty lines with ' | ' so one capture stays one CSV cell."""
    lines = (" ".join(line.split()) for line in raw.splitlines())
    return " | ".join(line for line in lines if line)


class Ocr:
    """Wrapper over whichever engine is available: 'tesseract', 'winocr' (Windows built-in) or 'none'."""

    def __init__(self, engine: str, lang: str | None, tesseract_cmd: str | None,
                 tesseract_config: str, scale: float, invert: str):
        self.scale, self.invert, self.tesseract_config = scale, invert, tesseract_config
        self.engine = self._resolve(engine, tesseract_cmd)
        self.lang = lang or {"tesseract": "eng", "winocr": "en"}.get(self.engine, "")

    def _resolve(self, requested: str, tesseract_cmd: str | None) -> str:
        problems: list[str] = []
        if requested in ("auto", "tesseract"):
            try:
                import pytesseract

                cmd = find_tesseract(tesseract_cmd)
                if cmd is None:
                    raise FileNotFoundError("tesseract executable not found (install it or pass --tesseract-cmd)")
                pytesseract.pytesseract.tesseract_cmd = cmd
                self._pytesseract = pytesseract
                return "tesseract"
            except Exception as exc:
                problems.append(f"tesseract: {exc}")
                if requested == "tesseract":
                    raise SystemExit("OCR engine unavailable -> " + problems[-1])
        if requested in ("auto", "winocr"):
            try:
                if not IS_WINDOWS:
                    raise RuntimeError("winocr only works on Windows")
                import winocr

                self._winocr = winocr
                return "winocr"
            except Exception as exc:
                problems.append(f"winocr: {exc}")
                if requested == "winocr":
                    raise SystemExit("OCR engine unavailable -> " + problems[-1])
        if requested == "auto":
            print("WARNING: no OCR engine available; screenshots are saved but the 'text' column stays empty.")
            for p in problems:
                print("   ", p)
        return "none"

    def preprocess(self, img):
        from PIL import Image, ImageOps, ImageStat

        g = img.convert("L")
        if self.scale != 1:
            g = g.resize((max(1, round(g.width * self.scale)), max(1, round(g.height * self.scale))), Image.LANCZOS)
        if self.invert == "yes" or (self.invert == "auto" and ImageStat.Stat(g).mean[0] < 128):
            g = ImageOps.invert(g)  # OCR engines prefer dark text on a light background
        return g

    def recognize(self, img) -> str:
        if self.engine == "none":
            return ""
        g = self.preprocess(img)
        if self.engine == "tesseract":
            raw = self._pytesseract.image_to_string(g, lang=self.lang, config=self.tesseract_config)
        else:
            res = self._winocr.recognize_pil_sync(g, self.lang)
            lines = res.get("lines") if isinstance(res, dict) else None
            raw = "\n".join(ln["text"] for ln in lines) if lines else (res["text"] if isinstance(res, dict) else str(res))
        return clean_text(raw)


# ------------------------------------------------------------------ Capture / move
def make_grabber():
    """Returns (mss_instance, grab(region) -> PIL.Image)."""
    import mss
    from PIL import Image

    sct = (getattr(mss, "MSS", None) or mss.mss)()

    def grab(region: Region):
        shot = sct.grab(region.as_mss())
        return Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")

    return sct, grab


def make_mover(duration: float) -> Callable[[int, int], None]:
    import pyautogui

    pyautogui.FAILSAFE = True  # mouse in a screen corner -> FailSafeException
    pyautogui.PAUSE = 0        # we do our own timing via --settle

    def move(x: int, y: int) -> None:
        pyautogui.moveTo(x, y, duration=duration)

    return move


def save_grid_preview(grab, grid: Region, points: list[Point], path: Path) -> None:
    from PIL import ImageDraw

    img = grab(grid)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, grid.w - 1, grid.h - 1), outline="red", width=2)
    for p in points:
        cx, cy = p.x - grid.x, p.y - grid.y
        d.ellipse((cx - 3, cy - 3, cx + 3, cy + 3), outline="red", width=2)
    img.save(path)


def run_sweep(points: list[Point], capture: Region, run_dir: Path, ocr: Ocr, grab, move,
              settle: float) -> int:
    """Move -> wait -> screenshot -> OCR -> CSV row, flushing after every row. Returns rows written."""
    import pyautogui

    shots_dir = run_dir / "screenshots"
    shots_dir.mkdir(parents=True, exist_ok=True)
    csv_path = run_dir / "results.csv"
    total, done, width = len(points), 0, len(str(len(points)))

    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(CSV_COLUMNS)
        try:
            for i, p in enumerate(points, 1):
                move(p.x, p.y)
                time.sleep(settle)
                img = grab(capture)
                name = f"shot_{i:04d}_r{p.row:03d}_c{p.col:03d}.png"
                img.save(shots_dir / name)
                text = ocr.recognize(img)
                writer.writerow([i, p.row, p.col, p.x, p.y, datetime.now().isoformat(timespec="milliseconds"),
                                 f"screenshots/{name}", text])
                f.flush()
                done = i
                preview = text if len(text) <= 70 else text[:69] + "..."
                print(f"[{i:>{width}}/{total}] row {p.row:<3} col {p.col:<3} @ ({p.x},{p.y})  {preview}", flush=True)
        except KeyboardInterrupt:
            print("\nInterrupted (Ctrl+C).")
        except pyautogui.FailSafeException:
            print("\nFail-safe triggered (mouse pushed into a screen corner).")
    return done


# -------------------------------------------------------------------------- CLI
def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="grid_ocr.py",
        description="Sweep the cursor over a grid, screenshot a fixed region after each move, OCR it, log to CSV.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    out = p.add_argument_group("output")
    out.add_argument("--out-dir", type=Path, default=Path("grid_ocr_output"),
                     help="base folder; each run gets its own sub-folder inside it")
    out.add_argument("--run-name", default=None, help="name of that sub-folder (default: run_<timestamp>)")

    g = p.add_argument_group("grid")
    g.add_argument("--cols", type=int, default=10, help="cursor positions across the grid area")
    g.add_argument("--rows", type=int, default=10, help="cursor positions down the grid area")
    g.add_argument("--snake", action="store_true", help="alternate direction on every row (less cursor travel)")
    g.add_argument("--max-screens", type=int, default=100, help="stop after this many screenshots")

    r = p.add_argument_group("regions", "x,y,w,h in screen pixels; anything not given is selected interactively")
    r.add_argument("--grid", type=Region.parse, metavar="X,Y,W,H", help="area the cursor sweeps")
    r.add_argument("--capture", type=Region.parse, metavar="X,Y,W,H", help="area that is screenshotted")
    r.add_argument("--capture-monitor", type=int, metavar="N", help="screenshot a whole monitor (index from --list-monitors)")
    r.add_argument("--regions", type=Path, metavar="FILE", help="regions.json from a previous run")
    r.add_argument("--list-monitors", action="store_true", help="print monitor geometry and exit")

    t = p.add_argument_group("timing")
    t.add_argument("--settle", type=float, default=0.5, help="seconds to wait after each move before the screenshot (tooltip delay)")
    t.add_argument("--move-duration", type=float, default=0.1, help="seconds the cursor takes to travel to each point; 0 = jump")
    t.add_argument("--start-delay", type=float, default=3.0, help="countdown before the sweep starts")

    o = p.add_argument_group("ocr")
    o.add_argument("--ocr", choices=["auto", "tesseract", "winocr", "none"], default="auto",
                   help="auto = tesseract if installed, else Windows built-in OCR (winocr), else none")
    o.add_argument("--lang", default=None, help="OCR language: tesseract style 'eng' / winocr style 'en' (default per engine)")
    o.add_argument("--tesseract-cmd", metavar="EXE", help="path to tesseract executable if it is not on PATH")
    o.add_argument("--tesseract-config", default="--psm 6", help="extra tesseract flags")
    o.add_argument("--scale", type=float, default=3.0, help="upscale factor before OCR; small tooltip text reads better")
    o.add_argument("--invert", choices=["auto", "yes", "no"], default="auto", help="invert dark-background captures before OCR")

    p.add_argument("--dry-run", action="store_true",
                   help="select/print regions, write regions.json and grid_preview.png, but do not move the mouse or capture")

    args = p.parse_args(argv)
    for name in ("cols", "rows", "max_screens"):
        if getattr(args, name) < 1:
            p.error(f"--{name.replace('_', '-')} must be >= 1")
    for name in ("settle", "move_duration", "start_delay", "scale"):
        if getattr(args, name) < 0:
            p.error(f"--{name.replace('_', '-')} must be >= 0")
    return args


def main(argv=None) -> int:
    enable_dpi_awareness()  # before any GUI / screenshot library is imported
    args = parse_args(argv)
    sct, grab = make_grabber()

    if args.list_monitors:
        for i, m in enumerate(sct.monitors):
            label = "all monitors" if i == 0 else m.get("name", "")
            print(f"  monitor {i}: --capture {m['left']},{m['top']},{m['width']},{m['height']}   {label}")
        return 0

    # --- regions: explicit flags > --regions file > --capture-monitor > interactive overlay
    grid, capture = args.grid, args.capture
    if args.regions:
        data = json.loads(args.regions.read_text(encoding="utf-8"))
        grid = grid or Region.from_dict(data["grid"])
        capture = capture or Region.from_dict(data["capture"])
    if capture is None and args.capture_monitor is not None:
        if not 0 <= args.capture_monitor < len(sct.monitors):
            print(f"--capture-monitor must be 0..{len(sct.monitors) - 1} (see --list-monitors)")
            return 2
        m = sct.monitors[args.capture_monitor]
        capture = Region(m["left"], m["top"], m["width"], m["height"])
    if grid is None:
        print("Step 1/2: drag a rectangle over the GRID area the cursor should sweep ...", flush=True)
        grid = select_region("1 / 2   GRID AREA", "the area the cursor will sweep", "#ff5252")
        if grid is None:
            print("Cancelled.")
            return 1
    if capture is None:
        print("Step 2/2: drag a rectangle over the CAPTURE area to screenshot ...", flush=True)
        capture = select_region("2 / 2   CAPTURE AREA", "the area that is screenshotted after every move", "#40c4ff")
        if capture is None:
            print("Cancelled.")
            return 1

    # --- plan
    points = plan_points(grid, args.cols, args.rows, args.snake)
    if len(points) > args.max_screens:
        print(f"NOTE: {args.cols} x {args.rows} = {len(points)} positions, capped by --max-screens to {args.max_screens}.")
        points = points[: args.max_screens]

    run_dir = args.out_dir / (args.run_name or datetime.now().strftime("run_%Y%m%d_%H%M%S"))
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "regions.json").write_text(json.dumps({
        "grid": grid.as_dict(), "capture": capture.as_dict(),
        "cols": args.cols, "rows": args.rows, "snake": args.snake,
    }, indent=2), encoding="utf-8")
    save_grid_preview(grab, grid, points, run_dir / "grid_preview.png")

    print(f"Grid area    : {grid}")
    print(f"Capture area : {capture}")
    print(f"Positions    : {args.cols} x {args.rows}{' (snake)' if args.snake else ''}, capturing {len(points)}")
    print(f"Output       : {run_dir.resolve()}")

    if args.dry_run:
        print("Dry run: planned cursor positions (row, col, x, y):")
        for p in points[:20]:
            print(f"  r{p.row:<3} c{p.col:<3} ({p.x}, {p.y})")
        if len(points) > 20:
            print(f"  ... {len(points) - 20} more")
        print("Nothing moved or captured. Check grid_preview.png in the output folder.")
        return 0

    ocr = Ocr(args.ocr, args.lang, args.tesseract_cmd, args.tesseract_config, args.scale, args.invert)
    print(f"OCR engine   : {ocr.engine}{f' ({ocr.lang})' if ocr.lang else ''}")
    move = make_mover(args.move_duration)

    print("Starting in", end=" ", flush=True)
    for n in range(int(round(args.start_delay)), 0, -1):
        print(n, end="... ", flush=True)
        time.sleep(1)
    print("go.  (Ctrl+C or mouse into a screen corner to abort)", flush=True)

    done = run_sweep(points, capture, run_dir, ocr, grab, move, args.settle)
    status = "complete" if done == len(points) else f"stopped early ({done}/{len(points)})"
    print(f"\n{status}. {done} screenshot(s) + results.csv in {run_dir.resolve()}")
    return 0 if done == len(points) else 3


if __name__ == "__main__":
    sys.exit(main())
