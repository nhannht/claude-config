---
name: code-review
description: Pre-commit code review. Reviews staged changes for bugs, security issues, and code quality. Language-agnostic with specialized checks per platform.
user-invocable: true
---

# Pre-Commit Code Review

## Overview

Iterative code review loop: lint + IDE inspect → simplify/fix → re-check until clean. Blocks commits unless all CRITICAL and WARNING findings are resolved.

## Usage

```bash
/code-review
/code-review server/internal/handlers/
/code-review --focus security
```

## Arguments

- **path** (positional, optional): Limit review to changes in this path
- **--focus <area>**: Focus on a specific area: `security`, `performance`, `logic`, `style`

## Workflow

### Step 1 - Get Staged Changes

Run `git diff --cached` (or `git diff` if nothing staged). Save the output for analysis.

### Step 2 - Classify Files

Parse the diff for file paths. Auto-detect platforms:

| File extensions / paths | Platform |
|------------------------|----------|
| `*.go` | `go` |
| `*.ts`, `*.tsx`, `*.js`, `*.jsx` | `typescript` |
| `*.py` | `python` |
| `*.kt`, `*.java` | `jvm` |
| `*.rs` | `rust` |
| `*.cpp`, `*.c`, `*.h` | `cpp` |
| `*.md`, `*.yml`, `*.json`, config files only | `non-code` |

### Step 3 - Skip Non-Code

If ALL changed files are non-code (docs, config, formatting only):
- Report: "No code review needed - docs/config changes only"
- Create the marker file (see Marker File section below)
- Stop. No further review needed.

### Step 4 - Review Loop

Repeat the following cycle until no CRITICAL or WARNING findings remain, up to **3 iterations max**.

#### 4a - Linters (Mechanical)

Run platform-specific linters on changed files ONLY:

- Go: `golangci-lint run --new-from-rev=HEAD ./...`
- TypeScript/JS: `eslint` or `biome` (check project config)
- Python: `ruff check` or `flake8`
- Rust: `cargo clippy`

If no linter configured, skip and note it.

#### 4b - JetBrains IDE Inspections

If JetBrains MCP is available, run `mcp__jetbrains__get_file_problems` on each changed code file. Skip non-code files. Call in parallel batches (up to 10 files).

**Severity mapping:**
- JetBrains `ERROR` -> **CRITICAL**
- JetBrains `WARNING` -> **WARNING**

If JetBrains MCP is unavailable, log and skip.

#### 4c - Simplify (Semantic Review + Fix)

Invoke `/simplify` on the changed files. This launches 3 parallel review agents:

1. **Code Reuse** — finds duplicated logic, existing utilities that should be used instead
2. **Code Quality** — redundant state, parameter sprawl, copy-paste, leaky abstractions, unnecessary comments
3. **Efficiency** — unnecessary work, missed concurrency, hot-path bloat, memory leaks, N+1 patterns

**Key difference from standalone `/simplify`:** Within the review loop, simplify **fixes issues directly** — then the loop re-runs linters and IDE inspections to verify the fixes didn't introduce new problems.

#### 4d - Check & Loop

After simplify fixes:
- Re-run linters (4a) and IDE inspections (4b) on the modified files
- If new CRITICAL or WARNING findings → loop back to 4c (simplify fixes again)
- If clean → exit loop
- If iteration 3 reached and still failing → exit loop, report remaining findings

### Step 5 - Report

Output findings grouped by severity: **CRITICAL -> WARNING -> INFO -> OK**

Include the source of each finding (Linter, IDE, or Simplify) and which iteration found it.

```markdown
## Pre-Commit Code Review

**Files changed**: N
**Platforms detected**: go, typescript, ...
**Review iterations**: N
**Pass 1 (Linters)**: PASSED / FAILED / SKIPPED
**Pass 2 (JetBrains IDE)**: PASSED / FAILED / SKIPPED
**Pass 3 (Simplify)**: N issues found, M fixed
**Findings**: X critical, Y warning, Z info

---

### CRITICAL

**[Source]** **file:line** - Title
> Description of the issue.
>
> Fix: Suggested fix.

---

### WARNING

...

---

### INFO

...

---

### OK (no issues)

- `file.ext` - Brief note
```

### Step 6 - Severity Gate

- If ANY **CRITICAL** or **WARNING** findings remain after all iterations -> do NOT create marker. Report: "Fix these before committing."
- If only **INFO** or no findings -> create the marker file (see below).

## Marker File (MANDATORY)

**If ANY CRITICAL or WARNING findings remain:**
- Do NOT create the marker file
- Tell the user to fix issues and re-run `/code-review`

**If only INFO or no findings:**
```bash
git diff --cached | sha256sum | cut -d' ' -f1 > /tmp/claude-code-review-passed
```
This hash ensures the marker is only valid for the exact staged content that was reviewed.

## Checklist

The following checklist guides both the IDE inspections and the simplify pass. Linters handle mechanical checks; simplify handles semantic ones.

### All Languages

**Logic**:
- Off-by-one errors in loops and slices/arrays
- Nil/null/undefined pointer dereferences
- Missing error handling or swallowed errors
- Race conditions in concurrent code
- Edge cases: empty inputs, zero values, negative numbers, boundary conditions

**Security**:
- SQL/NoSQL injection (raw string concatenation in queries)
- Hardcoded secrets, tokens, or credentials
- Missing auth checks on protected endpoints/routes
- Input validation gaps (user-supplied data used without sanitization)
- Sensitive data in logs (passwords, tokens, emails, PII)
- XSS vulnerabilities (unescaped user content in HTML)
- Path traversal (user input in file paths)
- Command injection (user input in shell commands)

**Backwards Compatibility**:
- API changes must be additive (no breaking removals without versioning)
- Database migrations must be reversible
- New environment variables must have sensible defaults

### Performance (All Languages)

**Memory & Resources**:
- Goroutine/thread/task leaks (no cancellation, no cleanup)
- Observable/subscription/listener leaks (missing unsubscribe/cleanup)
- Unbounded in-memory caches or collections that grow without eviction
- Unclosed resources (file handles, HTTP bodies, DB connections, streams)

**Database** (when applicable):
- N+1 query patterns
- Missing indexes on filtered/sorted/joined columns
- Unbounded queries without LIMIT
- Large transactions holding locks too long

**Network** (when applicable):
- HTTP clients without timeouts
- Missing retry with backoff on transient failures
- Missing cancellation propagation

## Tools & Model Requirements

- **Code reading**: Use Serena/JetBrains tools when IDE is available. Fall back to `Read` for non-code files or when IDE is unavailable.
- **IDE inspections**: Use `mcp__jetbrains__get_file_problems` for each changed code file. If MCP connection fails, skip gracefully.
- **Linter execution**: Use `Bash` tool
- **Diff inspection**: Use `Bash` for `git diff --cached`
- **Sub-agents**: If spawning agents for review tasks, use `model: "opus"` (NOT haiku)
