from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
DATA = ROOT / "data"
REPOS = DATA / "repos"


def run_git(args: list[str], cwd: Path, timeout: int = 30) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "git command failed")
    return proc.stdout


def safe_repo_name(repo_url: str) -> str:
    parsed = urlparse(repo_url)
    path = parsed.path.strip("/").removesuffix(".git")
    if parsed.scheme not in {"http", "https"} or parsed.netloc.lower() != "github.com":
        raise ValueError("Paste a public GitHub repository URL, for example https://github.com/org/repo")
    parts = [part for part in path.split("/") if part]
    if len(parts) < 2:
        raise ValueError("GitHub URL must include an owner and repository name.")
    return re.sub(r"[^a-zA-Z0-9_.-]+", "_", "_".join(parts[:2]))


def ensure_repo(repo_url: str) -> Path:
    REPOS.mkdir(parents=True, exist_ok=True)
    target = REPOS / safe_repo_name(repo_url)
    if (target / ".git").exists():
        try:
            run_git(["fetch", "--all", "--prune"], target, timeout=60)
        except Exception:
            pass
        return target

    tmp = target.with_name(f"{target.name}.tmp")
    if tmp.exists():
        shutil.rmtree(tmp)
    subprocess.run(
        ["git", "clone", "--filter=blob:none", "--no-tags", repo_url, str(tmp)],
        cwd=str(REPOS),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=180,
        check=True,
        encoding="utf-8",
        errors="replace",
    )
    tmp.rename(target)
    return target


def local_repo(repo_url: str) -> Path | None:
    try:
        target = REPOS / safe_repo_name(repo_url)
    except ValueError:
        return None
    return target if (target / ".git").exists() else None


def split_records(output: str) -> list[list[str]]:
    return [line.split("\x1f") for line in output.splitlines() if line.strip()]


def find_symbol_files(repo: Path, symbol: str) -> list[dict[str, Any]]:
    escaped = re.escape(symbol.strip())
    patterns = [
        rf"\bdef\s+{escaped}\b",
        rf"\bclass\s+{escaped}\b",
        rf"\bfunction\s+{escaped}\b",
        rf"\bconst\s+{escaped}\b",
        rf"\blet\s+{escaped}\b",
        rf"\bvar\s+{escaped}\b",
        rf"\b{escaped}\s*[:=]\s*",
        rf"\b{escaped}\b",
    ]
    matches: list[dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()
    for pattern in patterns:
        try:
            output = run_git(["grep", "-n", "-I", "-E", pattern, "HEAD"], repo, timeout=20)
        except Exception:
            continue
        for line in output.splitlines():
            bits = line.split(":", 3)
            if len(bits) < 4:
                continue
            _, path, line_no, text = bits
            key = (path, int(line_no))
            if key in seen:
                continue
            seen.add(key)
            matches.append({"path": path, "line": int(line_no), "text": text.strip()[:240]})
            if len(matches) >= 12:
                return matches
    return matches


def commit_rows(repo: Path, path: str | None = None, limit: int = 60, since: str | None = None) -> list[dict[str, Any]]:
    args = ["log", f"--max-count={limit}", "--date=short", "--pretty=%H%x1f%an%x1f%ad%x1f%s"]
    if since:
        args.insert(1, f"--since={since}")
    if path:
        args.extend(["--follow", "--", path])
    rows = split_records(run_git(args, repo, timeout=30))
    return [
        {"hash": row[0], "short": row[0][:8], "author": row[1], "date": row[2], "subject": row[3]}
        for row in rows
        if len(row) >= 4
    ]


def first_commit(repo: Path, path: str | None, fallback_symbol: str) -> dict[str, Any] | None:
    commits = commit_rows(repo, path, limit=300)
    if commits:
        return commits[-1]
    try:
        output = run_git(
            ["log", "--all", "--reverse", "--date=short", "--pretty=%H%x1f%an%x1f%ad%x1f%s", "-S", fallback_symbol],
            repo,
            timeout=30,
        )
        rows = split_records(output)
        if rows:
            row = rows[0]
            return {"hash": row[0], "short": row[0][:8], "author": row[1], "date": row[2], "subject": row[3]}
    except Exception:
        return None
    return None


def contributors(repo: Path, path: str | None) -> list[dict[str, Any]]:
    args = ["log", "--format=%an"]
    if path:
        args.extend(["--", path])
    names = [line.strip() for line in run_git(args, repo, timeout=30).splitlines() if line.strip()]
    total = max(len(names), 1)
    counts: dict[str, int] = {}
    for name in names:
        counts[name] = counts.get(name, 0) + 1
    return [
        {"name": name, "commits": count, "share": round((count / total) * 100)}
        for name, count in sorted(counts.items(), key=lambda item: item[1], reverse=True)[:8]
    ]


def repo_full_name(repo_url: str) -> str:
    parsed = urlparse(repo_url)
    return "/".join(parsed.path.strip("/").removesuffix(".git").split("/")[:2])


def github_item(repo_url: str, ref: str) -> dict[str, str] | None:
    full_name = repo_full_name(repo_url)
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "git-archaeologist-prototype"}
    for kind, label in [("pulls", "pull request"), ("issues", "issue")]:
        request = urllib.request.Request(f"https://api.github.com/repos/{full_name}/{kind}/{ref}", headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                payload = json.loads(response.read().decode("utf-8"))
            return {
                "id": f"#{ref}",
                "source": label,
                "evidence": payload.get("title") or payload.get("body", "")[:180] or "Referenced from Git history.",
                "url": payload.get("html_url", ""),
            }
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError):
            continue
    return None


