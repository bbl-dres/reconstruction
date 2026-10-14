# Contributing

How people and agents work in this repository.

Everything committed here is published on GitHub Pages. Private material (plans, archive drawings, tour imagery, photographs of unclear rights, geodata, traces, native models) stays in each building's `work/` folder, which this repository ignores and which is tracked in its own private repository.

## Documentation

| Read | For |
|---|---|
| [Handbook](docs/handbook.md) | Structuring a reconstruction model, whatever the engine: goals, principles, phases, model structure, detail and accuracy, evidence and provenance, checks, review rounds, release, folders and names, pitfalls. Engine operations are in [tools/revit](tools/revit/README.md) and [tools/model-checks](tools/model-checks/README.md) |
| [Viewer](docs/viewer.md) | Using, testing and changing the viewer, and the model contract it reads: object properties, `viewer.json`, `bim.json`, IFC |
| [Sources](docs/sources.md) | Where evidence and geodata come from |
| [Candidates](docs/candidates.md) | Shortlist of further buildings |

Each building's `work/AGENTS.md` and `work/LOG.md` say where it stands; a new building starts from `reconstructions/_template/`.

## Rules for every change

- Run `git status` before committing; nothing from any `work/` folder may appear.
- Changes to `viewer/`, `tools/` or `docs/` affect every building: run the [tests](docs/viewer.md#verify-changes) and say which buildings you checked.
- A building's published model changes only through a new release of that building, imported into its `public/models/` with one version in the catalog.
- Agents: no commit, push or deployment unless the owner asks for it in the session.

To review a model in the viewer, follow [reviewing in the viewer](docs/handbook.md#review-rounds).
