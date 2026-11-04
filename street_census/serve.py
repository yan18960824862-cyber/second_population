# -*- coding: utf-8 -*-
"""带 HTTP Range 支持的静态服务器（视频 seek 必需）"""
import os, re, sys, http.server

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8643
HERE = os.path.dirname(os.path.abspath(__file__))
# 主站在项目根，原普查站作为子站位于 site/
ROOT = HERE


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        self._range = None
        super().do_GET()

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        if not os.path.isfile(path):
            self.send_error(404, "Not Found")
            return None

        size = os.path.getsize(path)
        ctype = self.guess_type(path)
        rng = self.headers.get("Range")
        f = open(path, "rb")

        if rng:
            m = re.match(r"bytes=(\d*)-(\d*)", rng.strip())
            if m and (m.group(1) or m.group(2)):
                if m.group(1):
                    start = int(m.group(1))
                    end = int(m.group(2)) if m.group(2) else size - 1
                else:  # bytes=-N （尾部 N 字节）
                    start = max(0, size - int(m.group(2)))
                    end = size - 1
                end = min(end, size - 1)
                if start <= end:
                    self._range = (start, end)
                    f.seek(start)
                    self.send_response(206)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
                    self.send_header("Content-Length", str(end - start + 1))
                    self.end_headers()
                    return f

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(size))
        self.end_headers()
        return f

    def copyfile(self, source, outputfile):
        rng = getattr(self, "_range", None)
        if not rng:
            return super().copyfile(source, outputfile)
        start, end = rng
        remaining = end - start + 1
        while remaining > 0:
            chunk = source.read(min(262144, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    print("serving %s on http://127.0.0.1:%d (range enabled)" % (ROOT, PORT))
    Server(("127.0.0.1", PORT), Handler).serve_forever()
