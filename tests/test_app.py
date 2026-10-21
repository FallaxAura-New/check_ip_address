"""Regression tests for the local API, with no external network requests."""

import http.client
import io
import json
import ssl
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

import app


class Response(io.BytesIO):
    def __init__(self, body=b"", status=200, content_type="text/plain"):
        super().__init__(body)
        self.status = status
        self.headers = {"Content-Type": content_type}


class ParsingTests(unittest.TestCase):
    def test_ip_validation_and_normalization(self):
        self.assertEqual(app.valid_ip(" 1.1.1.1 "), "1.1.1.1")
        self.assertEqual(app.valid_ip("2001:4860:4860:0:0:0:0:8888"), "2001:4860:4860::8888")
        for value in (None, 123, "256.1.1.1", "1.1.1", "not-an-ip", "2606:4700::1111%en0"):
            with self.subTest(value=value):
                self.assertIsNone(app.valid_ip(value))

    def test_supported_response_formats(self):
        cases = (
            (b"ip=1.1.1.1\nloc=au\n", "trace", ("1.1.1.1", "AU")),
            (b"1.1.1.1\nAustralia\n", "ping0", ("1.1.1.1", "")),
            (b'{"ip_address":"1.1.1.1","country_code":"au"}', "echo", ("1.1.1.1", "AU")),
            (b'{"query":"1.1.1.1","country":"Australia"}', "echo", ("1.1.1.1", "")),
            (b"2001:4860:4860::8888\n", "echo", ("2001:4860:4860::8888", "")),
            (b"<html>not an IP</html>", "echo", (None, "")),
        )
        for body, method, expected in cases:
            with self.subTest(body=body, method=method):
                self.assertEqual(app.parse_result(body, method), expected)

    def test_excessively_nested_remote_json_is_not_an_unhandled_error(self):
        with patch.object(app.json, "loads", side_effect=RecursionError):
            self.assertEqual(app.parse_result(b"[]", "echo"), (None, ""))


class RedirectTests(unittest.TestCase):
    def redirect(self, url, source="https://example.com/start"):
        return app.SameHostRedirect().redirect_request(
            urllib.request.Request(source), None, 302, "Found", {}, url,
        )

    def test_same_host_redirect_and_explicit_default_port(self):
        for url in ("https://example.com/end", "https://example.com:443/end"):
            with self.subTest(url=url):
                self.assertEqual(self.redirect(url).full_url, url)
        self.assertEqual(
            self.redirect("https://example.com/end", "https://example.com:443/start").full_url,
            "https://example.com/end",
        )

    def test_other_origins_and_non_default_ports_are_blocked(self):
        for url in ("https://other.example/end", "http://example.com/end", "https://example.com:444/end"):
            with self.subTest(url=url), self.assertRaises(urllib.error.HTTPError):
                self.redirect(url)

    def test_site_checks_do_not_follow_redirects(self):
        self.assertIsNone(app.NoRedirect().redirect_request(
            urllib.request.Request("https://example.com/"), None, 302, "Found", {}, "https://other.example/",
        ))


