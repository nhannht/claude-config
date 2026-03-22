---
name: claude-config-review
description: Scan Claude Code config files (instructions, hooks, settings, skills, MCP) for leaked secrets, credentials, or sensitive information.
user-invocable: true
---

# Claude Config Security Review

## Overview

Scans all Claude Code configuration for confidential or security-sensitive information that should not be committed or shared.

## Usage

```bash
# Full scan
/claude-config-review

# Scan specific area
/claude-config-review hooks
/claude-config-review settings
/claude-config-review skills
```

## Arguments

- **area** (positional, optional): Limit scan to: `hooks`, `settings`, `skills`, `instructions`, `mcp`, `memory`

## What It Scans

| Area | Files |
|------|-------|
| Settings | `settings.json`, `settings.local.json` |
| Hooks | `hooks/*` |
| Instructions | `CLAUDE.md`, `instruct-collection/*` |
| Skills | `skills/*/SKILL.md` |
| Memory | `projects/*/memory/*` |
| MCP | MCP server configs in settings |

## What It Flags

### CRITICAL (must fix before commit)

- API keys, tokens, secrets (pattern: `sk-`, `ghp_`, `xoxb-`, `Bearer`, `AKIA`, etc.)
- Passwords or credentials in plaintext
- Private keys or certificates
- Database connection strings with credentials
- Internal hostnames/IPs that reveal infrastructure
- Personal access tokens

### WARNING (review before sharing)

- Email addresses or usernames
- Internal URLs or endpoints
- File paths that reveal system structure (home dirs, org-specific paths)
- Environment variable values (not names) that could be sensitive
- OAuth client IDs or redirect URIs

### INFO (awareness only)

- References to internal tools or services by name
- Project names that might be confidential
- Commented-out sensitive content

## Workflow

### Step 1 - Collect Files

Based on the area argument (or all areas if none specified), glob for all config files under `~/.claude/`.

### Step 2 - Scan Each File

For each file, search for:

**Secret patterns** (regex):
- `(?i)(api[_-]?key|secret|token|password|passwd|credential|auth)[\s]*[=:]\s*['"]?[A-Za-z0-9+/=_\-]{8,}`
- `sk-[A-Za-z0-9]{20,}`
- `ghp_[A-Za-z0-9]{36,}`
- `xoxb-[A-Za-z0-9\-]+`
- `AKIA[A-Z0-9]{16}`
- `-----BEGIN (RSA |EC )?PRIVATE KEY-----`
- Connection strings: `(mysql|postgres|mongodb|redis)://[^@]+@`

**PII patterns**:
- Email addresses
- IP addresses (non-localhost)

**Infrastructure patterns**:
- Internal hostnames (`.internal`, `.local`, `.corp`)
- Non-public URLs

### Step 3 - Report

Output findings grouped by severity. For each finding:
- File path and line number
- What was found (redact the actual secret, show only the pattern type)
- Recommended fix

### Step 4 - Summary

```markdown
## Claude Config Security Review

**Files scanned**: N
**Areas**: [scanned areas]

### CRITICAL
**file:line** - [Type] Found hardcoded API key
> Redact and move to environment variable

### WARNING
**file:line** - [Type] Internal URL exposed
> Consider if this should be in shared config

### INFO
...

---
**Result**: PASS / FAIL (FAIL if any CRITICAL findings)
```

## Marker File (MANDATORY)

After review completes, the marker file determines whether `git commit` will be allowed by the pre-commit hook.

**If ANY CRITICAL findings remain:**
- Do NOT create the marker file
- Tell the user to fix issues and re-run `/claude-config-review`

**If only WARNING/INFO or no findings:**
```bash
git diff --cached | sha256sum | cut -d' ' -f1 > /tmp/claude-config-review-passed
```
This hash ensures the marker is only valid for the exact staged content that was reviewed.

## Important

- NEVER print the actual secret value in the report — only the type/pattern
- If a file can't be read, log it as INFO and continue
- Use Grep tool for pattern matching, not bash grep
- Scan `.gitignore` to verify sensitive files are excluded from git
