"""Shared command-line handling for the Blender model checks in tools/model-checks/.

    blender --background <model.blend> --python tools/model-checks/<check>.py -- --out <report.json> [options]

Options (every check accepts all of them and ignores the ones it does not use):
  --out PATH               report file (required)
  --skip-collections A,B   collections whose objects are not checked (default per check)
  --collections A,B        hygiene: collection name prefixes of the exported model (default: every collection not skipped)
  --require P,Q            hygiene: custom properties every exported object must carry, besides the viewer_* contract
  --levels A,B             dollhouse: floor ids to audit (default: every viewer_floor_ids value in the model)
  --facing-free-prop NAME  furniture: building property that exempts a chair from the facing rule (viewer_facing_free always does)
"""
import argparse
import os
import sys


def parse(default_skip):
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="model check")
    p.add_argument("--out", required=True)
    p.add_argument("--skip-collections", default=",".join(default_skip))
    p.add_argument("--collections", default="")
    p.add_argument("--require", default="")
    p.add_argument("--levels", default="")
    p.add_argument("--facing-free-prop", default="")
    a = p.parse_args(argv)
    split = lambda s: tuple(x for x in s.split(",") if x)
    a.skip = split(a.skip_collections)
    a.collections = split(a.collections)
    a.require = split(a.require)
    a.levels = split(a.levels)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    return a


def collection_of(ob):
    return ob.users_collection[0].name if ob.users_collection else ""
