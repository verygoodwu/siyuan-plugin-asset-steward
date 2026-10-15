#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
submit-bazaar-pr.py —— 向思源官方集市 siyuan-note/bazaar 提交收录 PR

背景：集市 2026 年起不再自动扫描 GitHub topic，收录必须在 bazaar 仓库的
     plugins.txt 里加一行 owner/repo 并提 PR（官方 README「提交集市包」流程）。

流程：fork 已存在（verygoodwu/bazaar，需先手动/脚本 merge-upstream 同步）→
     在 fork 的 main 上用 Git Data API 追加一行 plugins.txt →
     向 siyuan-note/bazaar 的 main 提 PR。

用法：python scripts/submit-bazaar-pr.py
幂等：若 fork 上 plugins.txt 已包含目标行或上游已有同源开启 PR，则跳过不再提交。
"""
import base64
import json
import subprocess
import sys
import urllib.request

FORK = "verygoodwu/bazaar"
UPSTREAM = "siyuan-note/bazaar"
BRANCH = "main"
LINE = "verygoodwu/siyuan-plugin-asset-steward"
PR_TITLE = f"Add {LINE}"
PR_BODY = (
    "### 新增集市包\n\n"
    f"- 包类型：插件\n"
    f"- 包仓库：{LINE}\n\n"
    "多端资产管理与记账插件：资产/负债总览、收支记账、订阅/保单/贷款/储蓄管理、"
    "Canvas 图表与 AI 点评。已通过 GitHub Actions CI 构建并发布 package.zip。"
)


def gh(repo, endpoint, method="GET", body=None):
    token = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True).stdout.strip()
    req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/{endpoint}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "asset-steward-bazaar-pr",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            out = resp.read().decode()
            return json.loads(out) if out else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"API {method} {repo}/{endpoint} -> {e.code}: {e.read().decode()[:400]}")


def main():
    # 0. 幂等检查：上游是否已有同 head 的开启 PR
    pulls = gh(UPSTREAM, f"pulls?head=verygoodwu:{BRANCH}&state=open")
    if pulls:
        print(f"已有开启中的 PR #{pulls[0]['number']}: {pulls[0]['title']}")
        print(f"地址: {pulls[0]['html_url']}")
        return

    # 1. 取 fork main 分支头
    ref = gh(FORK, f"git/ref/heads/{BRANCH}")
    head_sha = ref["object"]["sha"]
    head_commit = gh(FORK, f"git/commits/{head_sha}")
    base_tree = head_commit["tree"]["sha"]
    print(f"fork main HEAD: {head_sha[:10]}, tree: {base_tree[:10]}")

    # 2. 读 plugins.txt 现内容
    f = gh(FORK, "contents/plugins.txt?ref=" + BRANCH)
    content = base64.b64decode(f["content"]).decode("utf-8")
    if LINE in content.splitlines():
        print("plugins.txt 已包含目标行，无需提交")
        return
    if content and not content.endswith("\n"):
        content += "\n"
    new_content = content + LINE + "\n"
    print(f"plugins.txt: {len(content.splitlines())} 行 -> {len(new_content.splitlines())} 行")

    # 3. blob -> tree -> commit -> 快进 main（全部走 Git Data API）
    blob = gh(FORK, "git/blobs", "POST", {
        "content": base64.b64encode(new_content.encode("utf-8")).decode(),
        "encoding": "base64",
    })
    tree = gh(FORK, "git/trees", "POST", {
        "base_tree": base_tree,
        "tree": [{"path": "plugins.txt", "mode": "100644", "type": "blob", "sha": blob["sha"]}],
    })
    commit = gh(FORK, "git/commits", "POST", {
        "message": PR_TITLE,
        "tree": tree["sha"],
        "parents": [head_sha],
    })
    gh(FORK, f"git/refs/heads/{BRANCH}", "PATCH", {"sha": commit["sha"], "force": False})
    print(f"fork 已提交: {commit['sha'][:10]}")

    # 4. 向上游提 PR
    pr = gh(UPSTREAM, "pulls", "POST", {
        "title": PR_TITLE,
        "body": PR_BODY,
        "head": f"verygoodwu:{BRANCH}",
        "base": BRANCH,
    })
    print(f"PR 已创建: #{pr['number']} {pr['html_url']}")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        print(f"失败: {e}", file=sys.stderr)
        sys.exit(1)
