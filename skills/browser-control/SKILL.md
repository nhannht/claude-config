# Browser Control

Control Microsoft Edge browser via AT-SPI (native UI), CDP (web content), and X11 tools (last resort).

## Two Tools. No Overlap. No Choice.

| Question | Answer | Tool |
|---|---|---|
| Is it **browser chrome** (tabs, buttons, toolbar, extensions, address bar, native dialogs)? | **AT-SPI** via dogtail (`~/.local/share/os-automate/bin/python`) | `root.application('Microsoft Edge').child(...)` |
| Is it **web page content** (DOM, forms, text, links, iframes, JS)? | **CDP** via websocket (`/tmp/cdp-env/bin/python3`) | `cdp("Runtime.evaluate", ...)` |

There is **zero overlap**. AT-SPI cannot see web content. CDP cannot see browser chrome. Never use one where the other belongs. xdotool is last resort for window management only.

## Exact Decision Matrix

### Use CDP (web page content)

| Task | Why CDP | Example |
|---|---|---|
| Click a button/link **on a web page** | CDP has full DOM access | `document.querySelector('button.submit').click()` |
| Fill a form field **on a web page** | Direct DOM manipulation | `el.value = 'text'; el.dispatchEvent(new Event('input'))` |
| Read page text/title/URL | JS execution | `document.title`, `location.href` |
| Extract table/list data from page | DOM traversal | `querySelectorAll('tr')` |
| Navigate to a URL | `Page.navigate` | `cdp("Page.navigate", {"url": "..."})` |
| Execute JavaScript | `Runtime.evaluate` | Any JS expression |
| Take screenshot of web content | `Page.captureScreenshot` | Saves PNG |
| Intercept network requests | `Network.enable` | Monitor XHR, fetch |
| Read/set cookies | `Network.getCookies/setCookie` | Session management |
| Upload file via fetch API | `Runtime.evaluate` with `FormData` | Bypass file dialog entirely |
| Handle shadow DOM / iframes | `Input.dispatchMouseEvent` at coordinates | When JS click doesn't work |
| Type into focused web element | `Input.insertText` | Search boxes, text areas |
| Press Enter/Tab/Escape in web page | `Input.dispatchKeyEvent` | Form submission, navigation |

### Use AT-SPI (browser chrome & native dialogs)

| Task | Why AT-SPI | Example |
|---|---|---|
| Click Back/Forward/Refresh/Home | These are browser chrome buttons, not DOM | `find_by_name(frame, "Refresh")` → `do_action(0)` |
| Read list of open tabs | Tab bar is browser chrome | `find_all_by_role(frame, "page tab")` |
| Switch to a specific tab | Tab is a chrome element | `tab.get_action_iface().do_action(0)` |
| Click an extension button | Extensions are chrome UI | `find_by_name(frame, "Bitwarden")` → `do_action(0)` |
| Interact with file Open/Save dialog | Native GTK dialog via `xdg-desktop-portal-gtk`, invisible to CDP | Dump dialog tree, find filename entry, click Save |
| Interact with Print dialog | Native dialog | `find_by_name(frame, "Print")` |
| Click address bar | Chrome element | `find_by_name(frame, "Address and search bar")` → `activate` |
| Read sidebar items | Favorites, History, Downloads are chrome | `find_by_name(frame, "Favorites")` |
| Click Settings/Menu items | Browser menus | `find_by_name(frame, "Settings and more")` |
| Detect what browser windows exist | AT-SPI lists all frames | `app.get_child_count()` |
| Read dialog text/labels | Any native dialog content | `find_all_by_role(dialog, "label")` |
| Navigate file dialog sidebar | Places panel (Home, Desktop, Downloads) | Find list items, click them |
| Select file in file dialog | File list is a native table | Find table cells by filename |
| Change file type filter in dialog | Combo box in dialog | `find_by_name(dialog, "*.pdf")` |

### Use xdotool/wmctrl (absolute last resort)

| Task | Why xdotool | Example |
|---|---|---|
| Activate/focus a window | `wmctrl -a "Edge"` | When you need to bring Edge to front |
| Get window geometry | `xdotool getwindowgeometry` | Window position/size |
| Resize/move windows | `wmctrl -r "Edge" -e 0,0,0,1920,1080` | Layout management |
| Type when AT-SPI text input fails | Raw keyboard events to focused window | `xdotool type "text"` — DANGEROUS, verify focus first |

**xdotool is NEVER the right choice for clicking web page elements or interacting with dialogs.** If you're reaching for xdotool, you probably should be using CDP or AT-SPI.

### Combined Workflows (multi-layer)

