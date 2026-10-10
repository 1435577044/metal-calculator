#!/usr/bin/env python3
"""通过 GitHub REST API 发布仓库 —— 应对 git 协议被代理拦截。

背景
----
本机 https_proxy(127.0.0.1:2667) 只放行 api.github.com，
对 github.com 的 CONNECT 隧道返回 502，因此 `git push` 不可用
（curl 56 / CONNECT tunnel failed）。

改用 Git Data API：blob → tree → commit → update ref，
全程只访问 api.github.com，且只产生一个提交。

关键约束
--------
1. **空仓库必须先有初始提交**。GitHub 对空仓库的 git/blobs、git/trees
   一律返回 409 "Git Repository is empty"，需先用 Contents API 建首个提交。
2. **不要用 sed 抽 JSON 字段**。GitHub 响应里 URL 含哈希字段，
   贪婪匹配容易抓错；用 json.loads 取顶层键。
3. **不要在 shell 里用 `set -e` + `pipefail` 包 curl**。
   4xx 时 curl 非零退出会让脚本静默中止，看不到任何错误信息。

用法
----
    GITHUB_TOKEN=ghp_xxxx python publish_github.py
    GITHUB_TOKEN=ghp_xxxx python publish_github.py --repo my-repo --message "..."
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

API = "https://api.github.com"
DEFAULT_REPO = "metal-calculator"
DEFAULT_DESC = "金属算量工具：截面特性与理论单重计算，GB 国标型钢规格库"
DEFAULT_MSG = "金属算量工具：截面特性与理论单重计算"


class GitHub:
    def __init__(self, token: str):
        self.token = token

    def request(self, method: str, path: str, payload=None, retries: int = 3):
        """发起 API 请求。失败时抛出带响应体的异常，便于定位。"""
        url = path if path.startswith("http") else f"{API}{path}"
        data = json.dumps(payload).encode() if payload is not None else None
        last_err = None

        for attempt in range(retries):
            req = urllib.request.Request(url, data=data, method=method)
            req.add_header("Authorization", f"Bearer {self.token}")
            req.add_header("Accept", "application/vnd.github+json")
            req.add_header("X-GitHub-Api-Version", "2022-11-28")
            if data:
                req.add_header("Content-Type", "application/json")
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    return json.loads(resp.read().decode() or "{}")
            except urllib.error.HTTPError as e:
                body = e.read().decode(errors="replace")[:400]
                last_err = RuntimeError(f"HTTP {e.code} {method} {path}\n  {body}")
                # 4xx 是请求本身的问题，重试无意义
                if e.code < 500:
                    raise last_err from None
            except Exception as e:                      # 网络抖动
                last_err = RuntimeError(f"{type(e).__name__}: {e}")
            if attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))

        raise last_err or RuntimeError("请求失败")


def tracked_files(root: str) -> list[str]:
    """列出 git 跟踪的文件（已尊重 .gitignore）。"""
    out = subprocess.run(["git", "ls-files"], cwd=root, capture_output=True,
                         text=True, check=True).stdout
    return [f for f in out.splitlines() if f.strip()]


def main() -> int:
    ap = argparse.ArgumentParser(description="通过 GitHub API 发布仓库")
    ap.add_argument("--repo", default=os.environ.get("REPO_NAME", DEFAULT_REPO))
    ap.add_argument("--message", default=DEFAULT_MSG)
    ap.add_argument("--description", default=DEFAULT_DESC)
    ap.add_argument("--private", action="store_true")
    args = ap.parse_args()

    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        print("错误：请设置 GITHUB_TOKEN 环境变量", file=sys.stderr)
        return 1

    root = os.path.dirname(os.path.abspath(__file__))
    gh = GitHub(token)

    # ── 1. 验证令牌 ──
    print("▸ 验证令牌…")
    try:
        login = gh.request("GET", "/user")["login"]
    except RuntimeError as e:
        print(f"  ✗ {e}", file=sys.stderr)
        return 1
    print(f"  ✓ 账号：{login}")

    repo_full = f"{login}/{args.repo}"

    # ── 2. 确保仓库存在 ──
    try:
        gh.request("GET", f"/repos/{repo_full}")
        print(f"▸ 仓库已存在：{repo_full}")
    except RuntimeError:
        print(f"▸ 创建仓库 {repo_full}…")
        gh.request("POST", "/user/repos", {
            "name": args.repo, "description": args.description,
            "private": args.private, "auto_init": False,
        })
        print("  ✓ 已创建")

    files = tracked_files(root)
    print(f"▸ 待发布 {len(files)} 个文件")

    # ── 3. 空仓库先建初始提交（否则 blobs/trees 返回 409）──
    try:
        gh.request("GET", f"/repos/{repo_full}/git/trees/main")
    except RuntimeError:
        seed = files[0]
        print(f"▸ 仓库为空，先用 Contents API 建立初始提交（{seed}）…")
        data = open(os.path.join(root, seed), "rb").read()
        gh.request("PUT", f"/repos/{repo_full}/contents/{seed}", {
            "message": "初始化仓库",
            "content": base64.b64encode(data).decode(),
        })
        print("  ✓ 已初始化")

    # ── 4. 取远端 main 作为父提交 ──
    parent = None
    try:
        parent = gh.request("GET", f"/repos/{repo_full}/git/ref/heads/main").get("object", {}).get("sha")
        print(f"  · 远端 main：{parent}")
    except RuntimeError:
        pass

    # ── 5. 上传每个文件为 blob ──
    print("▸ 上传 blob…")
    entries = []
    for i, rel in enumerate(files, 1):
        with open(os.path.join(root, rel), "rb") as f:
            blob = gh.request("POST", f"/repos/{repo_full}/git/blobs", {
                "content": base64.b64encode(f.read()).decode(),
                "encoding": "base64",
            })
        entries.append({"path": rel, "mode": "100644",
                        "type": "blob", "sha": blob["sha"]})
        print(f"\r  {i}/{len(files)}  {rel:<40}", end="", flush=True)
    print()

    # ── 6. 创建 tree ──
    print("▸ 创建 tree…")
    tree_body = {"tree": entries}
    if parent:
        tree_body["base_tree"] = parent
    tree_sha = gh.request("POST", f"/repos/{repo_full}/git/trees", tree_body)["sha"]
    print(f"  ✓ {tree_sha}")

    # ── 7. 创建提交 ──
    print("▸ 创建提交…")
    commit_body = {"message": args.message, "tree": tree_sha}
    if parent:
        commit_body["parents"] = [parent]
    commit_sha = gh.request("POST", f"/repos/{repo_full}/git/commits", commit_body)["sha"]
    print(f"  ✓ {commit_sha}")

    # ── 8. 更新 main 引用 ──
    print("▸ 更新 main 引用…")
    try:
        if parent:
            gh.request("PATCH", f"/repos/{repo_full}/git/refs/heads/main",
                       {"sha": commit_sha, "force": False})
        else:
            gh.request("POST", f"/repos/{repo_full}/git/refs",
                       {"ref": "refs/heads/main", "sha": commit_sha})
    except RuntimeError:
        # 并发写入导致 ref 快进失败时，强制更新
        gh.request("PATCH", f"/repos/{repo_full}/git/refs/heads/main",
                   {"sha": commit_sha, "force": True})
    print("  ✓ main 已更新")

    # ── 9. 仓库设置 ──
    try:
        gh.request("PATCH", f"/repos/{repo_full}",
                   {"has_issues": True, "has_wiki": False})
    except RuntimeError:
        pass

    print()
    print(f"✓ 发布完成：https://github.com/{repo_full}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