class ProbeTests(unittest.TestCase):
    def test_site_query_bytes_are_preserved(self):
        with patch.object(app.SITE_OPENER, "open", return_value=Response()) as opened:
            self.assertEqual(app.probe({
                "domain": "example.com", "method": "site", "path": "/lookup?token=x%20y&flag&token=%2f",
            })["status"], "responded")
        self.assertEqual(opened.call_args.args[0].full_url, "https://example.com/lookup?token=x%20y&flag&token=%2f")

    def test_cache_buster_does_not_rewrite_existing_query(self):
        with patch.object(app.OPENER, "open", return_value=Response(b"1.1.1.1")) as opened, patch.object(app.time, "time", return_value=1):
            self.assertEqual(app.probe({
                "domain": "example.com", "method": "echo", "path": "/?token=x%20y&flag",
            })["status"], "ok")
        self.assertEqual(opened.call_args.args[0].full_url, "https://example.com/?token=x%20y&flag&_split_probe=1000")

    def test_unicode_path_and_query_are_encoded_once(self):
        with patch.object(app.SITE_OPENER, "open", return_value=Response()) as opened:
            app.probe({"domain": "example.com", "method": "site", "path": "/中文/%E4%B8%AD?q=澳门"})
        self.assertEqual(
            opened.call_args.args[0].full_url,
            "https://example.com/%E4%B8%AD%E6%96%87/%E4%B8%AD?q=%E6%BE%B3%E9%97%A8",
        )

    def test_invalid_targets_are_rejected_before_network(self):
        cases = [
            {"domain": "localhost"}, {"domain": "test.local"}, {"domain": "test.internal"},
            {"domain": "127.0.0.1"}, {"domain": "example.com", "method": "unknown"},
            {"domain": "example.com", "path": "//other.example/"},
            {"domain": "example.com", "path": "/a#b"},
            {"domain": "example.com", "path": "/a\\b"},
            {"domain": "example.com", "path": "/a b"},
            {"domain": "example.com", "path": "/" + "a" * 512},
        ]
        cases.extend({"domain": "example.com", "path": "/a" + chr(code) + "b"} for code in range(32))
        cases.append({"domain": "example.com", "path": "/a\x7fb"})
        with patch.object(app.OPENER, "open") as opened:
            for payload in cases:
                with self.subTest(payload=payload), self.assertRaises(ValueError):
                    app.probe(payload)
            opened.assert_not_called()

    def test_site_status_is_response_evidence_not_ip_evidence(self):
        for code in (200, 302, 403, 503):
            with self.subTest(code=code):
                result = app.site_response(code, app.time.monotonic())
                self.assertEqual(result["status"], "responded")
                self.assertIn(str(code), result["message"])
                self.assertNotIn("ip", result)

    def test_ping0_location_is_bounded(self):
        with patch.object(app.OPENER, "open", return_value=Response(b"1.1.1.1\n" + b"x" * 200)):
            result = app.probe({"domain": "ping0.cc", "method": "ping0"})
        self.assertEqual(result["ip"], "1.1.1.1")
        self.assertEqual(len(result["location"]), 160)
        self.assertEqual(result["locationSource"], "ping0.cc")

    def test_response_size_limit(self):
        with patch.object(app.OPENER, "open", return_value=Response(b"x" * 32769)):
            result = app.probe({"domain": "example.com", "method": "echo"})
        self.assertEqual(result["status"], "unsupported")
        self.assertIn("过大", result["message"])

    def test_http_errors_are_classified_and_closed(self):
        for method, code, expected in (("site", 302, "responded"), ("echo", 404, "unsupported"), ("echo", 503, "error")):
            body = io.BytesIO()
            error = urllib.error.HTTPError("https://example.com/", code, "Failure", {}, body)
            opener = app.SITE_OPENER if method == "site" else app.OPENER
            with self.subTest(method=method, code=code), patch.object(opener, "open", side_effect=error):
                self.assertEqual(app.probe({"domain": "example.com", "method": method})["status"], expected)
                self.assertTrue(body.closed)

    def test_network_failures_return_error_results(self):
        for error in (urllib.error.URLError(TimeoutError()), TimeoutError(), http.client.RemoteDisconnected(), OSError()):
            with self.subTest(error=type(error).__name__), patch.object(app.OPENER, "open", side_effect=error):
                self.assertEqual(app.probe({"domain": "example.com"})["status"], "error")

    def test_certificate_failure_is_not_reported_as_a_generic_network_failure(self):
        error = urllib.error.URLError(ssl.SSLCertVerificationError(1, "certificate verify failed"))
        with patch.object(app.OPENER, "open", side_effect=error):
            result = app.probe({"domain": "example.com"})
        self.assertEqual(result["status"], "error")
        self.assertIn("TLS 证书验证失败", result["message"])


