# Third-party technology acknowledgments

[← Repository](../README.md)

The 3D viewer uses the following bundled open-source libraries.

| Library | Bundled version | Role in the viewer | Attribution and license |
|---|---|---|---|
| [Three.js](vendor/three) | 0.185.1 | 3D rendering, glTF loading, camera controls, sky and walking collision utilities | three.js authors · [MIT](vendor/three/LICENSE) |
| [SunCalc](vendor/suncalc) | 2.0.2 | Sun position and sunrise/sunset calculations | Volodymyr Agafonkin · [BSD-2-Clause](vendor/suncalc/LICENSE) |
| [meshoptimizer](vendor/meshoptimizer) | 1.2.0 | Meshopt decoding of compressed model geometry | Arseny Kapoulkine · [MIT](vendor/meshoptimizer/LICENSE.md) |

Bundled version records and original license notices are kept in [vendor/](vendor). Retain those notices when redistributing the bundled code. Update this list when changing a bundled dependency.
