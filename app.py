#!/usr/bin/env python3
"""Local split-tunnel probe. Uses only the Python standard library."""

import argparse
import http.client
import ipaddress
import json
import re
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
HOSTNAME = re.compile(r"^(?=.{4,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$")
GEO_CACHE = {}
GEO_CACHE_LOCK = threading.Lock()


def valid_ip(value):
    if not isinstance(value, str):
        return None
    try:
        return str(ipaddress.ip_address(value.strip()))
    except ValueError:
        return None


def country_code(value):
    if isinstance(value, str) and re.fullmatch(r"[a-zA-Z]{2}", value):
        return value.upper()
    return ""


def parse_result(body, method):
    text = body.decode("utf-8", errors="replace").strip()
    if method == "ping0":
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return valid_ip(lines[0]) if lines else None, ""
    if method == "trace":
        pairs = dict(line.split("=", 1) for line in text.splitlines() if "=" in line)
        return valid_ip(pairs.get("ip", "")), country_code(pairs.get("loc"))
    try:
        value = json.loads(text)
        if isinstance(value, dict):
            for key in ("ip", "ip_address", "address", "query"):
                ip = valid_ip(value.get(key))
                if ip:
                    return ip, country_code(value.get("country_code")) or country_code(value.get("country"))
    except ValueError:
        pass
    return valid_ip(text), ""


class SameHostRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        old = urllib.parse.urlsplit(request.full_url)
        new = urllib.parse.urlsplit(newurl)
        if new.scheme != "https" or new.hostname != old.hostname or new.port != old.port:
            raise urllib.error.HTTPError(newurl, 403, "Cross-domain redirect", headers, fp)
        return super().redirect_request(request, fp, code, msg, headers, newurl)


OPENER = urllib.request.build_opener(SameHostRedirect())


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


SITE_OPENER = urllib.request.build_opener(NoRedirect())


def site_response(code, started):
    if 200 <= code < 300:
        message = f"官网可访问（HTTP {code}）"
    elif 300 <= code < 400:
        message = f"官网已响应（HTTP {code} 跳转）"
    elif 400 <= code < 500:
        message = f"官网已响应（HTTP {code}，访问受限）"
    else:
        message = f"官网已响应（HTTP {code}，服务异常）"
    return {"status": "responded", "message": message, "latency": round((time.monotonic() - started) * 1000)}


def probe(payload):
    domain = str(payload.get("domain", "")).strip().lower().rstrip(".")
    method = payload.get("method", "trace")
    path = str(payload.get("path", "/cdn-cgi/trace" if method == "trace" else "/"))
    if not HOSTNAME.fullmatch(domain) or domain.endswith((".local", ".localhost", ".internal")):
        raise ValueError("请输入有效的公开域名")
    if method not in ("trace", "echo", "ping0", "site"):
        raise ValueError("不支持的检测方式")
    if len(path) > 512 or not path.startswith("/") or path.startswith("//") or re.search(r"[\\\s#]", path):
        raise ValueError("路径须以 / 开头，且不能包含空白、反斜杠或 #")
    parts = urllib.parse.urlsplit("https://" + domain + path)
    if parts.hostname != domain or parts.scheme != "https":
        raise ValueError("检测地址必须属于所填域名")
    query = urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
    if method != "site":
        query.append(("_split_probe", str(int(time.time() * 1000))))
    url = urllib.parse.urlunsplit(("https", domain, parts.path, urllib.parse.urlencode(query), ""))
    started = time.monotonic()
    request = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 SplitTunnelLab/1.1",
        "Accept": "text/html, text/plain, application/json, */*",
    })
    try:
        with (SITE_OPENER if method == "site" else OPENER).open(request, timeout=8) as response:
            if method == "site":
                return site_response(response.status, started)
            content_type = response.headers.get("Content-Type", "")
            body = response.read(32769)
            if len(body) > 32768:
                return {"status": "unsupported", "message": "响应过大，无法识别 IP", "latency": round((time.monotonic() - started) * 1000)}
            ip, country = parse_result(body, method)
            if ip:
                result = {"status": "ok", "ip": ip, "country": country, "latency": round((time.monotonic() - started) * 1000)}
                if method == "ping0":
                    lines = [line.strip() for line in body.decode("utf-8", errors="replace").splitlines() if line.strip()]
                    if len(lines) > 1:
                        result["location"] = lines[1][:160]
                        result["locationSource"] = "ping0.cc"
                return result
            if "html" in content_type.lower():
                message = "站点已响应，但没有提供出口 IP"
            else:
                message = "响应中未找到有效 IP"
            return {"status": "unsupported", "message": message, "latency": round((time.monotonic() - started) * 1000)}
    except urllib.error.HTTPError as error:
        error.close()
        if method == "site":
            return site_response(error.code, started)
        status = "unsupported" if 400 <= error.code < 500 else "error"
        message = f"站点未提供检测接口（HTTP {error.code}）" if status == "unsupported" else f"站点返回 HTTP {error.code}"
        return {"status": status, "message": message, "latency": round((time.monotonic() - started) * 1000)}
    except urllib.error.URLError as error:
        reason = error.reason
        if isinstance(reason, (TimeoutError, socket.timeout)):
            message = "连接超时"
        elif isinstance(reason, socket.gaierror):
            message = "域名解析失败"
        else:
            message = "连接失败，请检查网络或分流规则"
        return {"status": "error", "message": message, "latency": round((time.monotonic() - started) * 1000)}
    except (TimeoutError, socket.timeout):
        return {"status": "error", "message": "连接超时", "latency": round((time.monotonic() - started) * 1000)}
    except (http.client.HTTPException, OSError):
        return {"status": "error", "message": "连接中断，目标站点未返回响应", "latency": round((time.monotonic() - started) * 1000)}


