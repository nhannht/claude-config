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
projectPath="<ABSOLUTE_PROJECT_PATH>"
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