def related_discussions(repo_url: str, commits: list[dict[str, Any]]) -> list[dict[str, str]]:
    found: list[dict[str, str]] = []
    seen: set[str] = set()
    for commit in commits:
        refs = re.findall(r"(?:#|pull/|issues/)(\d+)", commit["subject"], flags=re.I)
        for ref in refs:
            if ref in seen:
                continue
            seen.add(ref)
            item = github_item(repo_url, ref) or {
                "id": f"#{ref}",
                "source": "commit message",
                "evidence": commit["subject"],
                "url": "",
            }
            item["commit"] = commit["short"]
            found.append(item)
    return found[:8]


def cochanged_files(repo: Path, commits: list[dict[str, Any]], selected: str | None) -> list[str]:
    counts: dict[str, int] = {}
    for commit in commits[:20]:
        try:
            output = run_git(["show", "--name-only", "--pretty=", commit["hash"]], repo, timeout=15)
        except Exception:
            continue
        for path in output.splitlines():
            path = path.strip()
            if not path or path == selected:
                continue
            counts[path] = counts.get(path, 0) + 1
    return [path for path, _ in sorted(counts.items(), key=lambda item: item[1], reverse=True)[:12]]


def knowledge_map(selected: str | None, related: list[str]) -> dict[str, Any]:
    root_label = selected.split("/")[0] if selected and "/" in selected else "Repository"
    children: dict[str, list[str]] = {}
    for path in ([selected] if selected else []) + related:
        if not path:
            continue
        parts = path.split("/")
        group = parts[0] if len(parts) > 1 else "root"
        leaf = "/".join(parts[1:]) if len(parts) > 1 else parts[0]
        children.setdefault(group, [])
        if leaf not in children[group]:
            children[group].append(leaf)
    return {
        "root": root_label,
        "groups": [{"name": name, "items": items[:5]} for name, items in children.items()][:8],
    }


def risk_score(recent_count: int, contributors_count: int, related_count: int) -> dict[str, Any]:
    score = min(100, recent_count * 5 + contributors_count * 4 + related_count * 3)
    if score >= 70:
        level = "High"
    elif score >= 35:
        level = "Medium"
    else:
        level = "Low"
    reasons = []
    if recent_count:
        reasons.append(f"Changed {recent_count} times in the last 6 months.")
    if contributors_count >= 4:
        reasons.append(f"Touched by {contributors_count} contributors.")
    if related_count >= 6:
        reasons.append(f"Often changes alongside {related_count} nearby files.")
    return {"level": level, "score": score, "reasons": reasons or ["Low recent churn in available history."]}


def answer_summary(symbol: str, first: dict[str, Any] | None, commits: list[dict[str, Any]], selected: str | None, risk: dict[str, Any]) -> str:
    if first:
        intro = f"{symbol} appears to exist because of work introduced on {first['date']} by {first['author']}: \"{first['subject']}\"."
    else:
        intro = f"I could not find the creation commit for {symbol}, but I found related repository history."
    themes = []
    text = " ".join(commit["subject"].lower() for commit in commits[:30])
    for word in ["bug", "fix", "customer", "enterprise", "billing", "performance", "cache", "tax", "security", "migration"]:
        if word in text:
            themes.append(word)
    theme_sentence = f" Commit messages point toward {', '.join(themes[:5])} as recurring reasons." if themes else ""
    file_sentence = f" The strongest evidence is in {selected}." if selected else ""
    return f"{intro}{theme_sentence}{file_sentence} Current removal risk looks {risk['level'].lower()} based on churn and related files."


