"""OCR Google Earth status-bar crops (lat DMS, lon DMS, elevation) from sub-folders into one CSV.

usage: python -I ocr_coords.py <root_folder> --out <csv_path>
"""
import argparse
import csv
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageOps, ImageStat
import winocr

# deg, min, sec. Windows OCR reads the degree sign as a literal "0" (41054' for 41°54'), so the
# degree separator is "°"/"º" or a single "0"; the other separators are 1-3 non-digit characters.
_DMS = r"(\d{1,3})(?:[°º]|0)\s*(\d{1,2})\D{1,3}(\d{1,2}[.,]\d{1,3})\D{0,3}"
PATTERN = re.compile(_DMS + r"([NS])\D{1,4}" + _DMS + r"([EW])\D{1,4}(-?\d{1,5})\s*m?", re.I)
# letter O next to a digit or decimal point is a misread zero ("15.OO" -> "15.00")
_O_AS_ZERO = re.compile(r"(?<=[\d.,])[Oo]|[Oo](?=[\d.,])")


def normalize(text: str) -> str:
    prev = None
    while prev != text:
        prev, text = text, _O_AS_ZERO.sub("0", text)
    return text

COLUMNS = ["folder", "longitude", "latitude", "elevation_m", "longitude_dms", "latitude_dms",
           "status", "file", "captured_at", "ocr_text"]


def preprocess(img: Image.Image, scale: int = 4) -> Image.Image:
    g = img.convert("L").resize((img.width * scale, img.height * scale), Image.LANCZOS)
    if ImageStat.Stat(g).mean[0] < 128:
        g = ImageOps.invert(g)
    return g


def ocr(img: Image.Image) -> str:
    res = winocr.recognize_pil_sync(preprocess(img), "en")
    lines = res.get("lines") or []
    text = " ".join(ln["text"] for ln in lines) if lines else res.get("text", "")
    return " ".join(text.split())


def to_decimal(deg: str, minute: str, sec: str, hemi: str) -> float:
    value = int(deg) + int(minute) / 60 + float(sec.replace(",", ".")) / 3600
    return round(-value if hemi.upper() in "SW" else value, 6)


def parse(text: str):
    m = PATTERN.search(normalize(text))
    if not m:
        return None
    la_d, la_m, la_s, la_h, lo_d, lo_m, lo_s, lo_h, elev = m.groups()
    la_s, lo_s = la_s.replace(",", "."), lo_s.replace(",", ".")
    if not (0 <= int(la_m) < 60 and 0 <= int(lo_m) < 60 and float(la_s) < 60 and float(lo_s) < 60):
        return None
    return {
        "latitude": to_decimal(la_d, la_m, la_s, la_h),
        "longitude": to_decimal(lo_d, lo_m, lo_s, lo_h),
        "elevation_m": int(elev),
        "latitude_dms": f"{int(la_d)}°{int(la_m):02d}'{float(la_s):05.2f}\"{la_h.upper()}",
        "longitude_dms": f"{int(lo_d)}°{int(lo_m):02d}'{float(lo_s):05.2f}\"{lo_h.upper()}",
        "_key": (int(la_d), int(la_m), la_h.upper(), int(lo_d), int(lo_m), lo_h.upper()),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    files = sorted(args.root.rglob("*.png"), key=lambda p: (p.parent.name, p.stat().st_mtime, p.name))
    rows = []
    for p in files:
        text = ocr(Image.open(p))
        parsed = parse(text)
        row = {
            "folder": p.parent.name, "file": p.name, "ocr_text": text,
            "captured_at": datetime.fromtimestamp(p.stat().st_mtime).isoformat(timespec="seconds"),
            "longitude": "", "latitude": "", "elevation_m": "", "longitude_dms": "", "latitude_dms": "",
            "status": "UNPARSED", "_key": None,
        }
        if parsed:
            row.update(parsed)
            row["status"] = "ok"
        rows.append(row)

    # Every crop is from one site: deg/min/hemisphere must match the majority, elevation must be sane.
    keys = Counter(r["_key"] for r in rows if r["_key"])
    expected = keys.most_common(1)[0][0] if keys else None
    for r in rows:
        if r["status"] == "ok" and (r["_key"] != expected or not 0 <= r["elevation_m"] <= 3000):
            r["status"] = "CHECK"

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    counts = Counter(r["status"] for r in rows)
    print(f"{len(rows)} files -> {args.out}   {dict(counts)}   site key {expected}")
    for r in rows:
        flag = "" if r["status"] == "ok" else f"  <-- {r['status']}"
        print(f"{r['folder']:17} {r['file']:15} {r['latitude']!s:>10} {r['longitude']!s:>10} "
              f"{r['elevation_m']!s:>4}  | {r['ocr_text']}{flag}")
    return 0 if counts.get("ok") == len(rows) else 1


if __name__ == "__main__":
    sys.exit(main())
