"""Local preview of a staged Revit export without touching the published catalog.

Serves the repository like tools/serve.py, except that the building's catalog request
(/reconstructions/<id>/public/models/catalog.json) is answered with the private preview catalog
<stage>/preview/catalog.json written by x20_publish.py (the published versions plus the staged one).

Usage (repo root): python tools/revit/export/serve_preview.py --building <id> --stage reconstructions/<id>/work/build/export/stage [--port 8014]
"""
import argparse
import sys
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / 'tools'))
from serve import Handler  # noqa: E402

CATALOG = None
PREVIEW = None


class PreviewHandler(Handler):
    def send_head(self):
        if unquote(urlsplit(self.path).path) == CATALOG:
            body = PREVIEW.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            from io import BytesIO
            return BytesIO(body)
        return super().send_head()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--port', type=int, default=8014)
    ap.add_argument('--building', required=True)
    ap.add_argument('--stage', required=True, type=Path)
    args = ap.parse_args()
    global CATALOG, PREVIEW
    CATALOG = '/reconstructions/%s/public/models/catalog.json' % args.building
    PREVIEW = args.stage / 'preview' / 'catalog.json'
    with ThreadingHTTPServer(('127.0.0.1', args.port), partial(PreviewHandler, directory=str(REPO))) as server:
        print(f'preview: http://localhost:{args.port}/reconstructions/{args.building}/', flush=True)
        server.serve_forever()


if __name__ == '__main__':
    main()
