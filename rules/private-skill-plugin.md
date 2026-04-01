Private skills live in a standalone git repo at `~/.claude/plugins/marketplaces/local/plugins/private-skills/`.

- It is NOT a submodule — it's an independent repo inside the gitignored `plugins/` directory
- To push changes: `cd` into the plugin dir, then `git add`, `commit`, `push` as normal
- Plugin manifest: `.claude-plugin/plugin.json`
- Skills are discovered automatically by Claude Code via the local marketplace
- NEVER list skill names or repo URL in tracked files
- Repo URL and setup details are in memory or `secrets.yml`