def lookup_geo(value):
    ip = valid_ip(value)
    if not ip or not ipaddress.ip_address(ip).is_global:
        raise ValueError("只能查询公网 IP")
    now = time.monotonic()
    with GEO_CACHE_LOCK:
        cached = GEO_CACHE.get(ip)
        if cached and cached[0] > now:
            return cached[1]
    request = urllib.request.Request(
        f"https://ipwho.is/{urllib.parse.quote(ip, safe=':')}",
        headers={"User-Agent": "SplitTunnelLab/1.1", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=6) as response:
            data = json.loads(response.read(8192))
        if isinstance(data, dict) and data.get("success") is True and valid_ip(data.get("ip")) == ip:
            result = {
                "status": "ok",
                "country": country_code(data.get("country_code")),
                "region": str(data.get("region") or "")[:80],
                "city": str(data.get("city") or "")[:80],
                "locationSource": "ipwho.is",
            }
            ttl = 6 * 60 * 60
        else:
            result, ttl = {"status": "unavailable"}, 15 * 60
    except (urllib.error.URLError, OSError, http.client.HTTPException, ValueError, TypeError):
        result, ttl = {"status": "unavailable"}, 15 * 60
    with GEO_CACHE_LOCK:
        GEO_CACHE[ip] = (time.monotonic() + ttl, result)
    return result


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format_string, *args):
        pass

    def allow_request(self):
        port = self.server.server_address[1]
        host = self.headers.get("Host")
        origin = self.headers.get("Origin")
        valid_host = host in (f"127.0.0.1:{port}", f"localhost:{port}")
        valid_origin = not origin or origin == f"http://{host}"
        if not valid_host or not valid_origin:
            self.send_bytes(b'{"error":"Invalid origin"}', "application/json; charset=utf-8", 403)
            return False
        return True

    def send_bytes(self, body, content_type, status=200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", (
            "default-src 'self'; connect-src 'self' https:; img-src 'self' data:; "
            "style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'"
        ))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.allow_request():
            return
        files = {
            "/": ("index.html", "text/html; charset=utf-8"),
            "/static/style.css": ("style.css", "text/css; charset=utf-8"),
            "/static/app.js": ("app.js", "text/javascript; charset=utf-8"),
        }
        item = files.get(urllib.parse.urlsplit(self.path).path)
        if not item:
            self.send_bytes(b"Not found", "text/plain; charset=utf-8", 404)
            return
        self.send_bytes((STATIC / item[0]).read_bytes(), item[1])

    def do_POST(self):
        if not self.allow_request():
            return
        if self.path not in ("/api/probe", "/api/geo"):
            self.send_bytes(b"Not found", "text/plain; charset=utf-8", 404)
            return
        if self.headers.get_content_type() != "application/json":
            self.send_bytes(b'{"error":"Expected JSON"}', "application/json; charset=utf-8", 415)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 4096:
                raise ValueError("请求内容过大或为空")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("无效请求")
            result = probe(payload) if self.path == "/api/probe" else lookup_geo(payload.get("ip"))
            self.send_bytes(json.dumps(result, ensure_ascii=False).encode(), "application/json; charset=utf-8")
        except ValueError as error:
            self.send_bytes(json.dumps({"error": str(error)}, ensure_ascii=False).encode(), "application/json; charset=utf-8", 400)


def main():
    parser = argparse.ArgumentParser(description="本地网站分流测试")
    parser.add_argument("--open", action="store_true", help="启动后打开浏览器")
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    url = f"http://127.0.0.1:{server.server_address[1]}"
    print(f"本地网站分流测试已启动：{url}", flush=True)
    print("按 Ctrl+C 停止。", flush=True)
    if args.open:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
