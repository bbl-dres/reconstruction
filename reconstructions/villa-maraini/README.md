# Villa Maraini — Swiss Institute in Rome

Research-stage reconstruction of **Villa Maraini / Istituto Svizzero**, Via Ludovisi 48, 00187 Roma, Italy. Started 8 October 2026 from the shared template and Landgut Lohn evidence workflow.

[Project page](index.html) · [Public status](public/docs/model-status.md) · [Official institute](https://www.istitutosvizzero.it/istituto-svizzero/)

No model has been released. Initial research covers the villa, tower, entrance and immediate garden; architectural/BIM reconstruction is the working direction. A splat needs a suitable image dataset.

- `public/`: publishable status, configuration, profiles and empty model catalog.
- `work/`: private local Git repository, ignored by the parent repository. Start with `work/STATUS.md` and `work/research/README.md`.
- `work/references/incoming/`: add your new references here; its README explains registration.
- `viewer.html`: prepared shared-viewer entry for the first validated release. The gallery opens the research page at `index.html`.

Preview: `python tools/serve.py --building villa-maraini`. After v001 is validated, import it, replace the research entry with the shared-viewer entry, and update the preview. No dimensions, floor heights or model coordinates are assumed.
