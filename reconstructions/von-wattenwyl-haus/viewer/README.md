# 4 · HTML viewer

[← Overview](../README.md)

Builds a web viewer from a trained splat, using LichtFeld Studio's HTML export (PlayCanvas SuperSplat viewer). The splat either streams as levels of detail (`--lod`, needs Node.js) or is embedded in the page.

```sh
python make_viewer.py ../lichtfeld/output/full-mrnf-x2/splat_60000.ply --lichtfeld <LichtFeld-Studio.exe> --out output/lichtfeld.html --lod --title "Beatrice von Wattenwyl-Haus · Gaussian splat (LichtFeld)" --note "LichtFeld Studio, 60,000 steps, all 106 positions"
```

```sh
python make_viewer.py ../lichtfeld/output/full-loma-x2/splat_60000.ply --lichtfeld <LichtFeld-Studio.exe> --out output/lichtfeld-loma.html --lod --title "Beatrice von Wattenwyl-Haus · Gaussian splat (LichtFeld, LoMa poses)" --note "LichtFeld Studio, 60,000 steps, all 106 positions, camera poses from COLMAP with LoMa"
```

```sh
python make_viewer.py ../brush/output/full/export_30000.ply --lichtfeld <LichtFeld-Studio.exe> --out output/brush.html --title "Beatrice von Wattenwyl-Haus · Gaussian splat (Brush)" --note "Brush, 30,000 steps, all 106 positions"
```

| Viewer | Splat | Loading |
|---|---|---|
| `output/lichtfeld.html` + `output/lichtfeld/` | LichtFeld, all 106 positions, 60k steps; 2.95 million Gaussians in 6 levels | Streams: 3.4 MB page, 128 MB bundle of which phones load about 42 MB; needs a web server |
| `output/lichtfeld-loma.html` + `output/lichtfeld-loma/` | LichtFeld, all 106 positions, 60k steps, trained on our own COLMAP + LoMa poses ([alignment/README.md](../alignment/README.md#a-splat-trained-on-loma-poses)); 2.98 million Gaussians in 6 levels | Streams like `lichtfeld.html`: 3.4 MB page, 129 MB bundle |
| `output/brush.html` | Brush, all 106 positions, 30k steps; 2.6 million Gaussians | Embedded: 54 MB page; also opens offline by double-click |

The LichtFeld viewers are visibly sharper at capture positions (panelling, chandeliers, furniture) than the Brush one, and the LoMa-posed one sharper again (1.3 dB better against the photos). `../index.html` opens `lichtfeld-loma.html`, else `lichtfeld.html`, else `brush.html` (also when the page is opened from disk). All three are committed and published on GitHub Pages. Measurements and background: [docs/viewer.md](../docs/viewer.md).

## What `make_viewer.py` changes

- **Orientation.** The viewer's loader hard-codes a 180° roll for COLMAP-style worlds; the `<pc-entity name="splat">` in the markup is only a placeholder. Matterport worlds are Z-up, so the loader's rotation is replaced by −90° about X.
- **Start camera.** Moved from outside the scene to the best-connected capture position, looking towards its farthest neighbour: splats are sharpest along long sightlines.
- **Page buttons** from [`overlay.html`](overlay.html), styled like the Bundeshaus viewer: **Help** (the house, what to expect from a splat, controls, splat count and `--note`), **View on GitHub** and **All reconstructions**. The overlay carries the MIT notice of the bundled PlayCanvas code.
- **Loading card** like the Bundeshaus one, shown within a second. For an embedded splat, LichtFeld's export would show nothing until the whole page had arrived, because the splat sits in the page head; it is moved into about 1 MB script chunks at the end of the page, each reporting download progress. For a streamed splat, the card follows the viewer's own loading. An interrupted download or a browser without WebGL 2 shows a message.
- **Phones:** touch screens start in low quality (one render pixel per CSS pixel); in fly mode one finger looks around anywhere (it was a move joystick on the left half), pinching moves forward and back, and the look rate no longer depends on the frame rate. Buttons are icon-only below 1200 px and Help scrolls by touch.
- **Double tap to walk:** in the walking (fly) camera a double tap or double-click walks to the spot: the floor to stand on it at eye height, a wall or picture to walk up to it (0.6 m in front), at most 10 m per tap; where the splat gives no surface, 3 m in the tapped direction. It used to switch to the orbit camera. Double taps count within 24 px on touch (8 px before). A tip after the first frame says how to move, once per browser.
- **Streaming fixes:** desktops now switch to the finer levels after the first frame, and data that arrives after the camera stops is drawn.

## Levels of detail (`--lod`)

[PlayCanvas splat-transform](https://developer.playcanvas.com/user-manual/splat-transform/streamed-sog/) (run with `npx`, pinned to 3.9.0) crops Gaussians more than 10 m outside the capture positions, decimates the splat to 60, 35, 15, 6 and 2.5 % and writes a streamed SOG bundle in a folder named like the page (`output/lichtfeld/`). The viewer loads the coarse levels first and refines them: levels 0–2 on desktops, 2–5 on phones (at most 1.05 million Gaussians). LichtFeld provides the viewer page, converted from the coarsest level in seconds. A full build takes about 7 minutes.

splat-transform applies `-B` crops in PlayCanvas space, the PLY turned 180° about Z, so `make_viewer.py` converts the box accordingly.

## Update an existing viewer

Pass the HTML instead of a splat to apply the current overlay and fixes without converting again (for a streamed viewer, the bundle stays as it is). The viewer keeps its camera, title and note unless `--sweep`, `--fov`, `--title` or `--note` is given:

```sh
python make_viewer.py output/lichtfeld.html
python make_viewer.py output/brush.html
```

Options: `--sweep N` starts at another panorama position, `--fov` sets the vertical field of view (default 70°), `--title` the page title, `--note` the line shown after the splat count in Help.

Tested in Edge with phone emulation (390 × 664 and 320 × 568, touch); not yet on a real phone. To test on one, see [docs/viewer.md](../docs/viewer.md#testing-on-a-real-phone).
