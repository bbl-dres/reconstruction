"""Manual browser QA: python tests/serve-loading-fixtures.py [--port 8001]."""
from pathlib import Path
import sys, gzip, time, argparse
from functools import partial
from http.server import ThreadingHTTPServer
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from serve import Handler

class QA(Handler):
    def do_GET(self):
        route = self.path.split('/')[1]
        if route in {'gzip', 'missing-building', 'missing-context', 'truncated'}:
            self.path = self.path[len(route) + 1:]
        if self.path.endswith('.glb'):
            building = '/building' in self.path
            if (route == 'missing-building' and building) or (route == 'missing-context' and not building):
                self.send_error(404, 'Intentional QA missing asset'); return
            if route in {'gzip', 'truncated'}:
                path = Path(self.translate_path(self.path)).resolve()
                if not path.is_relative_to(ROOT / 'public/models') or not path.is_file():
                    self.send_error(404); return
                data = path.read_bytes()
                if route == 'gzip': data = gzip.compress(data, compresslevel=1)
                else: data = data[:-32]
                print(f'QA {route}: {path.name}: {len(data):,} response bytes', flush=True)
                self.send_response(200)
                self.send_header('Content-Type', 'model/gltf-binary')
                self.send_header('Content-Length', str(len(data)))
                if route == 'gzip': self.send_header('Content-Encoding', 'gzip')
                self.end_headers()
                try:
                    for offset in range(0, len(data), 512 * 1024):
                        self.wfile.write(data[offset:offset + 512 * 1024]); self.wfile.flush(); time.sleep(.025)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError): pass
                return
        super().do_GET()

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=8001)
args = parser.parse_args()
with ThreadingHTTPServer(('127.0.0.1', args.port), partial(QA, directory=str(ROOT))) as server:
    print(f'QA viewer at http://127.0.0.1:{args.port}/gzip/ (also missing-building, missing-context, truncated)', flush=True)
    server.serve_forever()
