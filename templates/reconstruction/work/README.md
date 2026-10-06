# BUILDING-NAME – work folder

Private authoring workspace: gitignored in the public repository, tracked in its own private repository. Layout and rules: [conventions](../../../docs/conventions.md#work-folder); process: [handbook](../../../docs/reconstruction-handbook.md).

## Identity

| Field | Value |
|---|---|
| Building, address | unknown |
| Scope and intended use | unknown |
| Intended state (date) | unknown – name the evidence that defines it |
| Coordinate system | LV95 (EPSG:2056); local origin unknown; model axes unknown; `enuToModelDeg` unknown |
| Heights | datum unknown (LN02 / LHN95); model z = H − origin height |
| Units | metres, 1 Blender unit = 1 m, Z up |
| North | unknown – from a cadastral footprint fit, not from a plan arrow |
| Floor ids | unknown (e.g. `eg` Erdgeschoss, `og1` 1. Obergeschoss, `dg` Dachgeschoss) |
| Current release | none |

## Where to start

| Path | Content |
|---|---|
| [AGENTS.md](AGENTS.md), [STATUS.md](STATUS.md), [HISTORY.md](HISTORY.md), [project.json](project.json) | Rules for agents, current state, release history, machine-readable identity |
| [references/](references/README.md) | Evidence with `manifest.json`; `incoming/` for intake; `catalog/` generated |
| [research/](research/README.md) | Source register, decisions, coverage, measurements; `derived/` for machine-made control data |
| [build/](build/README.md) | Scripts, working model, review output |
| [releases/](releases/README.md) | Frozen packages |
| [archive/](archive/README.md) | Retired public copies and history |

Do not carry over another building's product ids, coordinates, geometry, assumed dimensions or source rights.