| Workflow | Steps | Tools Used |
|---|---|---|
| Upload file via file dialog | 1. CDP: click the "attach" button on web page → 2. AT-SPI: interact with native file dialog (navigate, select file, click Open) → 3. CDP: verify upload succeeded in DOM | CDP + AT-SPI |
| Print a web page to PDF | 1. CDP: `Page.printToPDF` (if API print is enough) OR 1. AT-SPI: click Print button → 2. AT-SPI: configure print dialog → 3. AT-SPI: click Save/Print | AT-SPI (or CDP alone) |
| Open URL in new tab | 1. CDP: `window.open('url')` (preferred) OR 1. AT-SPI: click "New Tab" button → type URL in address bar | CDP preferred |
| Switch tab and read content | 1. AT-SPI: find tab by name, click it → 2. CDP: connect to new tab's WebSocket → 3. CDP: read DOM | AT-SPI + CDP |
| Install extension from store | 1. CDP: navigate to extension page → 2. AT-SPI: handle install confirmation dialog | CDP + AT-SPI |

## Prerequisites

### Edge Launch Command (CRITICAL)

Edge MUST be launched with specific flags and env vars for full AT-SPI + CDP support:

```bash
AT_SPI_BUS_ADDRESS="unix:path=/run/user/1000/at-spi/bus_0" \
  microsoft-edge-stable \
  --remote-debugging-port=9222 \
  --force-renderer-accessibility \
  &>/dev/null & disown
```

**Why each part matters:**

| Flag/Env | What happens without it |
|---|---|
| `AT_SPI_BUS_ADDRESS` | Edge may not register with AT-SPI at all (invisible to accessibility tools) |
| `--force-renderer-accessibility` | AT-SPI sees the Edge frame but children are **null** — buttons, tabs, toolbar all inaccessible |
| `--remote-debugging-port=9222` | CDP unavailable — no web page DOM control |

**Exception**: Edge launched by the desktop session (e.g. from i3 keybind, app launcher) inherits the correct env vars automatically. The flags are only needed when launching from a terminal/script.

### Verify Both Layers

```bash
# Verify CDP
curl -s --max-time 5 http://localhost:9222/json/version

# Verify AT-SPI (should show buttons, tabs, not just frame with null children)
python3 -c "
import gi; gi.require_version('Atspi', '2.0'); from gi.repository import Atspi
d = Atspi.get_desktop(0)
for i in range(d.get_child_count()):
    a = d.get_child_at_index(i)
    if 'Edge' in (a.get_name() or ''):
        f = a.get_child_at_index(0)
        c = f.get_child_at_index(0) if f else None
        print(f'{a.get_name()}: frame={f is not None}, first_child={c is not None}')
"
# If first_child=None → missing --force-renderer-accessibility
# If Edge not listed → missing AT_SPI_BUS_ADDRESS
```

### Python Environments

- **OS automation (AT-SPI/dogtail)**: `~/.local/share/os-automate/bin/python`
  - Has dogtail + system gi (GObject Introspection) via `--system-site-packages`
  - If missing: `uv venv --python /usr/bin/python3 --system-site-packages ~/.local/share/os-automate && uv pip install --python ~/.local/share/os-automate/bin/python dogtail`

- **CDP (web automation)**: `/tmp/cdp-env/bin/python3`
  - Has websocket-client
  - If missing: `cd /tmp && uv venv cdp-env && uv pip install --python cdp-env/bin/python websocket-client`

## AT-SPI Reference

### List Apps & Find Edge

```python
import gi
gi.require_version('Atspi', '2.0')
from gi.repository import Atspi

desktop = Atspi.get_desktop(0)
for i in range(desktop.get_child_count()):
    app = desktop.get_child_at_index(i)
    print(f'{i}: {app.get_name()} (children: {app.get_child_count()})')
```

### Dump Widget Tree

```python
def dump_tree(node, indent=0, max_depth=5):
    if indent > max_depth:
        return
    try:
        role = node.get_role_name()
        name = node.get_name() or ''
        text = ''
        try:
            ti = node.get_text()
            if ti:
                text = ti.get_text(0, min(ti.get_character_count(), 100))
        except:
            pass
        extra = f' text="{text}"' if text else ''
        ai = node.get_action_iface()
        actions = ''
        if ai:
            actions = f' actions=[{", ".join(ai.get_action_name(a) for a in range(ai.get_n_actions()))}]'
        print(f"{'  ' * indent}[{role}] \"{name}\"{extra}{actions}")
        for i in range(node.get_child_count()):
            child = node.get_child_at_index(i)
            if child:
                dump_tree(child, indent + 1, max_depth)
    except:
        pass
```

