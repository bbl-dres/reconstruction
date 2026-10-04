# Web viewer

[← Findings](README.md)

Which viewer we publish, what was wrong with it on phones, what `viewer/make_viewer.py` changes, and what could come next. October 2026.

## Summary

- **The viewer is not custom.** It is LichtFeld Studio's HTML export: PlayCanvas's open-source [SuperSplat Viewer](https://github.com/playcanvas/supersplat-viewer) 1.9.0 on PlayCanvas Engine 2.13.6 (both MIT). `make_viewer.py` patches it.
- **The published LichtFeld viewer now streams levels of detail.** Phones draw at most about 1 million Gaussians instead of 3 million, and the first view appears after 42 MB instead of 62 MB.
- **Touch navigation is fixed:** one finger looks around anywhere, pinching moves forward and back, at the same speed whatever the frame rate.
- **Not yet tested on a real phone.** All measurements below are from Edge with phone emulation on the laptop.

## What is published

| Page | Splat | Loading |
|---|---|---|
| `viewer/output/lichtfeld.html` + `lichtfeld/` | LichtFeld, all 106 positions, 60k steps; 2.95 million Gaussians in 6 levels | Streams levels of detail; needs a web server |
| `viewer/output/lichtfeld-loma.html` + `lichtfeld-loma/` | LichtFeld, all 106 positions, 60k steps, on our own LoMa poses (fits the photos 1.3 dB better); 2.98 million Gaussians in 6 levels | Streams levels of detail like the above |
| `viewer/output/brush.html` | Brush, 30k steps, all 106 positions; 2.6 million Gaussians | Embedded (54 MB page); also opens offline by double-click |

`../index.html` opens `lichtfeld-loma.html`, else `lichtfeld.html`, else `brush.html`.

## Problems found and fixes

| Problem | Cause | Fix in `make_viewer.py` |
|---|---|---|
| Splat upside down, start view outside the house | The export assumes a COLMAP-style world | Rotate −90° about X; start at the best-connected capture position, looking down the longest sightline |
| Blank page for the whole download | LichtFeld puts the splat (58 MB of base64) in the page head, so nothing renders until it has arrived | Buttons and a loading card at the top of the page; the embedded splat moved into about 1 MB script chunks at the end, each reporting progress. The card appears within a second |
| Slow on phones | 3 million Gaussians with full view-dependent colour (SH degree 3), drawn at the full device pixel ratio (up to 9× the pixels) | Touch screens start in low quality (one render pixel per CSS pixel); the LichtFeld viewer streams levels of detail (below) |
| Fly mode "pans" instead of looking around | On touch screens the left half of the screen was a joystick that moved the camera; only the right half looked around | One finger looks around anywhere; no looking around while two fingers pinch |
| No way to move forward on touch in fly mode | Pinch only zoomed in orbit mode | Pinching moves forward and back, 1 cm per pixel of finger spread |
| Erratic turning on slow phones | The look rate was multiplied by the frame time, so a slow frame turned the camera several times as far | Touch look is per pixel: 1.5 × the field of view per screen height |
| A double tap threw users into a different camera | The viewer's double tap picks a point and switches to the orbit camera; one finger then orbits that point instead of looking around | In the walking camera a double tap (or double-click) walks there: the floor to stand on it at eye height (the height changes only for floors more than 0.35 m higher or lower: stairs, not noise), a wall or picture to walk up to it, stopping 0.6 m in front; at most 10 m per tap; the view direction stays; no glide with reduced motion. The orbit camera keeps its double tap |
| Some double taps did nothing | Both taps had to land within 8 px, and the picker finds no surface where the splat is thin, often the floor close by | 24 px for fingers; without a surface, 3 m in the tapped direction |
| Nobody finds the gestures | They were only described in Help | A tip after the first frame, once per browser: "Drag to look around · Double-tap to walk there · Pinch to step" (desktop: double-click, WASD). It lets touches through to the house and goes on a double tap, when Help opens, after 10 s or with its close button |
| Desktops never loaded the finer levels | The viewer switched to the desktop's level range inside an event; the engine clears its change flag at the end of that frame | Switch the range after the frame |
| Data arriving after the camera stopped was not drawn | The viewer renders only on demand | Keep rendering while levels load or sort |

Measured on the patched viewer (phone emulation): an 80 px one-finger swipe on the left half turns the camera 12.7° left without moving it; spreading two fingers by 120 px moves it 1.2 m forward without turning. A double tap on the floor walks 2.7 m (where no surface was found: the fallback) or 4.6 m (double-click on desktop), on an enfilade 10 m (the limit), on a wall 2.5 m, all at the same height; afterwards one finger still only turns the view.

**Considered and left out:** touch-and-hold to walk forward. Many people press, pause and then drag to look around; holding would start them walking unintentionally. Hold-then-drag keeps looking around, and walking stays on the double tap and the pinch.

## Streamed levels of detail

[PlayCanvas splat-transform](https://developer.playcanvas.com/user-manual/splat-transform/streamed-sog/) 3.9.0 decimates the trained splat into lighter levels (sizes below are from the holdout splat; the published full-run bundle is the same size) and writes them as a streamed SOG bundle (`lod-meta.json` plus chunks). The viewer picks a level per region by distance (thresholds 5, 10, 15 … m) within a range: levels 0–2 on desktops, 2–5 on phones, with regions behind the camera made coarser. Gaussians more than 10 m outside the capture positions (floaters) are cropped first.

| Level | Share | Gaussians | Bundle size |
|---|---|---|---|
| 0 | 100 % | 2,951,815 | 58.6 MB |
| 1 | 60 % | 1,800,000 | 36.6 MB |
| 2 | 35 % | 1,050,000 | 20.5 MB |
| 3 | 15 % | 450,000 | 9.1 MB |
| 4 | 6 % | 180,000 | 5.2 MB |
| 5 | 2.5 % | 75,000 | 3.6 MB |

Loading at a throttled 4 MB/s (Edge; desktop 1280 × 800 and iPhone 13 emulation):

| Viewer | First view | Downloaded by then | Total |
|---|---|---|---|
| Embedded LichtFeld (before) | 19 s | 62 MB | 62 MB |
| Embedded Brush | 15 s | 54 MB | 54 MB |
| Streamed LichtFeld, phone | 11 s | 42 MB | 42 MB |
| Streamed LichtFeld, desktop | 11 s | 42 MB | 102 MB after 31 s (full detail nearby) |

Without throttling, the first view appears after about 1.3 s.

**Why the first view still needs 42 MB.** splat-transform packs up to 512,000 Gaussians per file by default, so levels 2–5 are five files covering the whole house, and the viewer loads them all before the first view. View-dependent colour (SH bands 1–3) is 48 MB of the 128 MB bundle, and every file carries its own 2.4 MB colour palette, so simply making files smaller would add overhead.

**Quality cost of less view-dependent colour** (the 60k splat reduced with splat-transform `-H`, scored as in [splat-quality.md](splat-quality.md)):

| SH degree | PLY size | Held-out PSNR / SSIM | Capture positions PSNR / SSIM |
|---|---|---|---|
| 3 (trained) | 744 MB | 16.55 dB / 0.617 | **26.88 dB / 0.816** |
| 1 | 312 MB | **16.61 dB / 0.620** | 24.03 dB / 0.789 |
| 0 | 204 MB | 16.37 dB / 0.619 | 22.93 dB / 0.777 |

SH degree 3 carries much of the look of each panorama: dropping it costs 2.9–4.0 dB at the capture positions, while views between positions are unchanged. So it should stay for desktops.

**Next optimisations, not yet tried:**
- SH degree 1 for levels 2–5 only (what phones draw), if the viewer accepts mixed degrees across levels, with smaller files for those levels so that phones fetch only nearby regions.
- A newer SuperSplat Viewer, which uses a Gaussian budget per device (1–2 million on phones) and WebGPU rendering where available; our patches would need porting.

## Navigation for this capture

The splat is sharp at the 106 capture positions and foggy between them. Navigation that moves between positions, like Matterport's, would suit it best: tap a floor marker to glide to the next position, drag to look around, pinch to change the field of view, and switch floors. Everything needed is in the archive (positions, floors, links between neighbouring positions). It would need our own navigation code, see the options below.

## Options considered

| Option | Phone performance | Phone navigation | Effort | Status |
|---|---|---|---|---|
| A. Keep the SuperSplat Viewer, stream levels of detail | Large gain | Fixed by patches | 1–2 days | **Done** |
| B. Own app on the PlayCanvas engine (MIT, no build step needed) | Best (WebGPU path) | Fully ours | 1–2 weeks | Option |
| C. Bundeshaus three.js shell plus [Spark 2](https://github.com/sparkjsdev/spark) (MIT), streaming LichtFeld's `.rad` export | Large gain | Fully ours, shared with the Bundeshaus viewer | 2–3 weeks | Option |
| D. three.js r186 built-in Gaussian splats | No streaming; full speed only with WebGPU | | | Not suitable yet |
| E. Own splat renderer | Months to match PlayCanvas or Spark | | | Not worth it |

A basic splat renderer is about 1,000 lines; what makes phones fast (levels of detail, streaming, compressed formats, GPU sorting) is what PlayCanvas and Spark already provide.

## Hosting

- **GitHub Pages** serves the viewers. Files must stay under 100 MB (GitHub warns above 50 MB). Every rebuild adds the new files to the repository history for good, so rebuild and commit sparingly.
- **[Splat Labs](https://www.splatlabs.ai/)** hosts and shares finished splats; it does not train them. It accepts `.ply`, `.splat`, `.ksplat` and XGRIDS `.lcc`/`.lcc2`, up to 500 MB on the free plan, 2 GB on Starter (USD 12/month) and 5 GB on Business (USD 58/month). Our 60k splat is 744 MB as PLY, or about 200 MB with SH degree 0. It is run by Rock Robotic (US) and offers EU (Frankfurt) storage. Its [floor plan generator](floor-plans.md) produces styled pictures, not measured plans.

## Testing on a real phone

- On GitHub Pages, once committed and pushed.
- Locally, from the repository root: `python -m http.server 8000 --bind 0.0.0.0`, then open `http://<laptop IP>:8000/reconstructions/von-wattenwyl-haus/` on a phone in the same Wi-Fi (the Windows firewall may ask to allow Python).
- To see errors on the phone: Safari's Web Inspector on a Mac for iPhones, `chrome://inspect` for Android phones over USB.
