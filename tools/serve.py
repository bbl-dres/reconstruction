"""Serve the gallery and every reconstruction viewer, as GitHub Pages would.

Usage: python tools/serve.py [--port 8000] [--building bundeshaus]

The repository root is served. Private folders (each reconstruction's work/, tools, tests,
.git, caches and archives) are never served, even though GitHub Pages would never see them anyway.
"""
import argparse
import email.utils
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


PRIVATE_PARTS = {"work", ".work", "archive", "tools", "tests", "node_modules", "__pycache__"}


def is_public(root, resolved):
    """True when a resolved path lies inside root and outside every private folder."""
    if not resolved.is_relative_to(root):
        return False
    parts = resolved.relative_to(root).parts
    return not any(part in PRIVATE_PARTS or part.startswith(".") for part in parts)


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
        # Expose published site content only: never work/, tools, tests or dot folders.
        path = unquote(urlsplit(self.path).path)
        root = Path(self.directory).resolve()
        if any(part in PRIVATE_PARTS or part.startswith(".") for part in path.split("/") if part):
            self.send_error(404)
            return None
        resolved = Path(self.translate_path(self.path)).resolve()
        if not is_public(root, resolved):
            self.send_error(404)
            return None
        self.vary_encoding = resolved.suffix == ".glb"
        if self.vary_encoding and self.accepts_gzip() and resolved.is_file():
            zipped = resolved.with_suffix(".glb.gz")
            # Never follow a sidecar symlink outside public, or serve a sidecar
            # older than the GLB. No compression work is done on the request path.
            if zipped.is_file() and is_public(root, zipped.resolve()) and zipped.stat().st_mtime_ns >= resolved.stat().st_mtime_ns:
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
    parser.add_argument("--building", help="Print the direct link to this reconstruction, e.g. bundeshaus")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    page = f"reconstructions/{args.building}/" if args.building else ""
    if args.building and not (root / page / "index.html").is_file():
        parser.exit(1, f"No reconstruction named {args.building!r} with an index.html.\n")
    try:
        with ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(root))) as server:
            print(f"Reconstructions: http://localhost:{args.port}/{page}\nPress Ctrl+C to stop.", flush=True)
            server.serve_forever()
    except KeyboardInterrupt:
        pass
    except OSError as error:
        parser.exit(1, f"Cannot start viewer: {error}\nTry --port 8001 if the port is already in use.\n")


if __name__ == "__main__":
    main()