class GeoTests(unittest.TestCase):
    def setUp(self):
        cache = patch.dict(app.GEO_CACHE, clear=True)
        cache.start()
        self.addCleanup(cache.stop)

    def test_private_invalid_and_scoped_addresses_are_not_sent(self):
        with patch.object(app.urllib.request, "urlopen") as opened:
            for value in (None, "127.0.0.1", "192.168.1.1", "::1", "2606:4700::1111%en0"):
                with self.subTest(value=value), self.assertRaises(ValueError):
                    app.lookup_geo(value)
            opened.assert_not_called()

    def test_valid_result_is_cached(self):
        data = {"success": True, "ip": "1.1.1.1", "country_code": "au", "region": "Queensland", "city": "South Brisbane"}
        with patch.object(app.urllib.request, "urlopen", return_value=Response(json.dumps(data).encode())) as opened:
            first = app.lookup_geo("1.1.1.1")
            self.assertEqual(first, app.lookup_geo("1.1.1.1"))
            opened.assert_called_once()
        self.assertEqual(first["country"], "AU")
        self.assertEqual(first["locationSource"], "ipwho.is")

    def test_expired_cache_is_refreshed(self):
        app.GEO_CACHE["1.1.1.1"] = (0, {"status": "ok", "country": "ZZ"})
        with patch.object(app.urllib.request, "urlopen", side_effect=TimeoutError()) as opened:
            self.assertEqual(app.lookup_geo("1.1.1.1"), {"status": "unavailable"})
            opened.assert_called_once()

    def test_mismatched_response_ip_is_unavailable(self):
        data = {"success": True, "ip": "8.8.8.8", "country_code": "us"}
        with patch.object(app.urllib.request, "urlopen", return_value=Response(json.dumps(data).encode())):
            self.assertEqual(app.lookup_geo("1.1.1.1"), {"status": "unavailable"})

    def test_malformed_or_excessively_nested_json_is_unavailable(self):
        for error in (ValueError(), RecursionError()):
            with self.subTest(error=type(error).__name__), patch.object(app.urllib.request, "urlopen", return_value=Response()), patch.object(app.json, "loads", side_effect=error):
                self.assertEqual(app.lookup_geo("1.0.0.1"), {"status": "unavailable"})
                app.GEO_CACHE.clear()


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = app.ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_static_routes_and_security_headers(self):
        for route, content_type in (("/", "text/html"), ("/static/app.js", "text/javascript"), ("/static/style.css", "text/css"), ("/static/probe.mjs", "text/javascript")):
            with self.subTest(route=route):
                status, headers, body = self.request("GET", route)
                self.assertEqual(status, 200)
                self.assertTrue(headers["Content-Type"].startswith(content_type))
                self.assertEqual(int(headers["Content-Length"]), len(body))
                self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
                self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])

    def test_host_and_origin_checks(self):
        for headers, expected in (
            ({"Host": "attacker.example"}, 403),
            ({"Origin": "https://attacker.example"}, 403),
            ({"Origin": "null"}, 403),
            ({"Origin": "http://127.0.0.1:" + str(self.port)}, 200),
            ({"Host": "localhost:" + str(self.port), "Origin": "http://localhost:" + str(self.port)}, 200),
        ):
            with self.subTest(headers=headers):
                self.assertEqual(self.request("GET", "/", headers=headers)[0], expected)

    def test_unknown_routes_do_not_serve_files(self):
        for method, path in (("GET", "/app.py"), ("GET", "/static/../app.py"), ("POST", "/api/unknown")):
            with self.subTest(method=method, path=path):
                self.assertEqual(self.request(method, path)[0], 404)

    def test_invalid_post_content_is_rejected(self):
        for body, headers, expected in (
            ("{}", {}, 415),
            ("", {"Content-Type": "application/json"}, 400),
            ("{", {"Content-Type": "application/json"}, 400),
            ("[]", {"Content-Type": "application/json"}, 400),
            ("{}", {"Content-Type": "application/json", "Content-Length": "4097"}, 400),
            ("{}", {"Content-Type": "application/json", "Content-Length": "nope"}, 400),
        ):
            with self.subTest(body=body, headers=headers):
                self.assertEqual(self.request("POST", "/api/probe", body, headers)[0], expected)

    def test_excessively_nested_request_returns_json_error(self):
        with patch.object(app.json, "loads", side_effect=RecursionError("too deeply nested")):
            status, headers, body = self.request("POST", "/api/probe", "{}", {"Content-Type": "application/json"})
        self.assertEqual(status, 400)
        self.assertEqual(headers["Content-Type"], "application/json; charset=utf-8")
        self.assertIn("error", json.loads(body))

    def test_both_api_routes_dispatch_valid_json(self):
        for path, function, payload, result in (
            ("/api/probe", "probe", {"domain": "example.com"}, {"status": "ok", "ip": "1.1.1.1"}),
            ("/api/geo", "lookup_geo", {"ip": "1.1.1.1"}, {"status": "unavailable"}),
        ):
            with self.subTest(path=path), patch.object(app, function, return_value=result) as handler:
                status, _, body = self.request("POST", path, json.dumps(payload), {"Content-Type": "application/json"})
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(body), result)
                handler.assert_called_once_with(payload if function == "probe" else payload["ip"])


if __name__ == "__main__":
    unittest.main()
