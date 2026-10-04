"""Refresh the pinned Three.js files. Not needed to run the viewer."""
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request

VERSION = "0.185.1"
FILES = [
    "LICENSE", "build/three.module.js", "build/three.core.js",
    "examples/jsm/loaders/GLTFLoader.js",
    "examples/jsm/utils/BufferGeometryUtils.js",
    "examples/jsm/utils/SkeletonUtils.js",
    "examples/jsm/controls/OrbitControls.js",
    "examples/jsm/controls/PointerLockControls.js",
    "examples/jsm/math/Octree.js", "examples/jsm/math/Capsule.js",
    "examples/jsm/environments/RoomEnvironment.js",
    "examples/jsm/objects/Sky.js",
]


def main():
    root = Path(__file__).resolve().parents[1] / "public/vendor/three"
    with urllib.request.urlopen(f"https://registry.npmjs.org/three/{VERSION}", timeout=30) as response:
        metadata = json.load(response)
    with urllib.request.urlopen(f"https://registry.npmjs.org/three/-/three-{VERSION}.tgz", timeout=60) as response:
        data = response.read()
    integrity = "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()
    if integrity != metadata["dist"]["integrity"]:
        raise ValueError("Package integrity mismatch")
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        for name in FILES:
            member = archive.getmember("package/" + name)
            if not member.isfile():
                raise ValueError(f"Expected a regular file: {name}")
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            contents = archive.extractfile(member).read()
            # Module workers cannot inherit index.html's import map.
            if name in {"examples/jsm/math/Octree.js", "examples/jsm/math/Capsule.js"}:
                contents = contents.replace(b"from 'three';", b"from '../../../build/three.core.js'; // Local import for native workers.")
            target.write_bytes(contents)
    (root / "VERSION.json").write_text(json.dumps({
        "version": VERSION, "source": f"https://www.npmjs.com/package/three/v/{VERSION}",
        "integrity": integrity, "files": FILES,
        "localPatches": ["Octree.js and Capsule.js: relative three.core.js imports for module workers; algorithms unchanged"],
    }, indent=2) + "\n", encoding="utf-8")
    print(f"Vendored Three.js {VERSION}: {len(FILES)} files, integrity verified")


if __name__ == "__main__":
    main()
