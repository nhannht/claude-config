# CLAUDE.md

## Telegram Notifications

Run `tg-notify "<message>"` via Bash to ping the user on Telegram. Messages MUST be dynamic and contextual — never generic.

**When to notify:**
- After completing a multi-step task or significant piece of work
- When blocked and waiting for user input
- After a long-running build/test/deploy finishes
- When you stop and are waiting for the user's next instruction

**Message format — always include what happened:**
- `tg-notify "Done: implemented email OTP auth — server + frontend, all tests pass"`
- `tg-notify "Need input: should OTP expiry be 5 or 10 minutes?"`
- `tg-notify "Tests finished: 1183 passed, 19 failed (pre-existing)"`
- `tg-notify "Waiting: OTP auth done, ready for next task"`

**Never send:**
- Generic messages like "Waiting for your input" or "Notification from Claude Code"
- Notifications for quick one-liner answers or trivial responses

## Priority Order

When principles conflict: **correctness > simplicity > speed > elegance**

## Editor

- Always use normal (standard/readline) editor mode. Never use vim mode.

## Planning

- Enter plan mode for any non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't push forward on a broken approach
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

## Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- One task per subagent for focused execution
- **Any agent doing web search must use `model: haiku`** — never opus
- **Any agent doing data extraction (e.g., non-scanned PDFs) must use `model: haiku`**
- Opus is reserved for planning, analytics, and complex reasoning only

## Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between master and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

## Autonomous Bug Fixing

- When given a clear bug report, just fix it — don't ask for hand-holding
- Point at logs, errors, failing tests, then resolve them
- When the bug is ambiguous or multiple valid fixes exist, clarify once before diving in

## Code Quality

- **Simplicity first**: Make every change as simple as possible. Minimal code impact.
- **No laziness**: Find root causes. No temporary fixes. Senior developer standards.
- Challenge hacky fixes, but don't gold-plate — if it's correct and simple, ship it.

## Scope Management

- If a task is unclear or smells too large, ask before assuming
- A 10-second clarification beats 10 minutes in the wrong direction

## Task Management

- Use Taskwarrior (`/tw`) for task tracking — not files, not built-in task tools
- Create tasks for non-trivial work, mark complete as you go
- Check in with the user before starting implementation on planned tasks

## Secrets

- Private values live in `secrets.yml` (gitignored)
- Skills reference keys from this file — Claude reads and parses it at runtime
- Never commit `secrets.yml`; `secrets.example.yml` documents the schema
- New machine setup: copy `secrets.example.yml` → `secrets.yml`, fill in real values

## Gstack

- `skills/gstack` is a git submodule from `nhannht/gstack` (fork of `garrytan/gstack`)
- Upstream remote configured inside submodule: `git -C skills/gstack fetch upstream`
- Symlinks in `skills/` point into `skills/gstack/` for skill discovery — don't track them
- New machine setup: `git clone --recurse-submodules` or `git submodule update --init`

## Private Skills

- Details in `~/.claude/rules/private-skill-plugin.md` (gitignored)
- NEVER list skill names or repo URL in tracked files

## New Machine Setup

```bash
# 1. Clone with submodules (gstack)
git clone --recurse-submodules https://github.com/nhannht/claude-config.git ~/.claude

# 2. Secrets
cp secrets.example.yml secrets.yml  # then fill in real values

# 3. Private skills plugin (see rules/private-skill-plugin.md for repo URL)
# git clone <private-repo> ~/.claude/plugins/marketplaces/local/plugins/private-skills/

# 4. Gstack symlinks (auto-created by link.sh)
cd skills/gstack && bash link.sh
```

## Pre-commit Hook

- `/claude-config-review` must pass before any `git commit` in this repo
- Hook checks `sha256sum` of staged content against `/tmp/claude-config-review-passed`
- If commit is blocked: run `/claude-config-review`, then retry the commit

## Git History Hygiene

- NEVER hardcode usernames, institutional names, or domain names in tracked files
- Put private values in `secrets.yml` or in the private-skills plugin
- `git-filter-repo` was used to scrub history — do not re-introduce PII in commits

## Code Editing Tools (MANDATORY)

**CRITICAL: For ALL code files, you MUST use Serena MCP and JetBrains MCP tools instead of built-in Read/Edit/Grep/Write. Built-in tools are ONLY for non-code files (markdown, PDFs, JSON config, etc.).**

