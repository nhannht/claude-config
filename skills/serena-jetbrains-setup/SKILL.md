---
name: serena-jetbrains-setup
description: Set up Serena MCP and JetBrains MCP for a project. Creates .serena/project.yml, adds workspace-scoped MCP server, and injects CLAUDE.md instructions for persistent Serena+JetBrains usage across conversations.
user_invocable: true
---

# Serena + JetBrains MCP Setup Skill

Set up Serena and JetBrains MCP integration for any project so it persists across conversations.

## What this skill does

1. Creates `.serena/project.yml` in the target project
2. Adds a workspace-scoped Serena MCP server (`.mcp.json`) pointing to the project
3. Verifies JetBrains MCP is available (user-scoped, already persistent)
4. Injects code editing instructions into the project's `CLAUDE.md`

## Prerequisites

- **JetBrains IDE** must be running with the **MCP Server plugin** installed
  - The IDE must have the target project directory open
  - JetBrains MCP should already be added at user scope: `claude mcp add --scope user jetbrains --transport sse http://localhost:PORT/sse`
  - The port changes each IDE restart - update with `claude mcp add --scope user jetbrains --transport sse http://localhost:NEW_PORT/sse`
- **Serena** is installed via uvx from `git+https://github.com/oraios/serena`

## Setup Steps

### Step 1: Identify the target project

Ask the user for:
- **Project path** (absolute path to the project root)
- **Project name** (short identifier, e.g. `my-app`)
- **Languages** (from Serena's supported list: typescript, python, go, rust, java, cpp, etc.)
- **Encoding** (default: utf-8)

### Step 2: Create `.serena/project.yml`

Create `<project>/.serena/project.yml`:

```yaml
project_name: "<project-name>"
languages:
- <language>
encoding: "<encoding>"
ignore_all_files_in_gitignore: true
ignored_paths: []
read_only: false
excluded_tools: []
included_optional_tools: []
fixed_tools: []
```

Minimal config is fine - Serena fills in defaults for everything else.

### Step 3: Add workspace-scoped Serena MCP

Run:
```bash
claude mcp add --scope project serena -- uvx --from "git+https://github.com/oraios/serena" \
  serena start-mcp-server --context claude-code \
  --project "<ABSOLUTE_PROJECT_PATH>"
```

This writes to `<project>/.mcp.json` and takes precedence over any global Serena plugin config.

**IMPORTANT**: The `--project` flag must use the ABSOLUTE path. Relative paths break across working directories.

### Step 4: Verify JetBrains MCP

Check if JetBrains MCP exists at user scope:
```bash
claude mcp list 2>/dev/null | grep jetbrains
```

If not found, tell the user to:
1. Open the project in their JetBrains IDE
2. Install the MCP Server plugin (Settings > Plugins > search "MCP Server")
3. Find the SSE port in IDE's MCP Server plugin settings
4. Run: `claude mcp add --scope user jetbrains --transport sse http://localhost:PORT/sse`

JetBrains MCP at user scope is already persistent across all projects. The port changes on IDE restart - user must update it manually or use a fixed port if the plugin supports it.

### Step 5: Inject CLAUDE.md instructions

Append or update the project's `CLAUDE.md` with the code editing tools section. If the file doesn't exist, create it. If it already has a "Code Editing Tools" section, replace it.

The section to inject:

```markdown
## Code Editing Tools (MANDATORY)

**CRITICAL: For ALL code files, you MUST use Serena MCP and JetBrains MCP tools instead of built-in Read/Edit/Grep/Write. Built-in tools are ONLY for non-code files (markdown, PDFs, JSON config, etc.).**

The projectPath for all JetBrains calls is `<ABSOLUTE_PROJECT_PATH>`.

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
projectPath="<ABSOLUTE_PROJECT_PATH>"
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
```

Replace `<ABSOLUTE_PROJECT_PATH>` with the actual project path in all injected content.

### Step 6: Verify everything works

1. Tell the user to restart Claude Code (`/exit` + relaunch from the project directory)
2. After restart, verify:
   - `claude mcp list` shows both `serena` and `jetbrains` as connected
   - Serena is pointing to the correct project path
   - JetBrains IDE has the same directory open

## Troubleshooting

### Serena connects but wrong project
The `.mcp.json` workspace override must have the correct `--project` absolute path. Check:
```bash
cat <project>/.mcp.json
```

### Serena can't find JetBrains backend
- JetBrains IDE must have the SAME directory open as Serena's `--project` path
- JetBrains MCP Server plugin scans ports starting at 24226
- Check IDE's `/status` endpoint matches the project root

### Port changed after IDE restart
JetBrains MCP uses a dynamic port. After IDE restart:
```bash
# Find new port
curl -s http://localhost:24226/status 2>/dev/null || curl -s http://localhost:24227/status 2>/dev/null
# Update
claude mcp add --scope user jetbrains --transport sse http://localhost:NEW_PORT/sse
```

### Nested projects (monorepos)
Each sub-project needs its own `.serena/project.yml` and `.mcp.json`. The global Serena plugin walks up from CWD and may find a parent project's config instead. Workspace-scoped `.mcp.json` with explicit `--project` flag fixes this.

## Persistence Model

| Component | Scope | Persists how |
|---|---|---|
| JetBrains MCP | User (`~/.claude/settings.json`) | Across all projects, needs port update on IDE restart |
| Serena MCP | Project (`.mcp.json` in project root) | Per-project, committed to git, works for anyone who clones |
| `.serena/project.yml` | Project | Per-project, committed to git |
| CLAUDE.md instructions | Project | Per-project, committed to git, loaded every conversation |
