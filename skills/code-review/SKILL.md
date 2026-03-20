---
name: code-review
description: Pre-commit code review. Reviews staged changes for bugs, security issues, and code quality. Language-agnostic with specialized checks per platform.
user-invocable: true
---

# Pre-Commit Code Review

## Overview

Three-pass code review: mechanical linters, JetBrains IDE inspections, then Claude semantic review. Only applies checklist sections relevant to the changed files. Blocks commits unless all CRITICAL and WARNING findings are resolved.

## Usage

```bash
# Review all staged changes
/code-review

# Review specific path only
/code-review server/internal/handlers/

# Review with focus area
/code-review --focus security
/code-review --focus performance
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

### Step 4 - Pass 1: Linters (Mechanical)

Run platform-specific linters on changed files ONLY. Use whatever linter the project has configured:

**Common linters by platform:**
- Go: `golangci-lint run --new-from-rev=HEAD ./...`
- TypeScript/JS: `eslint` or `biome` (check project config)
- Python: `ruff check` or `flake8`
- Rust: `cargo clippy`

If the project has no linter configured, skip this pass and note it.

**If any linter fails:**
- Report each linter error as a **CRITICAL** finding
- Do NOT proceed to Pass 2
- Do NOT create the marker file
- Tell the user: "Fix linter errors before re-running /code-review"

**If all linters pass:** proceed to Pass 2.

### Step 5 - Pass 2: JetBrains IDE Inspections

If JetBrains MCP is available, run `mcp__jetbrains__get_file_problems` on each changed code file. Skip non-code files. Call in parallel batches (up to 10 files).

**Severity mapping:**
- JetBrains `ERROR` -> **CRITICAL**
- JetBrains `WARNING` -> **WARNING**

**If JetBrains MCP is unavailable:**
- Log: "JetBrains IDE not connected - skipping IDE inspection pass"
- Continue to Pass 3. Do NOT fail the review.

### Step 6 - Pass 3: Claude Semantic Review

Read changed files using Serena/JetBrains tools for code files when available. Fall back to `Read` tool otherwise.

Apply ONLY the checklist sections relevant to the detected platforms.

Focus on things linters **cannot** catch: logic bugs, security gaps, architectural issues, design problems.

### Step 7 - Report

Output findings grouped by severity: **CRITICAL -> WARNING -> INFO -> OK**

Include the source of each finding (Linter, IDE, or Claude) in the report.

### Step 8 - Severity Gate

- If ANY **CRITICAL** or **WARNING** findings exist -> do NOT create marker. Report: "Fix these before committing."
- If only **INFO** or no findings -> create the marker file (see below).

## Marker File (MANDATORY)

After review completes, the marker file determines whether `git commit` will be allowed by the pre-commit hook (if configured).

**If ANY CRITICAL or WARNING findings remain:**
- Do NOT create the marker file
- Tell the user to fix issues and re-run `/code-review`

**If only INFO or no findings:**
```bash
git diff --cached | sha256sum | cut -d' ' -f1 > /tmp/claude-code-review-passed
```
This hash ensures the marker is only valid for the exact staged content that was reviewed.

## Checklist

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

**Design Simplicity**:
- Is there a simpler, more standard approach? Prefer stdlib/framework solutions over custom implementations
- Could this be done with fewer abstractions, fewer files, or fewer indirections?
- If the change adds a new pattern, is it justified or does the codebase already have one that works?

**Testability**:
- Is the code structured for unit testing? Dependencies should be injectable, not hardcoded
- Can you test the logic without spinning up external services?
- Are side effects isolated from pure logic?

**Code Duplication**:
- Is the same logic repeated across files? Extract to shared function if 3+ occurrences
- Copy-paste from other parts of the codebase carrying stale logic or wrong variable names

**Error Message Quality**:
- User-facing errors must be actionable
- Internal errors must include debug context
- No secrets, tokens, or PII in error messages or logs

**Backwards Compatibility**:
- API changes must be additive (no breaking removals without versioning)
- Database migrations must be reversible
- New environment variables must have sensible defaults

**Maintainability (6-Month Test)**:
- No magic numbers - use named constants
- Inline "why" comments for non-obvious decisions
- Functions under 50 lines; split if longer
- No dead code, commented-out blocks, or TODO placeholders for real features

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

## Report Format

```markdown
## Pre-Commit Code Review

**Files changed**: N
**Platforms detected**: go, typescript, ...
**Checklist sections applied**: [relevant sections]
**Pass 1 (Linters)**: PASSED / FAILED / SKIPPED
**Pass 2 (JetBrains IDE)**: PASSED / FAILED / SKIPPED
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

## Tools & Model Requirements

- **Code reading**: Use Serena/JetBrains tools when IDE is available. Fall back to `Read` for non-code files or when IDE is unavailable.
- **IDE inspections**: Use `mcp__jetbrains__get_file_problems` for each changed code file. If MCP connection fails, skip gracefully.
- **Linter execution**: Use `Bash` tool
- **Diff inspection**: Use `Bash` for `git diff --cached`
- **Sub-agents**: If spawning agents for review tasks, use `model: "opus"` (NOT haiku)
