# grid-ocr

Sweeps the mouse cursor over a grid of screen positions, screenshots a fixed
region after every move, OCRs the screenshot, and writes everything to a CSV.

Built for the "hover over a chart / map / heatmap and read the value that
appears in a fixed place" job. Everything is a command-line flag; the two
rectangles (where to sweep, what to screenshot) are drawn with the mouse.

## Install

```powershell
python -m pip install -r requirements.txt
```

OCR engine, picked automatically in this order:

1. **Tesseract** if the binary is installed. Best accuracy, many languages.
   `winget install UB-Mannheim.TesseractOCR` (or the installer from
   https://github.com/UB-Mannheim/tesseract/wiki). The script looks on `PATH`
   and in the usual `Program Files` folders; otherwise pass `--tesseract-cmd`.
2. **Windows built-in OCR** via the `winocr` package. No extra install, fast,
   good on UI text. Uses the OCR language packs Windows has installed
   (Settings > Time & Language > Language > Options > Language features).
3. Nothing: screenshots are still saved, the `text` column stays empty.

Force one with `--ocr tesseract|winocr|none`.

## Run

```powershell
python grid_ocr.py --out-dir D:\captures
```

1. A dark overlay covers the screen(s). Drag a rectangle over the **grid area**
   the cursor should sweep. Esc cancels.
2. A second overlay. Drag a rectangle over the **capture area** to screenshot
   (for example the readout at the bottom-right of the screen).
3. After a 3 second countdown the sweep runs. Keep your hands off the mouse.
   Abort with Ctrl+C in the console, or by pushing the mouse into a corner of
   the primary screen (pyautogui fail-safe).

Output lands in `D:\captures\run_<timestamp>\`:

| file | content |
|---|---|
| `results.csv` | `index,row,col,cursor_x,cursor_y,timestamp,screenshot,text` (one row per screenshot, flushed as it goes, so an aborted run keeps its rows) |
| `screenshots/shot_0001_r000_c000.png` | the capture area after each move |
| `regions.json` | the two rectangles, reusable with `--regions` |
| `grid_preview.png` | the grid area with every planned cursor position marked, so you can check the sampling before trusting a run |

`text` has whitespace collapsed and lines joined with ` | `. The CSV is UTF-8
with BOM so Excel opens it correctly.

## Options

| flag | default | meaning |
|---|---|---|
| `--out-dir` | `./grid_ocr_output` | base folder; each run gets a sub-folder |
| `--run-name` | `run_<timestamp>` | name of that sub-folder |
| `--cols`, `--rows` | 10, 10 | cursor positions across / down the grid area (cell centres) |
| `--max-screens` | 100 | hard cap on screenshots; extra grid positions are skipped with a note |
| `--snake` | off | alternate direction every row (less cursor travel) |
| `--settle` | 0.5 s | wait after each move before the screenshot; raise it if tooltips lag |
| `--move-duration` | 0.1 s | cursor travel time; 0 jumps instantly, but some apps need real motion to register a hover |
| `--start-delay` | 3 s | countdown before the sweep |
| `--grid X,Y,W,H` | interactive | sweep area in screen pixels |
| `--capture X,Y,W,H` | interactive | screenshot area in screen pixels |
| `--capture-monitor N` | | screenshot a whole monitor (`--list-monitors` prints indices and coordinates) |
| `--regions FILE` | | reuse `regions.json` from an earlier run; explicit `--grid`/`--capture` still win |
| `--ocr` | auto | `auto`, `tesseract`, `winocr`, `none` |
| `--lang` | per engine | `eng` style for Tesseract, `en` style for winocr |
| `--scale` | 3 | upscale factor before OCR; small tooltip text reads much better upscaled |
| `--invert` | auto | invert dark-background captures (light text on dark tooltip) before OCR |
| `--tesseract-config` | `--psm 6` | Tesseract page-segmentation flags; `--psm 7` for a single line |
| `--dry-run` | | select regions, write `regions.json` + `grid_preview.png`, move and capture nothing |

### Examples

```powershell
# 20 x 5 sweep, bottom-right readout, 0.8 s hover time, into a named folder
python grid_ocr.py --out-dir D:\captures --run-name heatmap-a --cols 20 --rows 5 --settle 0.8

# Reuse the rectangles from a previous run, no clicking needed
python grid_ocr.py --regions D:\captures\heatmap-a\regions.json --cols 20 --rows 5

# Fully scripted
python grid_ocr.py --grid 400,300,1600,900 --capture 3300,1450,500,120 --cols 16 --rows 9 --max-screens 144

# Sanity-check the sampling positions without touching the mouse
python grid_ocr.py --grid 400,300,1600,900 --capture 3300,1450,500,120 --dry-run
```

## Notes

- All coordinates are physical pixels. The script makes itself DPI-aware
  before loading any GUI or screenshot library; on a 125 % scaled 3840 x 1600
  display an unaware process would see 3072 x 1280 and every rectangle would
  land in the wrong place.
- Multi-monitor works: the overlay spans all monitors, and negative
  coordinates (a monitor left of or above the primary) are fine.
- The screenshot never includes the cursor, so the capture area may overlap
  the grid area.
- If OCR output is noisy, look at a few PNGs in `screenshots/`, then adjust
  `--scale`, `--invert`, or (Tesseract) `--tesseract-config "--psm 7"`.
  Tight capture rectangles around just the text give the best results.
