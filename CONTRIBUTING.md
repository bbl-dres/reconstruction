# Contributing

How people and agents work in this repository. Start here, then follow the links.

## What lives where

| Area | Path | Published |
|---|---|---|
| Shared viewer | `viewer/` | yes |
| Pipeline and tools | `tools/` (`model-pipeline/`, `model-checks/`, `reference-catalog/`, `serve.py`) | yes (code only) |
| Shared documentation | `docs/` | yes |
| Gallery | `gallery/`, `index.html` | yes |
| Tests | `tests/` | yes |
| One building | `reconstructions/<id>/` with `public/` (published) and `work/` (private, its own repository) | `public/` only |
| Starter for a new building | `templates/reconstruction/` | yes |

Everything committed here is published on GitHub Pages. Private material – plans, archive drawings, tour imagery, photographs of unclear rights, geodata, traces, native `.blend` files – stays in the building's `work/` folder, which this repository ignores.

## Documentation map

| Read | When |
|---|---|
| [Reconstruction handbook](docs/reconstruction-handbook.md) | Before modelling: phases, build loop, release checklist, roles |
| [Conventions](docs/conventions.md) | Folder layout, names, frames, records, git |
| [Pitfalls](docs/pitfalls.md) | Before modelling and before each release |
| [Adding a building](docs/adding-a-building.md) | Setting up a new building |
| [Agent brief template](docs/agent-brief-template.md) | Starting an agent on a new building |
| [Model handoff](docs/model-handoff.md) | Object properties the viewer and the BIM registry read |
| [Viewer guide](docs/viewer-guide.md) | Running, testing and changing the viewer |

Each building's `work/README.md`, `STATUS.md` and `HISTORY.md` say where that building stands.

## Rules for every change

- Run `git status` before committing; nothing from any `work/` folder may appear.
- Changes to `viewer/`, `tools/` or `docs/` affect every building: run the tests ([viewer guide](docs/viewer-guide.md#verify-changes)) and say in the change which buildings you checked.
- A building's model changes only through a new release of that building (`work/releases/vNNN/`), imported with `tools/model-pipeline/import_versions.py --keep-latest`.
- Agents: no commit, push or deployment in this repository unless the owner asks for it in the session.

## Reviewing a model

1. Run `python tools/serve.py --building <id>` and open the printed address.
2. Check Exterior, Dollhouse (every floor), Section and Walk.
3. Report each finding with mode, floor, the place or a camera link, a screenshot and what is wrong.
4. The modeller answers each finding in the next release report (`work/releases/vNNN/REPORT.md`).
