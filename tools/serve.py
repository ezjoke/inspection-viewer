#!/usr/bin/env python3
"""Tiny local web server for development and tests (threaded, no caching).

    python3 tools/serve.py [port]      # default 8765

`python3 -m http.server` is flaky when a browser loads many ES modules at once
(small listen backlog). This one raises it.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Server(ThreadingHTTPServer):
    # Default backlog is 5: a browser fetching many ES modules in parallel overflows
    # it and gets "connection reset" on macOS.
    request_queue_size = 128
    daemon_threads = True


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = Server(("127.0.0.1", port), partial(Handler, directory=str(ROOT)))
    print(f"Serving {ROOT} on http://localhost:{port}")
    server.serve_forever()
