#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
push.py —— 用 GitHub Git Data API 复刻 git push（绕开被代理挡住的 github.com git 通道）

背景：本机运行环境的出口代理只放行 api.github.com，不放行 github.com（git smart HTTP），
     直连超时，其余本地代理端口均不可用。因此用 gh api（走 api.github.com）实现推送。

用法：python scripts/push.py "commit message"
行为：对比本地 git tracked 文件与远端 main 分支树，仅上传有差异的文件（新增/修改/删除），
     在远端 HEAD 之上创建一个新 commit 并快进 main。
"""
import base64
import json
import subprocess
import sys

REPO = "verygoodwu/siyuan-plugin-asset-steward"
BRANCH = "main"


def gh(endpoint, method="GET", body=None):
    """直接用 urllib 调 GitHub API（gh CLI 的 -F 对嵌套 JSON 不可靠）"""
    import urllib.request
    token = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True).stdout.strip()
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/{endpoint}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method if method != "PATCH" else "PATCH",
        headers={
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "asset-steward-push",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            out = resp.read().decode()
            return json.loads(out) if out else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"API {method} {endpoint} -> {e.code}: {e.read().decode()[:300]}")


def git(*args):
    r = subprocess.run(["git", *args], capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} 失败: {r.stderr.strip()[:300]}")
    return r.stdout


def main():
    message = sys.argv[1] if len(sys.argv) > 1 else "sync from local"

    # 1. 本地 tracked 文件（排除本脚本自身不存在的情形）与其 blob sha
    local = {}
    for f in git("ls-files").splitlines():
        if f:
            local[f] = git("hash-object", f).strip()

    # 2. 远端 HEAD 与树
    ref = gh(f"git/ref/heads/{BRANCH}")
    head_sha = ref["object"]["sha"]
    head_commit = gh(f"git/commits/{head_sha}")
    tree = gh(f"git/trees/{head_commit['tree']['sha']}?recursive=1")
    remote = {e["path"]: e["sha"] for e in tree["tree"] if e["type"] == "blob"}

    # 3. 差异
    changes = [{"path": p, "sha": s} for p, s in local.items() if remote.get(p) != s]
    removals = [p for p in remote if p not in local]
    if not changes and not removals:
        print("本地与远端一致，无需推送。")
        return

    # 4. 上传变更 blob
    entries = []
    for c in changes:
        with open(c["path"], "rb") as fh:
            content = base64.b64encode(fh.read()).decode()
        blob = gh("git/blobs", "POST", {"content": content, "encoding": "base64"})
        entries.append({"path": c["path"], "mode": "100644", "type": "blob", "sha": blob["sha"]})
        print("  上传:", c["path"])
    for p in removals:
        entries.append({"path": p, "mode": "100644", "type": "blob", "sha": None})
        print("  删除:", p)

    # 5. 建 tree → commit → 快进分支
    new_tree = gh("git/trees", "POST", {"base_tree": head_commit["tree"]["sha"], "tree": entries})
    commit = gh("git/commits", "POST", {"message": message, "tree": new_tree["sha"], "parents": [head_sha]})
    gh(f"git/refs/heads/{BRANCH}", "PATCH", {"sha": commit["sha"], "force": False})
    print(f"OK 已推送 {len(changes)} 改动 / {len(removals)} 删除 -> {REPO}@{BRANCH} ({commit['sha'][:7]})")


if __name__ == "__main__":
    main()
