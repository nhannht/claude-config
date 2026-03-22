# Discord Self-Botting

Control Discord desktop app via CDP (port 9223) + AT-SPI. Gray area — UI automation, not API token abuse. See `/browser-control` for full CDP/AT-SPI setup.

## Risk Awareness

- Discord bans self-botting via API token. We don't use tokens — we control the Electron app via CDP like a human clicking buttons.
- Still risky at scale: rapid automated messages, mass actions, or bot-like patterns can trigger detection.
- **Keep it human-paced**: add delays between actions, don't spam, don't mass-DM.

## Prerequisites

### Install Discord (native, not Flatpak)

```bash
sudo pacman -S discord
```

Flatpak sandboxes AT-SPI bus access. Native install avoids this. If stuck on Flatpak:
```bash
flatpak override --user com.discordapp.Discord --talk-name=org.a11y.Bus
```
But native is simpler.

### Launch Command

```bash
AT_SPI_BUS_ADDRESS="unix:path=/run/user/1000/at-spi/bus_0" \
  discord \
  --remote-debugging-port=9223 \
  --force-renderer-accessibility \
  &>/dev/null & disown
```

| Flag | Purpose |
|---|---|
| `AT_SPI_BUS_ADDRESS` | Register with AT-SPI (native dialogs, window state) |
| `--remote-debugging-port=9223` | CDP on port 9223 (Edge uses 9222) |
| `--force-renderer-accessibility` | AT-SPI sees children, not just empty frame |

### Verify

```bash
# CDP
curl -s --max-time 3 http://localhost:9223/json/version

# AT-SPI
python3 -c "
import gi; gi.require_version('Atspi', '2.0'); from gi.repository import Atspi
d = Atspi.get_desktop(0)
for i in range(d.get_child_count()):
    a = d.get_child_at_index(i)
    if 'discord' in (a.get_name() or '').lower():
        print(f'{a.get_name()}: {a.get_child_count()} frames')
"
```

### Python Environment

Same as `/browser-control`: `/tmp/cdp-env/bin/python3` (websocket-client).

## CDP Connection Template

```python
import json, time, urllib.request
from websocket import create_connection

tabs = json.loads(urllib.request.urlopen("http://localhost:9223/json/list").read())
main = [t for t in tabs if t["url"].startswith("https://discord.com/")][0]
ws = create_connection(main["webSocketDebuggerUrl"], suppress_origin=True)

def cdp(method, params=None):
    cdp._id = getattr(cdp, "_id", 0) + 1
    msg = {"id": cdp._id, "method": method}
    if params: msg["params"] = params
    ws.send(json.dumps(msg))
    while True:
        resp = json.loads(ws.recv())
        if "id" in resp and resp["id"] == cdp._id:
            if "error" in resp: print(f"CDP ERROR: {resp['error']}")
            return resp

# ... work ...
ws.close()
```

## Discord Internal API (via webpack)

Discord's React app exposes internal stores via `webpackChunkdiscord_app`. This gives direct access to guilds, channels, users, messages — far more reliable than DOM scraping.

### Access Pattern

```javascript
(function() {
    let wp = webpackChunkdiscord_app;
    let modules = wp.push([[Symbol()], {}, e => e]);
    wp.pop();
    let cache = Object.values(modules.c);

    for (let m of cache) {
        let exp = m?.exports;
        if (!exp) continue;
        for (let key of Object.keys(exp)) {
            let val = exp[key];
            if (val?.getName && val.getName() === 'STORE_NAME_HERE') {
                return val;
            }
        }
    }
})()
```

### Known Stores

| Store Name | What it gives | Key methods |
|---|---|---|
| `GuildStore` | All servers | `getGuilds()` → `{id, name, ownerId, icon, ...}` |
| `ChannelStore` | All channels | `getChannel(id)`, `getChannels()` |
| `MessageStore` | Messages | `getMessage(channelId, msgId)` |
| `UserStore` | Users | `getUser(id)`, `getCurrentUser()` |
| `GuildMemberStore` | Server members | `getMember(guildId, userId)` |
| `SelectedChannelStore` | Current channel | `getChannelId()` |
| `SelectedGuildStore` | Current server | `getGuildId()` |

### List All Servers

```javascript
// Returns [{id, name}, ...]
(function() {
    let wp = webpackChunkdiscord_app;
    let modules = wp.push([[Symbol()], {}, e => e]);
    wp.pop();
    let cache = Object.values(modules.c);
    for (let m of cache) {
        let exp = m?.exports;
        if (!exp) continue;
        for (let key of Object.keys(exp)) {
            let val = exp[key];
            if (val?.getName && val.getName() === 'GuildStore') {
                let guilds = val.getGuilds();
                return JSON.stringify(Object.values(guilds).map(g => ({id: g.id, name: g.name})));
            }
        }
    }
})()
```

