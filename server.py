"""
Hammer Time dev server.
Serves static files and proxies POST /api/anthropic/* -> https://api.anthropic.com/*
"""

import http.server
import urllib.request
import urllib.error
import mimetypes
import os

PORT = 5173
ROOT = os.path.dirname(os.path.abspath(__file__))
ANTHROPIC_ORIGIN = "https://api.anthropic.com"
PROXY_PREFIX = "/api/anthropic"
FORWARD_HEADERS = {"x-api-key", "anthropic-version", "anthropic-beta", "content-type"}


class Handler(http.server.BaseHTTPRequestHandler):

    # ── static files ───────────────────────────────────────────────────────

    def do_GET(self):
        self._serve_file(send_body=True)

    def do_HEAD(self):
        self._serve_file(send_body=False)

    def _serve_file(self, send_body=True):
        # Strip query string / fragment
        path = self.path.split("?")[0].split("#")[0]

        # Resolve to filesystem path (guard against path traversal)
        rel = os.path.normpath(path.lstrip("/"))
        fpath = os.path.join(ROOT, rel)
        if not fpath.startswith(ROOT):
            self.send_error(403)
            return

        if os.path.isdir(fpath):
            fpath = os.path.join(fpath, "index.html")

        if not os.path.isfile(fpath):
            self.send_error(404)
            return

        ctype, _ = mimetypes.guess_type(fpath)
        ctype = ctype or "application/octet-stream"
        # Ensure JS modules get the right MIME type
        if fpath.endswith(".js"):
            ctype = "text/javascript"

        with open(fpath, "rb") as f:
            data = f.read()

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if send_body:
            self.wfile.write(data)

    # ── proxy ──────────────────────────────────────────────────────────────

    def do_POST(self):
        if self.path.startswith(PROXY_PREFIX):
            self._proxy()
        else:
            self.send_error(404)

    def do_OPTIONS(self):
        if self.path.startswith(PROXY_PREFIX):
            self.send_response(204)
            self._cors()
            self.end_headers()
        else:
            self.send_error(405)

    def _proxy(self):
        upstream = ANTHROPIC_ORIGIN + self.path[len(PROXY_PREFIX):]
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else None
        fwd = {k: v for k, v in self.headers.items() if k.lower() in FORWARD_HEADERS}

        req = urllib.request.Request(upstream, data=body, headers=fwd, method="POST")
        try:
            with urllib.request.urlopen(req) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                self._cors()
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.end_headers()
            self.wfile.write(data)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers",
                         "content-type, x-api-key, anthropic-version, anthropic-beta")

    # ── logging ────────────────────────────────────────────────────────────

    def log_message(self, fmt, *args):
        path = getattr(self, "path", "?")
        tag = " [proxy]" if path.startswith(PROXY_PREFIX) else ""
        print(f"  {self.command} {path}{tag}")


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as srv:
        print(f"Hammer Time dev server: http://localhost:{PORT}")
        print(f"Proxy: {PROXY_PREFIX}/* -> {ANTHROPIC_ORIGIN}/*\n")
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
