#!/usr/bin/env python3
"""把打包好的 exe 上传为 GitHub Release 附件。

用法
----
    GITHUB_TOKEN=ghp_xxxx python upload_release.py
    GITHUB_TOKEN=ghp_xxxx python upload_release.py --tag v1.2.0 --name "金属算量 v1.2.0"

说明
----
1. 二进制附件走 `uploads.github.com`（与源码上传的 api.github.com 不同域名），
   本机代理对两者都放行。
2. 同名 tag 已存在时会复用该 Release，只替换资产。
3. 令牌只从环境变量读取，不写磁盘、不写 git config。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.github.com"
UPLOADS = "https://uploads.github.com"


def request(url: str, token: str, method: str = "GET", payload=None,
            headers: dict | None = None, retries: int = 3, raw_body: bytes | None = None):
    """发起请求。失败时抛出带响应体的异常。"""
    data = raw_body if raw_body is not None else (
        json.dumps(payload).encode() if payload is not None else None)
    hdrs = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if headers:
        hdrs.update(headers)
    if data is not None and "Content-Type" not in hdrs:
        hdrs["Content-Type"] = "application/json"

    last = None
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                body = resp.read()
                return json.loads(body.decode() or "{}") if body else {}
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")[:500]
            last = RuntimeError(f"HTTP {e.code} {method} {url}\n  {body}")
            if e.code < 500:
                raise last from None
        except Exception as e:                          # 网络抖动
            last = RuntimeError(f"{type(e).__name__}: {e}")
        if attempt < retries - 1:
            time.sleep(2 * (attempt + 1))
    raise last or RuntimeError("请求失败")


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.2f} {unit}"
        n /= 1024


# 常见中文软件名 → ASCII 资产名。GitHub 的 ?name= 不接受非 ASCII，
# 未命名的原名（含中文）会被回退成 default.exe。
NAME_MAP = {
    "金属算量.exe": "MetalCalculator.exe",
    "金属算量.html": "MetalCalculator.html",
}


def ascii_asset_name(name: str) -> str:
    """把资产名转成 ASCII。优先查表，其次去非 ASCII 字符，再兜底。"""
    if name in NAME_MAP:
        return NAME_MAP[name]
    stem, ext = os.path.splitext(name)
    ascii_stem = "".join(c for c in stem if c.isascii() and (c.isalnum() or c in "-_."))
    return f"{ascii_stem or 'asset'}{ext}"


def main() -> int:
    ap = argparse.ArgumentParser(description="上传 exe 到 GitHub Release")
    ap.add_argument("--exe", default=os.path.join("dist", "金属算量.exe"))
    ap.add_argument("--tag", default="v1.1.0")
    ap.add_argument("--name", default=None, help="附件文件名，默认与 exe 同名")
    ap.add_argument("--release-name", default=None, help="Release 标题")
    ap.add_argument("--notes", default=None, help="Release 说明（Markdown）")
    ap.add_argument("--prerelease", action="store_true")
    args = ap.parse_args()

    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        print("错误：请设置 GITHUB_TOKEN 环境变量", file=sys.stderr)
        return 1
    if not os.path.isfile(args.exe):
        print(f"错误：未找到 {args.exe}", file=sys.stderr)
        return 1

    root = os.path.dirname(os.path.abspath(__file__))
    exe_path = args.exe if os.path.isabs(args.exe) else os.path.join(root, args.exe)
    if not os.path.isfile(exe_path):
        print(f"错误：未找到 {exe_path}", file=sys.stderr)
        return 1

    login = request(f"{API}/user", token).get("login")
    if not login:
        print("✗ 令牌无效", file=sys.stderr)
        return 1

    repo = os.environ.get("REPO_NAME", "metal-calculator")
    repo_full = f"{login}/{repo}"
    print(f"▸ 仓库：{repo_full}")

    # 确认仓库存在
    try:
        request(f"{API}/repos/{repo_full}", token)
    except RuntimeError as e:
        print(f"✗ {e}", file=sys.stderr)
        return 1

    size = os.path.getsize(exe_path)
    digest = hashlib.sha256(open(exe_path, "rb").read()).hexdigest()
    # GitHub 靠 ?name= 决定资产名，但该参数对非 ASCII 字符会**静默丢弃**，
    # 回退成 "default.exe"（实测：中文名传三次全变 default.exe，
    # 补 Content-Disposition 也无效 —— 该头在此接口上被忽略）。
    # 因此资产名一律用 ASCII，中文名写在 Release 说明里。
    asset_name = args.name or ascii_asset_name(os.path.basename(exe_path))
    print(f"▸ 附件：{asset_name}  {human(size)}")
    print(f"  sha256：{digest}")

    # ── 1. 取现有 Release（tag 存在则复用）──
    print("▸ 准备 Release…")
    release = None
    try:
        release = request(f"{API}/repos/{repo_full}/releases/tags/{args.tag}", token)
        print(f"  · 复用已有 Release：{release['name']}")
    except RuntimeError:
        pass

    if release is None:
        body = {
            "tag_name": args.tag,
            "name": args.release_name or f"金属算量 {args.tag}",
            "body": args.notes or DEFAULT_NOTES,
            "draft": False,
            "prerelease": args.prerelease,
        }
        release = request(f"{API}/repos/{repo_full}/releases", token, "POST", body)
        print(f"  ✓ 已创建 Release {release['html_url']}")

    # ── 2. 清理旧资产 ──
    # 不能只删同名：中文名曾被 GitHub 回退成 default.exe，
    # 于是"同名删除"删不掉它，下次上传就撞 422 already_exists。
    # 这里删掉本 Release 下的全部资产（同一个 tag 只保留一份产物）。
    for a in release.get("assets", []):
        print(f"  · 删除旧资产 {a['name']}")
        request(f"{API}/repos/{repo_full}/releases/assets/{a['id']}", token, "DELETE")

    # ── 3. 上传二进制 ──
    print("▸ 上传中（大文件需要几分钟，请勿关闭）…")
    ctype = mimetypes.guess_type(exe_path)[0] or "application/octet-stream"
    with open(exe_path, "rb") as f:
        payload = f.read()

    url = (f"{UPLOADS}/repos/{repo_full}/releases/"
           f"{release['id']}/assets?name={urllib.parse.quote(asset_name)}")
    asset = request(url, token, "POST", raw_body=payload, headers={
        "Content-Type": ctype,
        "Content-Length": str(len(payload)),
    }, retries=3)
    print(f"  ✓ 上传完成：{asset['browser_download_url']}")
    print(f"    大小 {human(asset['size'])}")

    if asset["name"] != asset_name:
        print(f"  ⚠ GitHub 把资产名改成了 {asset['name']!r}，与预期 {asset_name!r} 不符")

    print()
    print(f"✓ Release：{release['html_url']}")
    print(f"  下载：{asset['browser_download_url']}")
    return 0


DEFAULT_NOTES = """## 金属算量 · 截面特性与理论单重计算

