If private skills (`/private-skills:*`) are missing or the plugin fails to load, tell the user to set up the private-skills plugin:

1. Add the local marketplace (if not already configured):
   ```
   /plugin marketplace add ./plugins/marketplaces/local
   ```
   Or from CLI: `claude plugin marketplace add local --source directory --path ~/.claude/plugins/marketplaces/local`

2. Clone the private repo into the marketplace plugins directory:
   ```bash
   git clone <private-repo-url> ~/.claude/plugins/marketplaces/local/plugins/private-skills/
   ```
   (Repo URL is in memory — check `reference_private_skills.md`. Do not hardcode it here.)

3. Install and enable the plugin:
   ```
   /plugin install private-skills@local
   /plugin enable private-skills@local
   ```

4. Reload plugins:
   ```
   /reload-plugins
   ```
