# claude-config

My [Claude Code](https://claude.ai/claude-code) user configuration — skills, settings, hooks, and templates.

## Structure

```
~/.claude/
├── CLAUDE.md              # Agent instructions
├── settings.json          # Claude Code settings
├── .mcp.json              # MCP server config
├── generate.ts            # Template generator
├── config.yml             # Template variables (non-secret)
├── config.secrets.example # Secret template (fill in your values)
├── skills/
│   ├── gstack/            # Submodule: nhannht/gstack (fork of garrytan/gstack)
│   ├── code-review/
│   ├── claude-config-review/
│   ├── google-workspace-mcp-setup/
│   ├── tw/                # Taskwarrior integration
│   ├── youtrack/
│   └── ...                # Private skills symlinked from separate repo
└── .env.tmpl              # Secret template → .env (gitignored)
```

## Setup

```bash
git clone --recurse-submodules https://github.com/nhannht/claude-config.git ~/.claude
cd ~/.claude
bun install
cp config.secrets.example config.secrets.yml  # fill in real values
bun run generate.ts
```

## Template System

Files with secrets use templates (`.tmpl` → generated output). Core config is committed directly.

```bash
bun run generate.ts          # generate from templates
bun run generate.ts --check  # verify generated files are fresh
```

## License

Personal configuration — use as inspiration, not as a drop-in.
