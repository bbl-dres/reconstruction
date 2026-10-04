"""Vendor the pinned standalone Meshopt codec. Not needed to run the viewer."""
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request

VERSION = "1.2.0"
INTEGRITY = "sha512-davRZeIJbxJrE24cwQle7ZDsxjdk/OphNOV83oX+efQinyoHY9Jcyz3MHbaoG0qySZajldGztNZ1RN/T19PZsg=="
URL = f"https://registry.npmjs.org/meshoptimizer/-/meshoptimizer-{VERSION}.tgz"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, help="Use an already downloaded npm archive")
    args = parser.parse_args()
    if args.archive:
        data = args.archive.read_bytes()
    else:
        with urllib.request.urlopen(URL, timeout=60) as response:
            data = response.read()
    if "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode() != INTEGRITY:
        raise ValueError("Package integrity mismatch")
    root = Path(__file__).resolve().parents[1]
    runtime = root / "public/vendor/meshoptimizer"
    offline = root / "scripts/vendor/meshoptimizer"
    files = [("meshopt_decoder.mjs", runtime / "meshopt_decoder.mjs"),
             ("meshopt_decoder_reference.js", runtime / "meshopt_decoder_reference.mjs"),
             ("meshopt_encoder.js", offline / "meshopt_encoder.mjs"),
             ("LICENSE.md", runtime / "LICENSE.md"), ("LICENSE.md", offline / "LICENSE.md")]
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        for name, target in files:
            member = archive.getmember("package/" + name)
            if not member.isfile():
                raise ValueError(f"Expected regular file: {name}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.extractfile(member).read())
    (runtime / "VERSION.json").write_text(json.dumps({
        "version": VERSION, "source": URL, "integrity": INTEGRITY,
        "files": [str(target.relative_to(root)).replace("\\", "/") for _, target in files],
        "localPatches": ["Encoder and reference decoder renamed from .js to .mjs for standalone ESM; contents unchanged"],
    }, indent=2) + "\n", encoding="utf-8")
    print(f"Vendored Meshoptimizer {VERSION}; package integrity verified")


if __name__ == "__main__":
    main()
