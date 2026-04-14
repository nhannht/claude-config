NEVER bind any server, tool, or process to `0.0.0.0`. Always use `100.64.0.2` (Tailscale IP).

This applies to ALL server commands: filebrowser, python -m http.server, vite, next dev, bun dev, caddy, nginx, etc.

- BAD: `filebrowser -a 0.0.0.0 -p 8071`
- BAD: `python -m http.server 8080` (defaults to 0.0.0.0)
- GOOD: `filebrowser -a 100.64.0.2 -p 8071`
- GOOD: `python -m http.server 8080 --bind 100.64.0.2`

Binding to `0.0.0.0` exposes ports on all interfaces including public IPs — unacceptable security risk.
