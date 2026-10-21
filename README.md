# ROUTE/CHECK · 网站分流测试

比较不同站点的出口 IP 和连接状态，检查 VPN、代理的分流规则。支持自定义站点、本地运行和 GitHub Pages 部署。

## 本地运行

需要 Python 3.8 或更新版本，无第三方依赖。

```sh
python3 app.py --open
```

macOS 也可双击 `start.command`。按 `Ctrl+C` 停止服务。

- **本机网络**：由本地 Python 服务发起请求，线路取决于系统代理、环境变量和 VPN 设置。
- **当前浏览器**：由浏览器发起请求，适合核对浏览器使用的代理。读取出口 IP 需要目标接口允许跨域访问。

## GitHub Pages

将项目上传到 GitHub，在 **Settings → Pages** 选择 **Deploy from a branch**，指定分支和 `/docs` 目录。静态版仅支持“当前浏览器”模式。

界面源码在 `static/`，修改后重新生成并提交 `docs/`：

```sh
python3 build_docs.py
```

## 检测结果

- **获取 IP**：目标接口返回了本次请求的出口 IP。
- **官网有响应**：检测到 HTTPS 响应，不提供出口 IP；浏览器模式可能经过跳转。游戏项检测官网，不代表对局服务器。
- **不支持读取 / 连接失败**：接口不存在、响应无 IP、跨域限制或网络异常；具体原因见该行状态。

添加站点时，可选官网可达性、Cloudflare Trace，或填写同域名的 IP 回显接口路径。普通官网不一定提供这些接口；其他站点的 IP 不能用于推断它的出口。

要核对实际代理节点，可点“浏览器核对”，再用“复制域名”到代理客户端的请求记录中查找该连接及命中规则。游戏对局需查看游戏运行时的连接记录。

## 数据与隐私

检测请求发送到所列目标站点。缺少位置时，已测得的 IP 会发送给 [ipwho.is](https://ipwhois.io/documentation) 查询，并在当前页面缓存；接口超时或限流时显示“位置未提供”。地理位置仅供参考。

自定义站点保存在浏览器中，结果仅保留在当前页面。本地服务只监听 `127.0.0.1`。

切换检测模式或删除目标会取消浏览器侧的旧请求，并忽略迟到结果。本地服务已发出的请求仍可能运行到完成或超时。域名校验不等同于 DNS 公网地址校验，请只添加可信目标。

## 开发与验证

运行网站仍只需要 Python；JavaScript 测试使用 Node.js 24（可执行 `nvm use`）。无需安装 npm 或 Python 依赖：

```sh
python3 -m unittest discover -s tests -v
node --test tests/probe.test.mjs
python3 build_docs.py
git diff --check
```

单元测试使用模拟的上游响应；Python HTTP 测试只启动临时 loopback 服务。覆盖解析、跳转来源、超时/取消、响应大小、API 校验和 Pages 构建，不能据此保证第三方探针当前可用。

`tests/browser-check.js` 是浏览器交互回归：在 Codex 内置浏览器打开本地服务后，通过 Playwright MCP 的 `browser_run_code_unsafe` 加载该文件。它使用模拟网络，检查并发、模式切换、删除、位置查询恢复、复制、焦点、筛选与存储校验。请使用专用测试标签页，运行后关闭；脚本会重置该源的自定义站点存储并安装请求替身。UI 修改还需检查 1440×900 和 390×844 全页截图。

## 项目结构

- `app.py`：本地服务和检测接口。
- `static/`：共用的界面源码。
- `static/probe.mjs`：两种部署共用的校验、解析与浏览器请求逻辑。
- `build_docs.py`：生成 GitHub Pages 静态版。
- `docs/`：生成文件，请勿直接修改。

设计参考 [Sukka 的分流检测](https://ip.skk.moe/split-tunnel)。使用 [MIT 许可证](LICENSE)。