## Common Operations

### Navigate to Server

```python
cdp("Runtime.evaluate", {"expression": f"window.location.href = 'https://discord.com/channels/{guild_id}'"})
time.sleep(3)
```

### Navigate to Channel

```python
cdp("Runtime.evaluate", {"expression": f"window.location.href = 'https://discord.com/channels/{guild_id}/{channel_id}'"})
time.sleep(3)
```

### List Channels in Current Server

```python
resp = cdp("Runtime.evaluate", {"expression": """
    JSON.stringify(Array.from(document.querySelectorAll('a[href*="/channels/"]')).map(a => ({
        text: a.textContent.trim().substring(0, 50),
        href: a.href,
        ariaLabel: a.getAttribute('aria-label')
    })).filter(c => c.ariaLabel && c.ariaLabel.includes('text channel')))
"""})
```

### Send a Message

```python
# 1. Make sure you're in the right channel
# 2. Find the message input
resp = cdp("Runtime.evaluate", {"expression": """
    var tb = document.querySelector('[role="textbox"][data-slate-editor="true"]');
    tb ? JSON.stringify({
        found: true,
        x: Math.round(tb.getBoundingClientRect().x + tb.getBoundingClientRect().width/2),
        y: Math.round(tb.getBoundingClientRect().y + tb.getBoundingClientRect().height/2)
    }) : 'NOT_FOUND'
"""})

# 3. Click to focus
coords = json.loads(resp["result"]["result"]["value"])
cdp("Input.dispatchMouseEvent", {"type": "mousePressed", "x": coords["x"], "y": coords["y"], "button": "left", "clickCount": 1})
cdp("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": coords["x"], "y": coords["y"], "button": "left", "clickCount": 1})
time.sleep(0.3)

# 4. Type message
cdp("Input.insertText", {"text": "Hello from the gray area"})
time.sleep(0.5)

# 5. Press Enter to send
cdp("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13})
cdp("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13})
```

### Read Messages in Current Channel

```python
resp = cdp("Runtime.evaluate", {"expression": """
    JSON.stringify(Array.from(document.querySelectorAll('[id^="chat-messages-"]')).map(msg => {
        var author = msg.querySelector('[class*="username_"]')?.textContent;
        var content = msg.querySelector('[id^="message-content-"]')?.textContent;
        var time = msg.querySelector('time')?.getAttribute('datetime');
        return {author, content: content?.substring(0, 200), time};
    }).filter(m => m.content))
"""})
```

### Read Unread Channels

```python
# Channels with "unread" in aria-label have new messages
resp = cdp("Runtime.evaluate", {"expression": """
    JSON.stringify(Array.from(document.querySelectorAll('a[href*="/channels/"]')).map(a => ({
        name: a.getAttribute('aria-label'),
        href: a.href
    })).filter(c => c.name && c.name.includes('unread')))
"""})
```

### Upload Image (DataTransfer Hack — No File Dialog)

Bypass the native file dialog entirely. Inject a file directly into Discord's hidden `<input type="file">` via `DataTransfer`.

```python
import base64

# 1. Read image as base64
with open("/path/to/image.png", "rb") as f:
    img_b64 = base64.b64encode(f.read()).decode()

# 2. Inject into Discord's file input
resp = cdp("Runtime.evaluate", {"expression": f"""
    (async () => {{
        var b64 = "{img_b64}";
        var binary = atob(b64);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        var file = new File([bytes], "image.png", {{type: "image/png"}});
        var dt = new DataTransfer();
        dt.items.add(file);

        var input = document.querySelector('input.file-input');
        input.files = dt.files;

        // Dispatch change event to trigger React's handler
        var event = new Event('change', {{bubbles: true}});
        input.dispatchEvent(event);

        return 'injected: ' + file.name + ' (' + file.size + ' bytes)';
    }})()
""", "awaitPromise": True})
# Upload preview should appear

# 3. Optionally add a caption — focus textbox and type before sending
# cdp("Input.insertText", {"text": "check this out"})

# 4. Press Enter to send
time.sleep(1)
cdp("Runtime.evaluate", {"expression": "document.querySelector('[role=\"textbox\"]').focus()"})
time.sleep(0.3)
cdp("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13})
cdp("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13})

# 5. Verify — upload preview should disappear
time.sleep(2)
resp = cdp("Runtime.evaluate", {"expression": """
    document.querySelector('[class*="upload_"]')?.textContent || 'SENT'
"""})
```

**How it works:**
1. `input.file-input` — Discord's hidden file input (class `file-input`, parent `uploadInput__*`)
2. `DataTransfer` API — creates a synthetic `FileList` from a `File` object constructed from base64 bytes
3. Dispatching `change` event with `bubbles: true` triggers React's synthetic event handler
4. Discord shows the upload preview (filename, Spoiler/Modify/Remove buttons)
5. Enter sends it like a normal message

