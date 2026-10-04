"""Losslessly compress every catalog version (or --asset file.glb). Requires Node 24+."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from export_model import glb_summary, report_file

REPO = Path(__file__).resolve().parents[1]
MODELS = REPO / "public/models"
MAX_FILE_BYTES = 100 * 1024 * 1024


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def hash_file(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write_json(path, value):
    staged = path.with_suffix(path.suffix + ".tmp")
    staged.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    staged.replace(path)


def recipe():
    files = [REPO / "scripts/meshopt_glb.mjs", REPO / "scripts/vendor/meshoptimizer/meshopt_encoder.mjs",
             REPO / "public/vendor/meshoptimizer/meshopt_decoder.mjs"]
    return {"codec": "meshoptimizer-1.2.0", "extension": "EXT_meshopt_compression", "lossless": True,
            "pipelineSha256": hashlib.sha256("".join(hash_file(path) for path in files).encode()).hexdigest(), "gzipLevel": 6}


def valid_cached_asset(asset, report, settings):
    optimization = report.get("optimization", {})
    if asset.suffix == '.gz':
        return (optimization.get("recipe") == settings and asset.is_file()
                and asset.stat().st_size < MAX_FILE_BYTES and optimization.get("gzipSha256") == hash_file(asset))
    zipped = asset.with_suffix(".glb.gz")
    return (optimization.get("recipe") == settings and asset.is_file() and zipped.is_file()
            and report.get("glb", {}).get("sha256") == hash_file(asset)
            and optimization.get("gzipSha256") == hash_file(zipped)
            and zipped.stat().st_mtime_ns >= asset.stat().st_mtime_ns)


def optimize_asset(asset):
    asset = Path(asset).resolve()
    report_path = report_file(asset)
    source_report = read_json(report_path) if report_path.is_file() else {}
    settings = recipe()
    if "optimization" in source_report:
        if valid_cached_asset(asset, source_report, settings):
            return asset, source_report
        # Always start from the preserved original, never recompress a derivative.
        original = (asset.parent / source_report["optimization"]["originalAsset"]).resolve()
        if original.parent != asset.parent or original.suffix != ".glb":
            raise ValueError("Original asset must be a GLB in the same directory")
        if not original.is_file():
            raise RuntimeError(f"Reimport this model version to regenerate {asset.name}: its original was pruned and the codec changed or its cached files are damaged")
        asset = original
        source_report = read_json(asset.with_suffix(".report.json")) if asset.with_suffix(".report.json").is_file() else {}
    source_hash = hash_file(asset)
    key = hashlib.sha256((source_hash + json.dumps(settings, sort_keys=True)).encode()).hexdigest()[:16]
    output = asset.with_name(f"{asset.stem.split('-')[0]}-meshopt-{key}.glb")
    report_path, zipped = output.with_suffix(".report.json"), output.with_suffix(".glb.gz")
    if report_path.is_file() and zipped.is_file():
        cached = read_json(report_path)
        optimization = cached.get("optimization", {})
        candidate = zipped if cached.get('asset') == zipped.name else output
        if optimization.get("originalSha256") == source_hash and valid_cached_asset(candidate, cached, settings):
            return candidate, cached
    staged = output.with_suffix(".glb.tmp")
    try:
        result = subprocess.run(["node", str(REPO / "scripts/meshopt_glb.mjs"), str(asset), str(staged)],
                                check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stats = json.loads(result.stdout)
        if hash_file(asset) != source_hash:
            raise RuntimeError("Source export changed during compression; retry after it finishes saving")
        summary = glb_summary(staged)
        compressed = gzip.compress(staged.read_bytes(), compresslevel=6, mtime=0)
        if len(compressed) >= MAX_FILE_BYTES:
            raise ValueError("Compressed delivery exceeds GitHub's 100 MiB limit; reduce the authored asset budget before importing")
        gzip_only = summary["bytes"] >= MAX_FILE_BYTES
        if not gzip_only:
            staged.replace(output)
    finally:
        staged.unlink(missing_ok=True)
    staged_gzip = zipped.with_suffix(".gz.tmp")
    try:
        staged_gzip.write_bytes(compressed)
        staged_gzip.replace(zipped)
    finally:
        staged_gzip.unlink(missing_ok=True)
    delivery = zipped if gzip_only else output
    report = {**source_report, "asset": delivery.name, "glb": summary, "optimization": {
        "originalAsset": asset.name, "originalSha256": source_hash, "recipe": settings,
        **stats, "deliveryEncoding": "gzip" if gzip_only else "identity", "gzipBytes": len(compressed), "gzipSha256": hashlib.sha256(compressed).hexdigest(),
    }}
    write_json(report_path, report)
    return delivery, report


def optimize_catalog(path):
    catalog = read_json(path)
    rows = []
    for entry in catalog["models"]:
        row = {"version": entry["label"], "originalBytes": 0, "meshoptBytes": 0, "transferBytes": 0}
        for kind in ("building", "surroundings"):
            if not entry.get(kind):
                continue
            source = (path.parent / entry[kind]).resolve()
            if not source.is_relative_to(path.parent.resolve()):
                raise ValueError("Catalog asset must be within its models directory")
            output, report = optimize_asset(source)
            entry[kind] = "./" + output.relative_to(path.parent.resolve()).as_posix()
            stats = report["optimization"]
            row["originalBytes"] += stats["originalBytes"]
            row["meshoptBytes"] += stats["bytes"]
            row["transferBytes"] += stats["gzipBytes"]
            print(f"{entry['label']} {kind}: {stats['originalBytes']:,} -> {stats['bytes']:,} bytes; gzip {stats['gzipBytes']:,}", flush=True)
        rows.append(row)
    # All assets must pass round-trip verification before publishing any changes.
    write_json(path, catalog)
    write_json(path.parent / "compression.json", {"recipe": recipe(), "models": rows})
    return rows


def prune_unused_assets(catalog_path, model_ids=None):
    """Remove obsolete generated assets only after a complete catalog is published."""
    root = catalog_path.parent.resolve()
    entries = read_json(catalog_path)["models"]
    live = {(root / entry[kind]).resolve() for entry in entries for kind in ("building", "surroundings") if entry.get(kind)}
    if any(not path.is_relative_to(root) or not path.is_file() for path in live):
        raise ValueError("Cannot prune: the catalog contains missing assets or paths outside its directory")
    directories = {(root / entry["building"]).resolve().parent for entry in entries if model_ids is None or entry["id"] in model_ids}
    count, size = 0, 0
    for directory in directories:
        for asset in list(directory.glob("*.glb")) + list(directory.glob("*.glb.gz")):
            if asset.suffix == '.gz' and asset.with_suffix('').resolve() in live:
                continue  # A small GLB's negotiated gzip sidecar is live too.
            if asset.resolve() in live or not (asset.name.startswith(("building-", "surroundings-")) or asset.name in ("building.glb", "surroundings.glb")):
                continue
            base = asset.with_suffix('') if asset.suffix == '.gz' else asset
            companions = (base, report_file(base), base.with_suffix(".glb.gz"), base.with_suffix(".validation.json"))
            if any(path.resolve() in live for path in companions):
                continue
            for path in companions:
                if path.exists():
                    if not path.resolve().is_relative_to(root):
                        raise ValueError("Refusing to prune an asset outside the models directory")
                    size += path.stat().st_size
                    path.unlink()
                    count += 1
    print(f"Pruned {count} unused asset files ({size:,} bytes)", flush=True)
    return count, size


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=MODELS / "catalog.json")
    parser.add_argument("--asset", type=Path, help="Compress a single export without changing the catalog")
    parser.add_argument("--prune", action="store_true", help="After publishing, remove generated exports no longer referenced by the catalog")
    args = parser.parse_args()
    if args.asset and args.prune:
        parser.error("--prune requires catalog mode so active assets can be protected")
    try:
        if args.asset:
            output, report = optimize_asset(args.asset)
            print(output)
            print(json.dumps(report["optimization"], indent=2))
        else:
            rows = optimize_catalog(args.catalog.resolve())
            if args.prune:
                prune_unused_assets(args.catalog.resolve())
            print(f"Updated {len(rows)} versions.")
    except subprocess.CalledProcessError as error:
        print(error.stderr or error.stdout, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
