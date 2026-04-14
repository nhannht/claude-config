Always enable authentication for any hosted service. Never use `--noauth`, `--no-auth`, or equivalent flags.

This applies to: filebrowser, Jupyter, Grafana, any dashboard, any web UI, any file server.

- BAD: `filebrowser --noauth`
- BAD: `jupyter notebook --no-browser --NotebookApp.token=''`
- GOOD: `filebrowser` (uses its own login by default)
- GOOD: set credentials before starting any service

**If a service must run without auth** (e.g., a temporary localhost-only dev tool the user explicitly requested), you MUST warn the user BEFORE starting it:
> "⚠️ WARNING: [service] on port [N] will have NO authentication. Anyone who can reach this port can access it. Proceed?"

Never silently start a no-auth service.