The projectPath for all JetBrains calls is `~/.claude`.

### Tool Split: Serena = Code Intelligence, JetBrains = IDE Capabilities

**Serena is primary for all code reading, searching, navigating, and editing.** JetBrains MCP is used ONLY for IDE-level capabilities that Serena cannot provide. Do NOT use JetBrains tools for search/read/find when Serena covers it — this avoids tool overlap confusion and context waste.

### Serena Tools (use these for code work)

| Action | Tool |
|---|---|
| See what's in a code file | `mcp__serena__jet_brains_get_symbols_overview` |
| Read a specific function/class body | `mcp__serena__jet_brains_find_symbol` with `include_body=true` |
| Search code for a pattern | `mcp__serena__search_for_pattern` |
| Find files by name | `mcp__serena__find_file` |
| Replace a function/method body | `mcp__serena__replace_symbol_body` |
| Add code after a symbol | `mcp__serena__insert_after_symbol` |
| Add code before a symbol | `mcp__serena__insert_before_symbol` |
| Rename a symbol project-wide | `mcp__serena__rename_symbol` |
| Find who references a symbol | `mcp__serena__jet_brains_find_referencing_symbols` |
| Check type hierarchy | `mcp__serena__jet_brains_type_hierarchy` |

**Serena gotcha - `replace_symbol_body` duplicates `export`:**
Serena includes the symbol signature in the `body` param but does NOT remove the original `export const` prefix. After every `replace_symbol_body` call, immediately fix with `replace_text_in_file("export const export const", "export const")`.

### JetBrains Tools (use ONLY for unique IDE capabilities)

| Action | Tool |
|---|---|
| Build/compile and get errors | `mcp__jetbrains__build_project` |
| Check file errors/warnings (IntelliJ inspections) | `mcp__jetbrains__get_file_problems` |
| Run custom inspection scripts | `mcp__jetbrains__run_inspection_kts` |
| Get inspection KTS API/examples | `generate_inspection_kts_api`, `generate_inspection_kts_examples` |
| Generate PSI tree | `mcp__jetbrains__generate_psi_tree` |
| Run IDE run configurations | `mcp__jetbrains__execute_run_configuration` |
| List run configurations | `mcp__jetbrains__get_run_configurations` |
| Quick Documentation at cursor | `mcp__jetbrains__get_symbol_info` |
| Read file with indentation mode | `mcp__jetbrains__read_file` (mode=indentation) |
| Small text replacement in file | `mcp__jetbrains__replace_text_in_file` |
| Create a new code file | `mcp__jetbrains__create_new_file` |
| Format a file | `mcp__jetbrains__reformat_file` |
| Open file in IDE editor | `mcp__jetbrains__open_file_in_editor` |
| Run shell in IDE terminal | `mcp__jetbrains__execute_terminal_command` |
| List project modules/deps/repos | `get_project_modules`, `get_project_dependencies`, `get_repositories` |
| Run Jupyter notebook cells | `mcp__jetbrains__runNotebookCell` |

**DO NOT use these JetBrains tools** (Serena already covers them):
`search_text`, `search_regex`, `search_symbol`, `search_file`, `search_in_files_by_text`, `search_in_files_by_regex`, `find_files_by_glob`, `find_files_by_name_keyword`, `get_file_text_by_path`, `rename_refactoring`.

**Always pass `projectPath`:**
```
projectPath="~/.claude"
```

### Decision flowchart

1. **Need to understand a code file?** → Serena `get_symbols_overview` first, then `find_symbol` with `include_body=true`
2. **Need to edit a function/component?** → Serena `find_symbol` to read, then `replace_symbol_body` to rewrite
3. **Need to add new code?** → Serena `insert_after_symbol` or `insert_before_symbol`
4. **Need to rename?** → Serena `rename_symbol`
5. **Need to find usages?** → Serena `find_referencing_symbols`
6. **Need to search code?** → Serena `search_for_pattern`
7. **Need to check errors?** → JetBrains `get_file_problems` (per file) or `build_project` (whole project)
8. **Need Quick Documentation?** → JetBrains `get_symbol_info`
9. **Need to run tests/builds?** → JetBrains `execute_run_configuration` or `build_project`
10. **Need custom code analysis?** → JetBrains `run_inspection_kts`
11. **Non-code file?** → Use built-in Read/Edit/Write tools
