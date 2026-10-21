"""Build into an isolated directory; never overwrite the checked-in Pages site."""

import contextlib
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import build_docs


class BuildDocsTests(unittest.TestCase):
    def test_generated_site_uses_hosted_mode_and_relative_assets(self):
        with tempfile.TemporaryDirectory(prefix="route-check-build-") as directory:
            destination = Path(directory) / "docs"
            with patch.object(build_docs, "DESTINATION", destination), contextlib.redirect_stdout(io.StringIO()):
                build_docs.main()
                html = (destination / "index.html").read_text(encoding="utf-8")
                self.assertIn('data-hosted="true"', html)
                self.assertIn('href="./style.css"', html)
                self.assertIn('src="./app.js"', html)
                self.assertNotIn("/static/", html)
                self.assertNotIn("本地实验室", html)
                self.assertNotIn("仅在本机运行", html)
                self.assertTrue((destination / ".nojekyll").exists())
                for name in ("app.js", "style.css", "probe.mjs"):
                    self.assertEqual((destination / name).read_bytes(), (build_docs.SOURCE / name).read_bytes())
                before = {item.name: item.read_bytes() for item in destination.iterdir()}
                build_docs.main()
                self.assertEqual(before, {item.name: item.read_bytes() for item in destination.iterdir()})


if __name__ == "__main__":
    unittest.main()
