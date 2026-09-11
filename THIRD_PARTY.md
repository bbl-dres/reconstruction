# Third-party technology acknowledgments

[← Project overview](README.md)

The 3D viewer uses the following bundled open-source libraries.

| Library | Bundled version | Role in the viewer | Attribution and license |
|---|---|---|---|
| [Three.js](public/vendor/three) | 0.185.1 | 3D rendering, glTF loading, camera controls, sky and walking collision utilities | three.js authors · [MIT](public/vendor/three/LICENSE) |
| [SunCalc](public/vendor/suncalc) | 2.0.2 | Sun position and sunrise/sunset calculations | Volodymyr Agafonkin · [BSD-2-Clause](public/vendor/suncalc/LICENSE) |
| [meshoptimizer](public/vendor/meshoptimizer) | 1.2.0 | Meshopt decoding of compressed model geometry | Arseny Kapoulkine · [MIT](public/vendor/meshoptimizer/LICENSE.md) |

Bundled version records and original license notices are kept in [public/vendor](public/vendor). Retain those notices when redistributing the bundled code. Update this list when changing a bundled dependency.
