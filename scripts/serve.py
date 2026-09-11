"""Serve the no-build viewer. Usage: python scripts/serve.py [--port 8000]."""
import argparse
import email.utils
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript", ".glb": "model/gltf-binary"}

    def accepts_gzip(self):
        encodings = {}
        for item in self.headers.get("Accept-Encoding", "").lower().split(","):
            parts = item.strip().split(";")
            quality = 1.0
            for parameter in parts[1:]:
                if parameter.strip().startswith("q="):
                    try:
                        quality = float(parameter.strip()[2:])
                    except ValueError:
                        quality = 0.0
            encodings[parts[0].strip()] = quality if 0 <= quality <= 1 else 0.0
        return encodings.get("gzip", encodings.get("*", 0)) > 0

    def send_head(self):
        # Expose the page and public assets, not source scripts or repository data.
        path = unquote(urlsplit(self.path).path)
        if path not in ("/", "/index.html") and not path.startswith("/public/"):
            self.send_error(404)
            return None
        root = Path(self.directory).resolve()
        resolved = Path(self.translate_path(self.path)).resolve()
        if resolved != root and resolved != root / "index.html" and not resolved.is_relative_to(root / "public"):
            self.send_error(404)
            return None
        self.vary_encoding = resolved.suffix == ".glb"
        if self.vary_encoding and self.accepts_gzip() and resolved.is_file():
            zipped = resolved.with_suffix(".glb.gz")
            # Never follow a sidecar symlink outside public, or serve a sidecar
            # older than the GLB. No compression work is done on the request path.
            if zipped.is_file() and zipped.resolve().is_relative_to(root / "public") and zipped.stat().st_mtime_ns >= resolved.stat().st_mtime_ns:
                stream = zipped.open("rb")
                stat = zipped.stat()
                tag = f'"gzip-{stat.st_mtime_ns:x}-{stat.st_size:x}"'
                unchanged = self.headers.get("If-None-Match") in (tag, "*")
                if not self.headers.get("If-None-Match") and self.headers.get("If-Modified-Since"):
                    try:
                        since = email.utils.parsedate_to_datetime(self.headers["If-Modified-Since"]).timestamp()
                        unchanged = int(stat.st_mtime) <= since
                    except (ValueError, TypeError, OverflowError):
                        pass
                self.send_response(304 if unchanged else 200)
                self.send_header("Content-Encoding", "gzip")
                self.send_header("ETag", tag)
                self.send_header("Last-Modified", self.date_time_string(stat.st_mtime))
                if not unchanged:
                    self.send_header("Content-Type", "model/gltf-binary")
                    self.send_header("Content-Length", str(stat.st_size))
                self.end_headers()
                if unchanged:
                    stream.close()
                    return None
                return stream
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        if getattr(self, "vary_encoding", False):
            self.send_header("Vary", "Accept-Encoding")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    try:
        with ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(root))) as server:
            print(f"Building viewer: http://localhost:{args.port}\nPress Ctrl+C to stop.", flush=True)
            server.serve_forever()
    except KeyboardInterrupt:
        pass
    except OSError as error:
        parser.exit(1, f"Cannot start viewer: {error}\nTry --port 8001 if the port is already in use.\n")


if __name__ == "__main__":
    main()