### Find & Interact

```python
def find_by_name(node, name, depth=0, max_d=8):
    if depth > max_d: return None
    try:
        if name in (node.get_name() or ''):
            return node
        for i in range(node.get_child_count()):
            r = find_by_name(node.get_child_at_index(i), name, depth+1, max_d)
            if r: return r
    except: pass
    return None

def find_all_by_role(node, role_name, results=None, depth=0, max_d=8):
    if results is None: results = []
    if depth > max_d: return results
    try:
        if node.get_role_name() == role_name:
            results.append(node)
        for i in range(node.get_child_count()):
            find_all_by_role(node.get_child_at_index(i), role_name, results, depth+1, max_d)
    except: pass
    return results

# Click a button
button = find_by_name(frame, "Refresh")
button.get_action_iface().do_action(0)  # 'press'

# Focus address bar
entry = find_by_name(frame, "Address and search bar")
entry.get_action_iface().do_action(0)  # 'activate'
```

### AT-SPI Action Types

| Element | Action 0 | Action 1 |
|---|---|---|
| `button` | `press` or `click` | `showContextMenu` |
| `entry` | `activate` (focus) | `showContextMenu` |
| `page tab` | `switch` | `showContextMenu` |
| `toggle button` | `press` (toggle) | `showContextMenu` |
| `link` | `jump` | `showContextMenu` |
| `list item` | `activate` | `showContextMenu` |

### File Dialog via AT-SPI

File dialogs are native GTK, spawned by `xdg-desktop-portal-gtk`. CDP cannot see them.

```python
# Find the portal app (appears when dialog is open)
portal = None
for i in range(desktop.get_child_count()):
    app = desktop.get_child_at_index(i)
    if 'portal' in (app.get_name() or '').lower():
        if app.get_child_count() > 0:
            portal = app
            break

dialog = portal.get_child_at_index(0)

# Key elements inside:
# - Sidebar: find_all_by_role(dialog, 'list item') → Home, Desktop, Downloads...
# - File list: find_by_name(dialog, 'Files') → table with Name, Size, Type, Modified
# - Filename input: find_all_by_role(dialog, 'text')
# - Filter: find combo box with "*.pdf" or "All files"
# - Buttons: find_by_name(dialog, 'Save'), find_by_name(dialog, 'Cancel')
```

### AT-SPI Troubleshooting

**Symptom → Cause → Fix:**

| Symptom | Cause | Fix |
|---|---|---|
| Edge not in AT-SPI app list at all | Missing `AT_SPI_BUS_ADDRESS` env var | Relaunch with `AT_SPI_BUS_ADDRESS="unix:path=/run/user/1000/at-spi/bus_0"` |
| Edge frame visible but children are `None` | Missing `--force-renderer-accessibility` | Relaunch with the flag |
| Edge frame visible, children exist but web content empty | Normal — AT-SPI doesn't see DOM | Use CDP for web content |
| AT-SPI registry daemon not running | `at-spi2-registryd` crashed | `pgrep -f at-spi2-registryd` — if missing, logout/login |

**The full launch command is in Prerequisites above. Use it every time when launching from terminal.**

Edge launched from the desktop session (app launcher, i3 keybind) works without explicit flags because the desktop env sets `AT_SPI_BUS_ADDRESS` automatically.

**DO NOT conclude "Chromium doesn't support AT-SPI on Linux."** It does — the issue is always missing env vars or flags.

## CDP Reference

### Python Template

```python
import json, time, base64, urllib.request
from websocket import create_connection

CDP = "http://127.0.0.1:9222"
PYTHON = "/tmp/cdp-env/bin/python3"

tabs = json.loads(urllib.request.urlopen(f"{CDP}/json").read())
page_tabs = [t for t in tabs if t["type"] == "page"]
ws = create_connection(page_tabs[0]["webSocketDebuggerUrl"], suppress_origin=True)

def cdp(method, params=None):
    cdp._id = getattr(cdp, "_id", 0) + 1
    msg = {"id": cdp._id, "method": method}
    if params: msg["params"] = params
    ws.send(json.dumps(msg))
    resp = json.loads(ws.recv())
    if "error" in resp: print(f"CDP ERROR: {resp['error']}")
    return resp

def get_value(resp):
    try: return resp["result"]["result"]["value"]
    except (KeyError, TypeError):
        print(f"Unexpected: {json.dumps(resp)[:200]}")
        return None

# ... work ...
ws.close()
```

### Sanitized DOM Extractor (CRITICAL — always use this, never dump raw classes/styles)

