"""Real HTTP checks for precompressed GLBs, negotiation and cache behavior."""
from functools import partial
import gzip
import http.client
from http.server import ThreadingHTTPServer
import os
from pathlib import Path
import shutil
import sys
import threading
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from serve import Handler


class QuietHandler(Handler):
    def log_message(self, *args):
        pass


class ServingTests(unittest.TestCase):
    def setUp(self):
        self.root = (ROOT / ".work" / ("serve-test-" + uuid.uuid4().hex)).resolve()
        (self.root / "public").mkdir(parents=True)
        self.asset = self.root / "public/model.glb"
        self.raw = b"a model payload" * 1000
        self.asset.write_bytes(self.raw)
        self.zipped = self.asset.with_suffix(".glb.gz")
        self.zipped.write_bytes(gzip.compress(self.raw, mtime=0))
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(self.root)))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        assert self.root.parent == (ROOT / ".work").resolve() and self.root.name.startswith("serve-test-")
        shutil.rmtree(self.root)

    def request(self, headers=None, method="GET", path="/public/model.glb"):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port)
        connection.request(method, path, headers=headers or {})
        response = connection.getresponse()
        status, returned, body = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return status, returned, body

    def test_gzip_get_head_and_conditional_requests(self):
        status, headers, body = self.request({"Accept-Encoding": "br, gzip"})
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "model/gltf-binary")
        self.assertEqual(headers["Content-Encoding"], "gzip")
        self.assertEqual(int(headers["Content-Length"]), len(body))
        self.assertEqual(gzip.decompress(body), self.raw)
        _, head, empty = self.request({"Accept-Encoding": "gzip"}, "HEAD")
        self.assertFalse(empty)
        self.assertEqual(head["Content-Length"], headers["Content-Length"])
        for key, value in [("If-None-Match", headers["ETag"]), ("If-Modified-Since", headers["Last-Modified"])]:
            code, cached, body = self.request({"Accept-Encoding": "gzip", key: value})
            self.assertEqual(code, 304)
            self.assertEqual(cached["Vary"], "Accept-Encoding")
            self.assertFalse(body)

    def test_identity_q_zero_and_stale_sidecar(self):
        for encoding in ["identity", "gzip;q=0, *;q=1", "br", "gzip;q=invalid"]:
            _, headers, body = self.request({"Accept-Encoding": encoding})
            self.assertNotIn("Content-Encoding", headers)
            self.assertEqual(headers["Vary"], "Accept-Encoding")
            self.assertEqual(body, self.raw)
        os.utime(self.zipped, (1, 1))
        _, headers, body = self.request({"Accept-Encoding": "gzip"})
        self.assertNotIn("Content-Encoding", headers)
        self.assertEqual(body, self.raw)

    def test_private_paths_are_not_served(self):
        for path in ["/scripts/serve.py", "/public/../scripts/serve.py", "/public/%2e%2e/scripts/serve.py"]:
            self.assertEqual(self.request(path=path)[0], 404)

    def test_gzip_only_delivery_works_without_an_uncompressed_sibling(self):
        self.asset.unlink()
        status, headers, body = self.request(path='/public/model.glb.gz')
        self.assertEqual(status, 200)
        self.assertNotIn('Content-Encoding', headers)
        self.assertEqual(gzip.decompress(body), self.raw)
        status, head, body = self.request(method='HEAD', path='/public/model.glb.gz')
        self.assertEqual(status, 200)
        self.assertEqual(head['Content-Length'], headers['Content-Length'])
        self.assertFalse(body)


if __name__ == "__main__":
    unittest.main()
