# Git Archaeologist

A runnable prototype for asking why code exists by combining source search, commit history, contributors, churn, and related files.

## Run

```bash
python server.py
```

Open `http://127.0.0.1:8000`.

## What works now

- Paste a public GitHub repository URL.
- Ask about a function, class, or symbol.
- The app clones the repo, finds source matches, traces commit history, estimates contributors, flags churn risk, and builds a lightweight knowledge map.
- A demo report is included for quick product review without cloning.

## Production direction

The included `requirements.txt` captures the intended YC-scale stack: FastAPI, GitPython, OpenAI/LangChain, ChromaDB, and PostgreSQL. The prototype uses only Python's standard library plus `git` so it runs immediately in this workspace.
