# CLAUDE.md

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

## Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
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

## Self-Improvement Loop

- After ANY correction from the user, append the lesson to `.agent/lessons.md`
- Format: brief rule + why it matters
- Review `.agent/lessons.md` at session start for relevant patterns
- Update or remove lessons that become stale

## Template System

Only files with secrets or per-contest values use templates. Core config (`CLAUDE.md`, `settings.json`, `.mcp.json`) is committed directly — no hardcoded system paths, uses `~/.claude` or `$HOME/.claude` instead.

### What's templated
| Template | Output (gitignored) | Why |
|---|---|---|
| `.env.tmpl` | `.env` | OAuth secrets, credentials |
| `skills/*/SKILL.md.tmpl` | `skills/*/SKILL.md` | Contest IDs, license keys |

### Commands
- `bun run generate.ts` — generate from templates + config
- `bun run generate.ts --check` — verify generated files are fresh

### New machine setup
1. Clone the repo
2. `bun install`
3. Copy `config.secrets.example` → `config.secrets.yml`, fill in real values
4. Run `bun run generate.ts`

### Rules
- NEVER put secrets in `.tmpl` files or `config.yml`
- NEVER edit generated files — they have `AUTO-GENERATED` headers
- ALWAYS run `bun run generate.ts` after template changes

## Code Editing Tools (MANDATORY)

**CRITICAL: For ALL code files, you MUST use Serena MCP and JetBrains MCP tools instead of built-in Read/Edit/Grep/Write. Built-in tools are ONLY for non-code files (markdown, PDFs, JSON config, etc.).**

The projectPath for all JetBrains calls is `~/.claude`.

### When to use which tool

| Action | Tool | NOT this |
|---|---|---|
| See what's in a code file | `mcp__serena__jet_brains_get_symbols_overview` | `Read` |
| Read a specific function/class body | `mcp__serena__jet_brains_find_symbol` with `include_body=true` | `Read` |
| Read a full code file (rare, avoid) | `mcp__jetbrains__get_file_text_by_path` | `Read` |
| Search code for a pattern | `mcp__serena__search_for_pattern` or `mcp__jetbrains__search_in_files_by_text` | `Grep` |
| Find files by name | `mcp__jetbrains__find_files_by_name_keyword` or `mcp__serena__find_file` | `Glob` |
| Replace a function/method body | `mcp__serena__replace_symbol_body` | `Edit` |
| Add code after a symbol | `mcp__serena__insert_after_symbol` | `Edit` |
| Add code before a symbol | `mcp__serena__insert_before_symbol` | `Edit` |
| Rename a symbol project-wide | `mcp__serena__rename_symbol` or `mcp__jetbrains__rename_refactoring` | `Edit` with replace_all |
| Small text replacement in file | `mcp__jetbrains__replace_text_in_file` | `Edit` |
| Check for errors/warnings | `mcp__jetbrains__get_file_problems` | `Bash` tsc |
| Find who references a symbol | `mcp__serena__jet_brains_find_referencing_symbols` | `Grep` |
| Create a new code file | `mcp__jetbrains__create_new_file` | `Write` |
| Format a file | `mcp__jetbrains__reformat_file` | nothing |

### Serena MCP Usage

**Exploring code (token-efficient, start here):**
```
mcp__serena__jet_brains_get_symbols_overview(relative_path="path/to/file.ts")
mcp__serena__jet_brains_find_symbol(name_path_pattern="SymbolName", include_body=true)
mcp__serena__jet_brains_find_referencing_symbols(name_path="SYMBOL", relative_path="path/to/file.ts")
```

**Editing code (symbolic, precise):**
```
mcp__serena__replace_symbol_body(name_path="Symbol", relative_path="path/to/file.ts", body="new code")
mcp__serena__insert_after_symbol(name_path="Symbol", relative_path="path/to/file.ts", body="new code")
mcp__serena__rename_symbol(name_path="OldName", relative_path="path/to/file.ts", new_name="NewName")
```

**Serena gotcha - `replace_symbol_body` duplicates `export`:**
Serena includes the symbol signature in the `body` param but does NOT remove the original `export const` prefix. After every `replace_symbol_body` call, immediately fix with `replace_text_in_file("export const export const", "export const")`.

**Searching code:**
```
mcp__serena__search_for_pattern(substring_pattern="pattern", relative_path="src/", restrict_search_to_code_files=true)
```

### JetBrains MCP Usage

**Always pass `projectPath`:**
```
projectPath="~/.claude"
```

**File operations:**
```
mcp__jetbrains__get_file_text_by_path(pathInProject="relative/path.ts", projectPath="...")
mcp__jetbrains__replace_text_in_file(pathInProject="...", oldText="old", newText="new", projectPath="...")
mcp__jetbrains__create_new_file(pathInProject="...", text="content", projectPath="...")
mcp__jetbrains__get_file_problems(filePath="relative/path.ts", projectPath="...")
```

### Decision flowchart

1. **Need to understand a code file?** -> `get_symbols_overview` first, then `find_symbol` with `include_body=true`
2. **Need to edit a function/component?** -> `find_symbol` to read, then `replace_symbol_body` to rewrite
3. **Need to add new code?** -> `insert_after_symbol` or `insert_before_symbol`
4. **Need to rename?** -> `rename_symbol` (Serena) or `rename_refactoring` (JetBrains)
5. **Need to find usages?** -> `find_referencing_symbols`
6. **Need to search?** -> `search_for_pattern` (Serena) or `search_in_files_by_text` (JetBrains)
7. **Need to check errors?** -> `get_file_problems` (per file) or `build_project` (whole project)
8. **Non-code file?** -> Use built-in Read/Edit/Write tools
