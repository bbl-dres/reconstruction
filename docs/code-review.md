# Code review: gallery and building viewer (October 2026)

A senior review of the gallery (`index.html`, `gallery/`), the shared Three.js viewer (`viewer/`) and the parts of the splat viewer overlay they share. It looked for errors first, then robustness, then code that could be merged into reusable functions and modules, plus accessibility, internationalisation, performance and security.

**Method.** Five reviewers read the code in parallel, each covering one area: both halves of `viewer/js/main.js`, the rendering modules, the data, loading and walking modules, and the gallery with the shared UI. Every finding was checked against the code, and many against the real models in headless Edge. The fixes keep the 3D viewer's interface pixel-identical to its earlier screenshots on desktop and phone. The suite grew from 127 to 131 tests, and all pass.

**Status.** All errors found are fixed except one deferred near-plane item (see Deferred). Most robustness and duplication findings are fixed too. The larger restructurings are listed under [Deferred](#deferred), each with a reason.

## Errors fixed

| Area | What went wrong | Fix |
|---|---|---|
| Loading | The surroundings, which often finish first, rendered around the loading card before the building, and could be orbited | Nothing is drawn before both are presented (`main.js` render gate) |
| Loading | A link's `muted` and `surroundings` switches applied after the surroundings had loaded with the stored look | `applyLinkSettings` runs before anything loads |
| Selection | The highlight kept the clipping it was created with: switching to Floor plan drew the cut-away part over the plan, and back again only part of it | Overlay materials copy the element's clipping before each draw (`inspection.js`, tested) |
| Walk | The drop from a raised view landed on ceilings hidden in Dollhouse (about a quarter of Bundeshaus drops) | Ceilings and roofs are no longer Bundeshaus walking surfaces; a jump never reaches them |
| Walk | The worker's collision world reuses its triangles, so floor checks read a wall instead (161 of 2,891 standing positions misjudged) | `Walker.ground()` reads the slope at once; four probes now share it (tested against Three's Octree) |
| Walk | The terrain never joined walking when the surroundings finished during collision preparation | The terrain is prepared whenever walking surfaces exist or are being prepared |
| Walk | Walk or Fly chosen during preparation snapped to an old position, and after a failure did nothing | The choice restarts or joins the preparation, which applies it when ready |
| Walk | A link more than 10 km out reset the walker every frame | The reset distance is measured from the last place stood on |
| Walk | Fly links and reloads dropped the visitor to the ground | `view=fly` keeps flight |
| Links | `?view=constructor` disabled the controls; a floor-plan link for a model with no named floors left the level undefined | Only own keys are read; one `defaultPlanLevel()` |
| Keyboard | Escape closed the inspector together with an open menu; `+` and `-` did not zoom on Swiss, German, French or Italian layouts, nor in Walk | Escape leaves menus alone; zoom keys use the typed character |
| Tree | Hide or Isolate moved focus to the label, so Enter could not undo; "More…" scrolled back about 50 rows | Focus returns to the same control; "More…" focuses the first new row |
| Tree | Hide and Isolate on a storey were lost when the BIM registry replaced the first tree | Storey IDs carry over |
| Places | "Saved places are unavailable" was overwritten with "This version has no saved places" | `renderPlaces` is the only writer of the note |
| Places | A site view clicked while the surroundings were being prepared framed only the building | Waits for prepared surroundings |
| Menus | Clicked before the page wired them, popovers opened invisibly and then at the wrong place | Already-open popovers are placed and marked when wired; the gallery wires them first |
| Menus | Without the Popover API, Help from the More menu closed at once and the More menu's tidying never ran | The opener is not an outside click; closing dispatches `toggle` |
| Lighting | The sun crossing the horizon switched `castShadow`, recompiling every material | `castShadow` stays constant; intensity and fitting follow the sun |
| Framing | Home and Zoom to used different lens formulas; links with zoom framed wrongly | One `fitDistance()` at the effective field of view |
| Gallery map | The Beatrice von Wattenwyl-Haus label covered the Bundeshaus marker: it could not be clicked | Each label points away from its nearest neighbour |
| Gallery map | A basemap failure was silent, a failure message never cleared, and a map created while hidden fitted a 0 px view | Style errors are reported, success clears them, the first visible show fits |
| Gallery | Without its translation file the whole page stayed empty | English fallback for runtime text; cards still render |
| Splat viewers | Dropdowns were 14 px too wide (no box sizing on the LichtFeld page) | `app-tools.css` sets its own box sizing |
| Security | `building.json` paths with backslashes or `%2e%2e` resolved to other origins; the about page is injected as HTML | Paths are resolved and compared with the building folder (tested) |
| Start | A missing optional `about.html` stopped the viewer; on `file://` no message appeared in Chromium | The about page is optional; a classic inline script shows the local-server note |
| Messages | Visitors saw raw English exception text (WebGL, workers, Safari's "Load failed") | Errors carry a translation key; details go to the console |
| Models | A multi-material placement with child placements lost its metadata; grey surroundings dropped cut-outs and polygon offsets | Child placements stay attached; the muted material keeps alpha test, alpha map and offsets |

## Robustness, accessibility and performance

- **Rendering.** Walk and Fly redraw only when the camera moves, not every frame. Instance batches re-upload only when their visible members change. (The Floor plan cut-height slider was later removed: Floor plan cuts at a fixed 1 m above the chosen level and fits that level when chosen.)
- **Collision preparation.** It yields every 12 ms rather than every 8 meshes, because background tabs clamp timers to about a second. Plain position arrays are copied in one go.
- **Live regions.**
  - Status lines are rewritten only when their text changes.
  - The loading card announces its changing line, not the whole card at every 5 %.
- **Focus.** It stays on the page when a control hides itself: Show all, Retry surroundings, Copy view link, and the phone sheet closing.
- **ARIA.**
  - `aria-haspopup="true"` (a menu) is gone from popups that are groups.
  - Hide no longer says both "Show" and "pressed".
  - The gallery's Help takes focus.
  - Map popups close with Escape, return focus to their marker, name their link and translate their close button.
- **Edge cases.**
  - The tree filter is safe before the tree exists.
  - The BIM registry is adopted only after its tree builds.
  - A touch/mouse change refreshes the pad and hints.
  - Turning the surroundings off while they load opens the building at once.
  - The view aspect never divides by zero.
- **Cache-busting.** A new test checks that every importer of a module uses the same `?v=` query. Two queries make two module instances with separate state, and two such cases existed (`daylight.js` and the collision worker).
- **Gallery.** The first row of preview images loads eagerly, the first one with high priority.

## Duplication merged

| Now one | Replaces |
|---|---|
| `prepareAsset()`, `disposeSurroundings()` | Building and surroundings preparation and teardown written out twice |
| `fitDistance()` (`view-navigation.js`) | Three copies of the lens formula (Home, Zoom to, shadow coverage) |
| `materialsOf()`, `isShown()` (`scene-utils.js`) | Five array normalisations and two parent-visibility walks |
| `Walker.ground()` | Four floor probes in `walking.js` |
| `defaultPlanLevel()` | Plan level choice in `main.js` and `view-url.js` |
| `setViewerControlsEnabled()`, `useCameraFor()`, `applyLinkSettings()`, `isCurrentWalk()`, `resetLightingControls()`, `showBrightness()`, `findProperty()`, `selectedNode()`, `rowFor()`, `setText()` | Repeated snippets in `main.js`, including two disagreeing sets of lighting defaults |
| Notice owners (`notify(…, owner)`, `clearNotice(owner)`) | Notices matched by their translated text |
| Loading card in `app-tools.css` | Near-identical cards in `main.css` and the splat overlay, already drifting |

Removed dead code:

- In `main.js`: the unreachable `file://` branches, the unused `resetView` parameter, the internal `state.walkPad` and a redundant surroundings call.
- The identity `packCollision`.
- A no-op `updateMatrixWorld`.
- The English string returned by `Walker.update`.

The More menu's styles moved back to `main.css`, since only the 3D viewer has that menu.

## Deferred

| Item | Why deferred |
|---|---|
| Split `main.js` (about 1,800 lines) into tree, inspector, lighting-panel and keyboard modules | Worth doing, but a large move best done on its own, with tests for the extracted pure parts |
| Viewer-generated inspector and tree labels ("Family", "Assembly", "Unnamed type", "Building") are English, and properties are matched by English label | Needs a stable `key` per property in `bim-registry.js` and `model-metadata.js`; a schema-level change |
| `Daylight` refits shadows that `main.js` also fits, and restores a studio pose `setStudioSun` overwrites | A lighting refactor without a visible fault; needs its own visual check |
| The orbit camera keeps `near = 0.08` while `far` grows to kilometres, so distant terrain may z-fight | Needs a dynamic near plane, checked against the site views |
| The splat overlay re-implements i18n, popover placement and tabs inline | The splat pages must open from disk, where modules cannot load. `make_viewer.py` could inline the real modules instead |
| The toolbar markup and strings exist three times (gallery, viewer shell, overlay) | A shared partial loaded by `boot.js` and inlined by `make_viewer.py`, or a parity test |
| `renderTree` rebuilds up to 500 rows on every pick; `placeInspector` reads layout every frame | Noticeable only on large trees or slow phones |
| Validators (vectors, slugs, legacy levels) in four modules; `escapeHTML` and storage wrappers twice | Small; best merged with the `main.js` split |
| The gallery's inline CSS still has a few colours without tokens; its view toggle could reuse `.segmented` | Cosmetic |
| `walkStarts` in `building.json` is validated but no longer used by the viewer | Kept as reference standing points; tests use the Bundeshaus policy's starts |
| No `webglcontextrestored` handling | The error card already offers a reload |

## Decided as designed

- With nothing below the camera, Walk stays in flight silently rather than showing a notice.
- The terrain stays walkable while the surroundings are hidden, so a visitor outside the building never falls out of the world.
