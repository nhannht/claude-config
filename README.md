# claude-config

My [Claude Code](https://claude.ai/claude-code) user configuration — skills, settings, hooks, and plugins.

## Structure

```
~/.claude/
├── CLAUDE.md              # Agent instructions
├── settings.json          # Claude Code settings
├── .mcp.json              # MCP server config
├── secrets.example.yml    # Secret schema (fill in your values)
├── skills/
│   ├── gstack/            # Submodule: nhannht/gstack (fork of garrytan/gstack)
│   ├── code-review/
│   ├── claude-config-review/
│   ├── google-workspace-mcp-setup/
│   ├── tw/                # Taskwarrior integration
│   ├── youtrack/
│   └── ...
└── plugins/               # Local plugin marketplace (gitignored)
    └── private-skills/    # Private skills with sensitive data
```

## Setup

```bash
git clone --recurse-submodules https://github.com/nhannht/claude-config.git ~/.claude
cd ~/.claude
cp secrets.example.yml secrets.yml  # fill in real values
```

## Secrets

Private values (credentials, API keys, personal identifiers) live in `secrets.yml` (gitignored). Skills reference keys from this file — Claude reads and parses it at runtime.

## Private Skills

Private skills live in a local plugin at `plugins/private-skills/` (gitignored). They are loaded via a local marketplace configured in `settings.json` and available as `/private-skills:<skill-name>`.

## License

Personal configuration — use as inspiration, not as a drop-in.