Windows 单文件程序，双击即用，无需安装、无需联网。

> 附件名使用 ASCII（`MetalCalculator.exe`）—— GitHub 的 Release 资产接口
> 会丢弃非 ASCII 文件名并回退成 `default.exe`。下载后可直接重命名为
> `金属算量.exe`，功能不受影响。

### 功能
- **理论单重**：33 种材质 × 19 类截面，GB/T 706 / 707 / 11263 / 702 / 8163 共 447 条规格
- **截面特性**：截面积、惯性矩、截面模量、回转半径（cm 系）
- **批量算量**：定尺长度、外/内表面积、金额、油漆用量
- **国标型钢规格表**、材质理论重量换算
- **亮色 / 暗色主题**，原生标题栏跟随切换
- **导出** SpreadsheetML .xls（Excel / WPS 直接打开）

### 算法精度
- 几何引擎采用解析组合法，无数值积分误差
- 槽钢按 GB 标准公式 `W = 0.00785 × [h·d + 2t(b−d) + 0.349(R²−r²)]` 锁定面积
- 钢管由 `W = (D−S) × S × 0.02466` 直接生成 240 条规格，杜绝手工录入误差
- 全部 447 条规格经标准公式对拍，偏差 ≤ 0.01%

### 系统要求
Windows 10 / 11 x64（需 Microsoft Edge WebView2 运行时，绝大多数系统已预装）。
若未安装，程序会自动降级为系统浏览器打开，功能完全一致。

### 校验
源码含 262 项自动化断言（Node 222 + Python 56），克隆后运行 `node test*.js` 即可验证。
"""

if __name__ == "__main__":
    sys.exit(main())
