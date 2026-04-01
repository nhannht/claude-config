---
name: recoll-query
version: 1.0.0
description: |
  Full-text search across the server's indexed files using Recoll (Xapian engine).
  Searches /home/ubuntu, /data, /docker_config. Covers markdown, code, PDFs, office docs,
  images (OCR via tesseract), Jupyter notebooks, configs, and more.
  Use when asked to "find files about X", "search for X", "where did I write about X",
  or any full-text content search across the server.
allowed-tools:
  - Bash
  - Read
---

## How to use Recoll

### Basic search
```bash
recollq "your search terms"
```

### Common options
| Flag | Purpose | Example |
|------|---------|---------|
| `-n N` | Limit to N results (default 10) | `recollq -n 20 "docker"` |
| `-n 0` | Show ALL results | `recollq -n 0 "stalwart"` |
| `-a` | Show all metadata fields | `recollq -a "password"` |
| `-m` | Machine-readable output | `recollq -m "config"` |
| `-A` | Show abstracts/snippets | `recollq -A "error handling"` |

### Query syntax
| Syntax | Meaning | Example |
|--------|---------|---------|
| `word1 word2` | AND (both required) | `recollq "docker compose"` |
| `word1 OR word2` | Either word | `recollq "stalwart OR postfix"` |
| `"exact phrase"` | Exact match | `recollq '"mail server"'` |
| `-word` | Exclude | `recollq "docker -compose"` |
| `field:value` | Field search | `recollq "filename:docker-compose.yml"` |
| `dir:/path` | Restrict to directory | `recollq "dir:/docker_config password"` |
| `ext:pdf` | File extension filter | `recollq "ext:pdf calculus"` |
| `mime:text/markdown` | MIME type filter | `recollq "mime:text/markdown TODO"` |
| `size>1M` | Size filter | `recollq "size>1M ext:pdf"` |

### Useful field names
- `filename:` — match filename
- `dir:` — restrict to directory tree
- `ext:` — file extension
- `mime:` — MIME type
- `author:` — document author
- `title:` — document title
- `date:` — date range (`date:2026-01/2026-03`)

### Trigger reindex
```bash
# Incremental (fast, only changed files)
sudo recollindex -c /home/ubuntu/.recoll

# Full rebuild (slow, reindex everything)
sudo recollindex -c /home/ubuntu/.recoll -z
```
Cron runs incremental reindex every 4 hours automatically.

### What's indexed
- **Dirs:** `/home/ubuntu`, `/data`, `/docker_config`
- **Skipped:** `.git`, `node_modules`, `__pycache__`, `.cache`, `.gradle`, `.cargo`, `.rustup`, build artifacts
- **OCR:** Tesseract (eng+vie) for scanned PDFs and images
- **Jupyter:** Notebooks converted via `jupyter nbconvert`
- **Index size:** ~880MB in `~/.recoll/xapiandb`

### Tips
- Use `recollq` (CLI) not `recoll` (GUI — no display on this server)
- Pipe to grep for further filtering: `recollq -n 0 "docker" | grep yml`
- For email search, use `mailsearch` instead (JMAP-based, searches Stalwart mailbox)