```python
resp = cdp("Runtime.evaluate", {"expression": """
    JSON.stringify((() => {
        var seen = new Set();
        return Array.from(document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="listitem"], [role="option"], [contenteditable]'))
            .filter(el => {
                var r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) return false;
                var t = el.textContent.trim().substring(0, 100);
                if (seen.has(t)) return false;
                seen.add(t);
                return t.length > 0;
            })
            .map((el, i) => ({
                i: i,
                tag: el.tagName.toLowerCase(),
                text: el.textContent.trim().substring(0, 100),
                type: el.type || undefined,
                href: el.href || undefined,
                editable: el.contentEditable === 'true' || undefined,
                x: Math.round(el.getBoundingClientRect().x + el.getBoundingClientRect().width/2),
                y: Math.round(el.getBoundingClientRect().y + el.getBoundingClientRect().height/2)
            }))
    })())
"""})
```

### Common CDP Operations

```python
# Navigate
cdp("Page.navigate", {"url": "https://example.com"})
time.sleep(3)

# Page info
cdp("Runtime.evaluate", {"expression": "JSON.stringify({title: document.title, url: location.href})"})

# Async JS (MUST use awaitPromise)
cdp("Runtime.evaluate", {"expression": "(async () => { return await fetch('/api').then(r=>r.text()) })()", "awaitPromise": True})

# Click element
cdp("Runtime.evaluate", {"expression": "document.querySelector('button.submit').click()"})

# Click at coordinates (shadow DOM, iframes)
cdp("Input.dispatchMouseEvent", {"type": "mousePressed", "x": 500, "y": 300, "button": "left", "clickCount": 1})
cdp("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": 500, "y": 300, "button": "left", "clickCount": 1})

# Type text
cdp("Input.insertText", {"text": "hello world"})

# Key press
cdp("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13})
cdp("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13})

# Screenshot
resp = cdp("Page.captureScreenshot", {"format": "png"})
with open("/tmp/screenshot.png", "wb") as f:
    f.write(base64.b64decode(resp["result"]["data"]))

# Tab management
tabs = json.loads(urllib.request.urlopen(f"{CDP}/json").read())
urllib.request.urlopen(f"{CDP}/json/activate/{tab_id}")
# DO NOT use /json/new — returns 405 on Edge. Use window.open() instead.

# Cookies
cdp("Network.getCookies")
cdp("Network.setCookie", {"name": "k", "value": "v", "domain": ".example.com", "path": "/"})
```

### Upload File via Browser Session (bypass file dialog)

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

## xdotool Safety Rules

**xdotool types into WHATEVER WINDOW IS FOCUSED — not a target window.**

Before ANY `xdotool type` or `xdotool key`:
1. Focus: `xdotool search --name "Edge" windowactivate`
2. Verify: `xdotool getactivewindow getwindowname` — assert "Edge" is in output
3. Only then type. If assertion fails, **STOP**.

If xdotool misses focus, it sends keystrokes to Discord/Slack/etc — leaking data.

## Common Pitfalls

- **Drag & drop upload**: synthetic `DragEvent` may fail. Web apps (Zalo) validate file origin. Use native dialog or fetch API instead.
- **CDP recv() returns events**: `ws.recv()` may return `Page.loadEventFired` instead of your response. Loop until matching `id`.
- **Large base64 in JS**: multi-MB files may hit expression limits. Chunk or use `IO.read/write`.
- **Screenshots as navigation**: NEVER. Extract DOM text first. Screenshots only for visual verification.

## Critical Rules

1. `suppress_origin=True` in `create_connection()` — always
2. Use venv python: `/tmp/cdp-env/bin/python3`
3. `awaitPromise: True` for async JS — always
4. Never use `/json/new` — returns 405. Use `window.open()`
5. Close port 9222 when not automating — CDP exposes full browser control
6. Never assume UI actions succeeded — verify via DOM or AT-SPI after every action
7. Never retry blindly — read state, understand what happened, then adjust
8. Stop after 2-3 failures and ask user

## App-Specific Skills

When automating specific web apps, load the dedicated skill for app-specific DOM selectors and workflows:

| App | Skill | Why |
|---|---|---|
| Zalo (chat.zalo.me) | `/zalo-control` | File send/receive, contact nav, message handling |
| Moodle | (use browser-control directly) | Upload via Moodle draft file API |

## General Safety Rules

- **NEVER enter sensitive data** (passwords, tokens) — instruct user to do it
- **NEVER auto-submit** purchases, account creation, sharing permissions
- Always confirm before sending messages or irreversible actions
- Never bypass CAPTCHA or bot detection
