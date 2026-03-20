# Skill: asus-browser-control

Control Microsoft Edge on the local machine "asus" via Chrome DevTools Protocol (CDP) over SSH tunnel on port 9222.

## Prerequisites

1. **SSH tunnel must be active.** If not, establish it:
   ```bash
   ssh -f -N -L 9222:127.0.0.1:9222 asus
   ```
   Verify: `ss -tlnp | grep 9222` should show an ssh listener.

2. **Edge must be running on asus** with both flags:
   ```bash
   ssh asus "pkill -f msedge"; sleep 2
   ssh asus "DISPLAY=:0 nohup microsoft-edge-stable --remote-debugging-port=9222 --remote-allow-origins=* >/dev/null 2>&1 &"
   ```
   - `--remote-allow-origins=*` is **required** — without it, WebSocket connections get 403 Forbidden.
   - If Edge is already running without the flag, you must kill it first — otherwise `--remote-debugging-port` is silently ignored ("Opening in existing browser session").

3. **Python venv** at `~/.claude/skills/asus-browser-control/.venv` with `websocket-client` installed.
   If missing: `cd ~/.claude/skills/asus-browser-control && uv venv .venv && uv pip install --python .venv/bin/python websocket-client`

## Navigation Strategy: DOM-First, Screenshots-Last

**Do NOT screenshot for every step.** Extract page state as structured text instead:

```python
# Get orientation (title + URL)
cdp("Runtime.evaluate", {"expression": "JSON.stringify({title: document.title, url: location.href})"})

# Dump all links (for finding where to navigate)
cdp("Runtime.evaluate", {"expression": """
    JSON.stringify(Array.from(document.querySelectorAll('a[href]')).map(a => ({
        text: a.textContent.trim().substring(0, 80),
        href: a.href
    })).filter(a => a.text))
"""})

# Dump buttons and form elements (for finding what to click)
cdp("Runtime.evaluate", {"expression": """
    JSON.stringify(Array.from(document.querySelectorAll('button, input[type=submit], .btn'))
        .filter(b => b.offsetParent !== null)
        .map(b => ({text: (b.textContent || b.value || '').trim().substring(0,60), id: b.id}))
        .filter(b => b.text))
"""})

# Dump table data (for reading structured info)
cdp("Runtime.evaluate", {"expression": """
    JSON.stringify(Array.from(document.querySelectorAll('table')).map(t => {
        var rows = Array.from(t.querySelectorAll('tr')).map(r =>
            Array.from(r.querySelectorAll('td,th')).map(c => c.textContent.trim().substring(0,80))
        );
        return rows;
    }))
"""})
```

**Use screenshots ONLY for:**
- Visual verification (confirming upload succeeded, reading CAPTCHAs)
- Pages where DOM structure is unknown and text extraction returns nothing useful
- Final confirmation before destructive actions

## CDP Python Template

```python
import json, time, base64, urllib.request
from websocket import create_connection

CDP = "http://127.0.0.1:9222"
PY = "~/.claude/skills/asus-browser-control/.venv/bin/python3"

tabs = json.loads(urllib.request.urlopen(f"{CDP}/json").read())
page_tabs = [t for t in tabs if t["type"] == "page"]
ws = create_connection(page_tabs[0]["webSocketDebuggerUrl"], suppress_origin=True)

def cdp(method, params=None):
    """Send a CDP command and return the response."""
    cdp._id = getattr(cdp, "_id", 0) + 1
    msg = {"id": cdp._id, "method": method}
    if params:
        msg["params"] = params
    ws.send(json.dumps(msg))
    resp = json.loads(ws.recv())
    # Check for errors
    if "error" in resp:
        print(f"CDP ERROR: {resp['error']}")
    return resp

ws.close()
```

## Common Operations

**Navigate to URL:**
```python
cdp("Page.navigate", {"url": "https://example.com"})
time.sleep(3)  # wait for page load
```

**Execute JavaScript (sync):**
```python
resp = cdp("Runtime.evaluate", {"expression": "document.title"})
title = resp["result"]["result"]["value"]
```