def analyze(repo_url: str, symbol: str, question: str) -> dict[str, Any]:
    if not symbol.strip():
        raise ValueError("Ask about a function, class, file, or symbol name.")
    repo = ensure_repo(repo_url)
    matches = find_symbol_files(repo, symbol)
    selected = matches[0]["path"] if matches else None
    commits = commit_rows(repo, selected, limit=80) if selected else commit_rows(repo, None, limit=40)
    first = first_commit(repo, selected, symbol)
    related = cochanged_files(repo, commits, selected)
    since = (datetime.now(timezone.utc) - timedelta(days=183)).strftime("%Y-%m-%d")
    recent = commit_rows(repo, selected, limit=200, since=since) if selected else []
    people = contributors(repo, selected)
    risk = risk_score(len(recent), len(people), len(related))

    return {
        "repo": repo_url,
        "symbol": symbol,
        "question": question,
        "selectedFile": selected,
        "matches": matches,
        "history": {
            "created": first,
            "recentCommits": commits[:12],
            "evolution": [
                {"date": commit["date"], "event": commit["subject"], "author": commit["author"], "commit": commit["short"]}
                for commit in reversed(commits[:12])
            ],
        },
        "discussions": related_discussions(repo_url, commits),
        "contributors": people,
        "risk": risk,
        "knowledgeMap": knowledge_map(selected, related),
        "summary": answer_summary(symbol, first, commits, selected, risk),
    }


def demo_payload() -> dict[str, Any]:
    return {
        "repo": "https://github.com/example/acme-billing",
        "symbol": "calculate_discount",
        "question": "Why does calculate_discount() exist?",
        "selectedFile": "services/billing/discounts.py",
        "matches": [
            {"path": "services/billing/discounts.py", "line": 42, "text": "def calculate_discount(user, invoice):"}
        ],
        "history": {
            "created": {
                "hash": "9f2c6d1a7b8c",
                "short": "9f2c6d1a",
                "author": "John Doe",
                "date": "2024-03-15",
                "subject": "Add enterprise discount handling for contract billing #234",
            },
            "recentCommits": [],
            "evolution": [
                {"date": "2024-03-15", "event": "Function created for enterprise billing rules", "author": "John Doe", "commit": "9f2c6d1a"},
                {"date": "2025-01-08", "event": "Tax-aware discount calculation added", "author": "Alice Chen", "commit": "a81c0d44"},
                {"date": "2026-02-19", "event": "Memoized price book lookup for performance", "author": "Bob Rao", "commit": "c17b991e"},
            ],
        },
        "discussions": [
            {"id": "#234", "source": "issue", "evidence": "Customers were receiving incorrect discounts.", "commit": "9f2c6d1a"},
            {"id": "#512", "source": "pull request", "evidence": "Added custom discount handling.", "commit": "a81c0d44"},
        ],
        "contributors": [
            {"name": "Alice", "commits": 18, "share": 60},
            {"name": "Bob", "commits": 6, "share": 20},
            {"name": "Charlie", "commits": 3, "share": 10},
        ],
        "risk": {"level": "High", "score": 84, "reasons": ["Changed 45 times in the last 6 months.", "Often changes alongside 12 nearby files."]},
        "knowledgeMap": {
            "root": "services",
            "groups": [
                {"name": "services", "items": ["billing/discounts.py", "billing/taxes.py", "payments/invoices.py"]},
                {"name": "docs", "items": ["enterprise-contracts.md"]},
            ],
        },
        "summary": "This function exists primarily to support enterprise billing rules. Removing it could affect billing, tax, and invoice paths that changed alongside it.",
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/api/demo":
            self.send_json(200, demo_payload())
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path != "/api/analyze":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length)
            payload = json.loads(body.decode("utf-8"))
            result = analyze(
                str(payload.get("repoUrl", "")).strip(),
                str(payload.get("symbol", "")).strip(),
                str(payload.get("question", "")).strip(),
            )
            self.send_json(200, result)
        except subprocess.CalledProcessError as exc:
            detail = exc.stderr or exc.stdout or str(exc)
            self.send_json(502, {"error": "Git could not clone or inspect that repository.", "detail": detail[-800:]})
        except Exception as exc:
            self.send_json(400, {"error": str(exc)})


def main() -> None:
    port = int(os.environ.get("PORT", "8000"))
    PUBLIC.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Git Archaeologist running at http://127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
