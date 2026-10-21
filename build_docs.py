#!/usr/bin/env python3
"""Build the browser-only GitHub Pages site from the shared UI files."""

from pathlib import Path
from shutil import copyfile


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "static"
DESTINATION = ROOT / "docs"


def main():
    DESTINATION.mkdir(exist_ok=True)
    html = (SOURCE / "index.html").read_text(encoding="utf-8")
    html = html.replace('<body>', '<body data-hosted="true">', 1)
    html = html.replace('href="/static/style.css"', 'href="./style.css"', 1)
    html = html.replace('src="/static/app.js"', 'src="./app.js"', 1)
    html = html.replace('本地实验室', '公开版')
    html = html.replace('仅在本机运行', '浏览器直接检测')
    (DESTINATION / "index.html").write_text(html, encoding="utf-8")
    for name in ("app.js", "style.css", "probe.mjs"):
        copyfile(SOURCE / name, DESTINATION / name)
    (DESTINATION / ".nojekyll").touch()
    print(f"GitHub Pages 站点已生成：{DESTINATION}")


if __name__ == "__main__":
    main()