**Execute JavaScript (async) — MUST use `awaitPromise`:**
```python
resp = cdp("Runtime.evaluate", {"expression": """
    (async () => {
        var resp = await fetch('/api/data');
        return await resp.text();
    })()
""", "awaitPromise": True})
value = resp["result"]["result"]["value"]
```

**Safe value extraction (handles JS errors gracefully):**
```python
def get_value(resp):
    """Extract value from CDP Runtime.evaluate response, return None on error."""
    try:
        return resp["result"]["result"]["value"]
    except (KeyError, TypeError):
        print(f"Unexpected response: {json.dumps(resp)[:200]}")
        return None
```

**Click an element:**
```python
# Option 1: JS click (preferred — works for most elements)
cdp("Runtime.evaluate", {"expression": "document.querySelector('button.submit').click()"})

# Option 2: CDP click at coordinates (for cross-origin iframes, shadow DOM, etc.)
cdp("Input.dispatchMouseEvent", {"type": "mousePressed", "x": 500, "y": 300, "button": "left", "clickCount": 1})
cdp("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": 500, "y": 300, "button": "left", "clickCount": 1})
```

**Type text into focused element:**
```python
cdp("Input.insertText", {"text": "hello world"})
```

**Key events (Enter, Tab, etc.):**
```python
cdp("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13})
cdp("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13})
```

**Take screenshot:**
```python
resp = cdp("Page.captureScreenshot", {"format": "png"})
with open("/tmp/screenshot.png", "wb") as f:
    f.write(base64.b64decode(resp["result"]["data"]))
# Then use Read tool to view it
```

**Get element bounding box:**
```python
resp = cdp("Runtime.evaluate", {
    "expression": "JSON.stringify(document.querySelector('button').getBoundingClientRect())"
})
rect = json.loads(resp["result"]["result"]["value"])
x, y = rect["x"] + rect["width"]/2, rect["y"] + rect["height"]/2
```

**Tab management:**
```python
# List tabs
tabs = json.loads(urllib.request.urlopen(f"{CDP}/json").read())

# Close/activate tabs (HTTP GET)
urllib.request.urlopen(f"{CDP}/json/close/{tab_id}")
urllib.request.urlopen(f"{CDP}/json/activate/{tab_id}")

# Open new tab: DO NOT use /json/new — returns 405 on Edge stable.
# Instead, navigate an existing tab or use JS: window.open('url')
```

**Cookies:**
```python
cdp("Network.getCookies")       # get all
cdp("Network.setCookie", {"name": "k", "value": "v", "domain": ".example.com", "path": "/"})
```

## Uploading Files Through the Browser's Session

When a web app uses JS file pickers (not `<input type=file>`), upload via the browser's `fetch` to leverage its authenticated session:

```python
import base64

with open("/path/to/file.txt", "rb") as f:
    file_b64 = base64.b64encode(f.read()).decode()

cdp("Runtime.evaluate", {"expression": f"""
    (async () => {{
        var binary = atob("{file_b64}");
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        var blob = new Blob([bytes], {{type: 'application/octet-stream'}});
        var fd = new FormData();
        fd.append('file', blob, 'filename.txt');
        var resp = await fetch('/upload/endpoint', {{method: 'POST', body: fd}});
        return await resp.text();
    }})()
""", "awaitPromise": True})
```

This pattern works for any web app — Moodle, Google Drive, custom portals — because the browser already holds the session cookies.

## Critical Rules

1. **ALWAYS** `suppress_origin=True` in `create_connection()` — Edge rejects without it
2. **ALWAYS** use the venv python: `~/.claude/skills/asus-browser-control/.venv/bin/python3`
3. **ALWAYS** use `awaitPromise: True` for async JS expressions
4. **ALWAYS** use `get_value()` or try/except when reading CDP responses — JS errors cause missing keys
5. **NEVER** use `/json/new?url` — returns 405 on Edge stable. Use `Page.navigate` instead
6. **NEVER** screenshot as primary navigation method — extract DOM text first
7. After `Page.navigate`, always `time.sleep()` before interacting with new page content
8. Each tab has its own WebSocket URL — connect to the specific tab you want to control