**Supports any file type** — not just images. Works for PDFs, ZIPs, videos, etc. Just change the MIME type:
- `image/png`, `image/jpeg`, `image/gif`
- `application/pdf`
- `video/mp4`
- `application/zip`

**Size limit**: Discord free = 25MB, Nitro = 500MB. Base64 inflates size ~33%, so keep source files under ~18MB for free accounts.

### Upload Image with Caption

```python
# After injecting the file (step 2 above), type a caption before pressing Enter
time.sleep(1)
resp = cdp("Runtime.evaluate", {"expression": """
    var tb = document.querySelector('[role="textbox"][data-slate-editor="true"]');
    tb.focus();
    JSON.stringify({x: Math.round(tb.getBoundingClientRect().x + 10), y: Math.round(tb.getBoundingClientRect().y + 10)})
"""})
coords = json.loads(resp["result"]["result"]["value"])
cdp("Input.dispatchMouseEvent", {"type": "mousePressed", "x": coords["x"], "y": coords["y"], "button": "left", "clickCount": 1})
cdp("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": coords["x"], "y": coords["y"], "button": "left", "clickCount": 1})
time.sleep(0.3)
cdp("Input.insertText", {"text": "here's the screenshot"})
time.sleep(0.5)
# Then Enter to send both image + caption
```

### Show/Hide Member List

```python
# Toggle member sidebar
cdp("Runtime.evaluate", {"expression": """
    var btn = document.querySelector('[aria-label="Show Member List"]') ||
              document.querySelector('[aria-label="Hide Member List"]');
    btn ? (btn.click(), btn.getAttribute('aria-label')) : 'NOT_FOUND'
"""})
time.sleep(1)

# Read members (after showing)
resp = cdp("Runtime.evaluate", {"expression": """
    JSON.stringify({
        members: Array.from(document.querySelectorAll('[data-list-item-id*="members-"]')).map(
            m => m.textContent.trim().substring(0, 40)
        ),
        header: Array.from(document.querySelectorAll('[class*="members_"] h2')).map(h => h.textContent)
    })
"""})
```

## DOM Selectors

| Element | Selector | Notes |
|---|---|---|
| Message textbox | `[role="textbox"][data-slate-editor="true"]` | Slate.js editor, contenteditable |
| Messages | `[id^="chat-messages-"]` | Each message block |
| Message content | `[id^="message-content-"]` | Text of a message |
| Username in message | `[class*="username_"]` | Author name |
| Channel links | `a[href*="/channels/"]` | Sidebar channel list |
| Server icons | `[data-list-item-id*="guildsnav___"]` | Server sidebar |
| Server name in header | `[class*="name_"] h1` | Current server/channel name |
| File input (upload) | `input.file-input` | Hidden, parent `uploadInput__*`. Use DataTransfer hack |
| Upload preview | `[class*="upload_"]` | Shows after file injection, disappears after send |
| Member list items | `[data-list-item-id*="members-"]` | Visible when member sidebar is open |
| Member list toggle | `[aria-label="Show Member List"]` | Toggles sidebar |
| Attachment button | `[aria-label="Upload a File or Send Invites"]` | The + icon (use for AT-SPI file dialog approach) |

## AT-SPI Role (Limited)

Discord's AT-SPI tree is mostly unnamed `[panel]` and `[section]` nodes — poor ARIA labels. AT-SPI is useful for:

- Detecting if Discord window exists and its title
- Handling native dialogs (file upload, print)
- Window state (focused, minimized)

For everything else, use CDP. This is the opposite of Edge where AT-SPI excels at browser chrome.

## Key Differences from Edge/Twitter

| Aspect | Edge/Twitter | Discord |
|---|---|---|
| CDP port | 9222 | 9223 |
| Text input | `contenteditable div` | Slate.js `[role="textbox"]` |
| Send action | Click Post button | Press Enter |
| Internal API | None | `webpackChunkdiscord_app` stores |
| AT-SPI quality | Good (buttons, tabs labeled) | Poor (unnamed sections) |
| Post verification | Check profile DOM | Check message appears in chat |
| "Leave site?" dialog | Yes (compose) | No (SPA, no beforeunload) |
| File upload | Native dialog only | **DataTransfer hack** — no dialog needed |
| Image with caption | N/A | Inject file + type in textbox + Enter |

## Safety Rules

- **Never send messages without user confirmation** — this is someone's real account
- **Human-paced delays** — minimum 1-2s between actions, 5s+ between messages
- **No mass actions** — no bulk DMs, no spam, no raid-like behavior
- **No token extraction** — we control the UI, never touch auth tokens
- **Verify before sending** — always show the user what will be sent and where
