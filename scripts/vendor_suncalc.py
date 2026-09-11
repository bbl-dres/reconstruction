"""Refresh the pinned, dependency-free SunCalc ESM files (not a startup step)."""
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
from urllib.request import urlopen

VERSION = "2.0.2"
FILES = ["index.js", "LICENSE", "README.md"]

def main():
    root = Path(__file__).resolve().parents[1] / "public/vendor/suncalc"
    with urlopen(f"https://registry.npmjs.org/suncalc/{VERSION}", timeout=30) as response:
        metadata = json.load(response)
    with urlopen(f"https://registry.npmjs.org/suncalc/-/suncalc-{VERSION}.tgz", timeout=60) as response:
        data = response.read()
    integrity = "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()
    if integrity != metadata["dist"]["integrity"]:
        raise ValueError("SunCalc package integrity mismatch")
    root.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        for name in FILES:
            member = archive.getmember("package/" + name)
            if not member.isfile():
                raise ValueError("Expected regular package file")
            (root / name).write_bytes(archive.extractfile(member).read())
    (root / "VERSION.json").write_text(json.dumps({"version": VERSION, "integrity": integrity, "files": FILES}, indent=2) + "\n", encoding="utf-8")
    print(f"Vendored SunCalc {VERSION}; integrity verified")

if __name__ == "__main__":
    main()
