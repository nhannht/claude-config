#!REDACTED_PATH
"""Block Docker port bindings that don't use 127.0.0.1 (Docker bypasses UFW)."""

import json
import re
import sys

# Matches "1234:5678" but NOT "127.0.0.1:1234:5678"
BARE_PORT_RE = re.compile(r'"(\d+:\d+)"')
SAFE_PORT_RE = re.compile(r'"127\.0\.0\.1:\d+:\d+"')

MSG = (
    "BLOCKED: Docker port binding must use 127.0.0.1 "
    '(e.g. -p 127.0.0.1:8080:8080 or "127.0.0.1:5432:5432"). '
    "Docker bypasses UFW — exposed ports are public."
)

data = json.load(sys.stdin)
tool = data.get("tool_name", "")

if tool == "Bash":
    cmd = data.get("tool_input", {}).get("command", "")
    if re.search(r"docker\s+run\b", cmd) and re.search(r"\s-p\s+(\d+:\d+)", cmd):
        print(MSG, file=sys.stderr)
        sys.exit(2)

elif tool in ("Write", "Edit"):
    file_path = data.get("tool_input", {}).get("file_path", "")
    if re.search(r"(docker-compose|compose).*\.ya?ml$", file_path, re.IGNORECASE):
        content = data.get("tool_input", {}).get(
            "content" if tool == "Write" else "new_string", ""
        )
        if BARE_PORT_RE.search(content) and not SAFE_PORT_RE.search(content):
            print(MSG, file=sys.stderr)
            sys.exit(2)
