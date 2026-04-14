# CLAUDE.md

This is `nhannht/claude-config` — Claude Code user configuration repo. Behavioral rules live in `~/.claude/rules/`.

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

- Details in `~/.claude/rules/private-skill-plugin.md`
- NEVER list skill names or repo URL in tracked files

## New Machine Setup

```bash
# 1. Clone with submodules (gstack)
git clone --recurse-submodules https://github.com/nhannht/claude-config.git ~/.claude

# 2. Secrets
cp secrets.example.yml secrets.yml  # then fill in real values

# 3. Private skills plugin (see rules/private-skill-plugin.md for setup steps)

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

## Working Style

- **Step-by-step over concurrent**: Careful sequential execution beats spawning multiple agents. Limit agent usage — prefer doing work directly.
- **Correctness over speed**: Follow all tool rules (Serena/JetBrains for code) even when it feels slower. Working output matters more than fast output.
- **Efficiency over speed**: Always prefer Serena, JetBrains, and Context7 MCP tools over built-in Read/Edit/Grep/Write/WebSearch for code and library docs. These tools are more precise, context-aware, and produce better results. Never fall back to built-in tools for code files just because they feel faster — efficiency (right tool, right result) beats raw speed.
- **Verify between steps**: Build and test after each phase, not just at the end.
- **Agents must follow the same rules**: When spawning agents, include the Serena/JetBrains tool table in the prompt. Never tell agents to use built-in Read/Edit/Write for code files.

## Dev Servers

- **Always start dev servers in a new tmux window** of the current tmux session, not in the background of the current shell
- Use `tmux new-window -n <name> '<command>'` to launch (e.g., `tmux new-window -n 'remotion' 'cd /path && bun run studio'`)
- This keeps dev server output visible and manageable without polluting the Claude Code shell
- **NEVER bind any server to `0.0.0.0`** — always bind to `100.64.0.2` (Tailscale IP only). This applies to ALL servers: filebrowser, http.server, vite, next, bun, etc. Binding to `0.0.0.0` exposes the port on all interfaces including public IPs.
- **Always enable authentication** for any hosted service (filebrowser, Jupyter, dashboards, etc.). Never start with `--noauth`, `--no-auth`, or equivalent flags. If a service is intentionally started without auth (e.g., localhost-only dev tool), **explicitly warn the user** before launching: state the service name, port, and that it has no authentication.

## File Search

- **Always use `locate`** to find files on the system. Never use Glob or `find` as first choice.
- `locate` is faster and searches the entire filesystem. Glob misses files in unexpected locations.

## JavaScript / Node.js Runtime

- **Always use `bun`** as the package manager and Node.js replacement
- Never use `npm`, `yarn`, or `pnpm` — use `bun install`, `bun run`, `bun add`, `bun remove`, etc.
- Use `bun.lock` (not `package-lock.json` or `yarn.lock`)
- For running scripts: `bun run build`, `bun run test`, `bun vitest`, etc.
- If a project has `package-lock.json` or `yarn.lock`, delete it and run `bun install` to generate `bun.lock`

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
