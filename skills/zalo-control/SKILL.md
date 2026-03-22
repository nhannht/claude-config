# Zalo Control

Automate Zalo Web (chat.zalo.me) via browser automation. **Depends on `/browser-control` skill** - always load that first for CDP/AT-SPI/dogtail setup.

## Prerequisites

- Edge running with CDP (port 9222) + AT-SPI (`--force-renderer-accessibility`)
- Zalo Web logged in at `https://chat.zalo.me/`
- Python envs: `~/.claude/skills/asus-browser-control/.venv/bin/python` (CDP + websockets), `~/.local/share/os-automate/bin/python` (dogtail)

## Finding Zalo Tab

### CDP (async websockets — preferred)
```python
import json, asyncio, websockets, urllib.request

async def cdp(ws, method, params=None):
    cdp.id = getattr(cdp, 'id', 0) + 1
    await ws.send(json.dumps({"id": cdp.id, "method": method, "params": params or {}}))
    while True:
        resp = json.loads(await ws.recv())
        if resp.get("id") == cdp.id:
            return resp.get("result", {})

tabs = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json").read())
zalo = [t for t in tabs if 'zalo' in t['url'].lower() and t['type']=='page'][0]
# Then: async with websockets.connect(zalo['webSocketDebuggerUrl'], max_size=10_000_000) as ws:
```

### TabFS
```bash
ls ~/TabFS/fs/mnt/tabs/by-title/ | grep -i zalo
```

## Contact Navigation

### Find a contact in the sidebar

**Method 1: Text walker (RELIABLE — works even when CSS class names change)**
```javascript
// Walks all visible text nodes in the sidebar (x < 350, y > 50)
JSON.stringify((() => {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var results = [];
    var seen = new Set();
    while (walker.nextNode()) {
        var node = walker.currentNode;
        var text = node.textContent.trim();
        if (text.length > 2 && text.length < 80) {
            var range = document.createRange();
            range.selectNode(node);
            var rect = range.getBoundingClientRect();
            if (rect.x < 350 && rect.y > 50 && rect.y < 700 && rect.width > 20 && !seen.has(text)) {
                seen.add(text);
                results.push({t: text, x: Math.round(rect.x + rect.width/2), y: Math.round(rect.y + rect.height/2)});
            }
        }
    }
    return results;
})())
```

**Method 2: querySelectorAll (may miss items if class names change)**
```javascript
JSON.stringify((() => {
    var items = document.querySelectorAll('[class*="conv-item"], [class*="chat-item"], [class*="contact"], [class*="thread"]');
    var results = [];
    items.forEach((el, i) => {
        var text = el.textContent.trim().substring(0, 100);
        if (text.toLowerCase().includes('TARGET_NAME'.toLowerCase())) {
            var r = el.getBoundingClientRect();
            results.push({i, text: text.substring(0, 80), x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)});
        }
    });
    return results;
})())
```

**Pinned chats** appear at the top of the sidebar. Search the text walker results for the group name — it will be there even without scrolling.

### Click a contact
Use CDP `Input.dispatchMouseEvent` at the coordinates returned above. Do NOT use JS `.click()` on Zalo contact items — they use complex event handling that JS click doesn't trigger reliably.

```python
await cdp(ws, "Input.dispatchMouseEvent", {"type": "mousePressed", "x": X, "y": Y, "button": "left", "clickCount": 1})
await cdp(ws, "Input.dispatchMouseEvent", {"type": "mouseReleased", "x": X, "y": Y, "button": "left", "clickCount": 1})
```

### Verify active chat
```javascript
// Check which chat is open via the message input placeholder
var input = document.querySelector('[contenteditable="true"]');
input ? input.getAttribute('data-placeholder') || input.closest('[data-translate-inner]')?.textContent || 'unknown' : 'no input'
// Example: "Nhập @, tin nhắn tới lập trình hướng đối tượng 1"
```

## Sending Text Messages

### Step 1: Focus the input
```javascript
var input = document.querySelector('[contenteditable="true"]');
if (input) { input.focus(); input.click(); }
```

### Step 2: Insert text via CDP
```python
await cdp(ws, "Input.insertText", {"text": "Your message here"})
```

### Step 3: Click the Send button (CRITICAL — Enter key does NOT work!)
**Enter key dispatched via CDP does NOT send messages in Zalo.** You MUST click the send button.

```python
# Send button: fa-Sent-msg_24_Line icon (bottom-right of chat input)
# Dynamic discovery (recommended):
r = await cdp(ws, "Runtime.evaluate", {"expression": """
    JSON.stringify(Array.from(document.querySelectorAll('[class*="fa-Sent-msg"]'))
        .map(el => ({
            x: Math.round(el.getBoundingClientRect().x + el.getBoundingClientRect().width/2),
            y: Math.round(el.getBoundingClientRect().y + el.getBoundingClientRect().height/2)
        })))
"""})
# Then click at returned coordinates

# Or use bottom-right icon search:
r = await cdp(ws, "Runtime.evaluate", {"expression": """
    JSON.stringify(Array.from(document.querySelectorAll('[class*="fa-"], button'))
        .map(el => ({cls: (el.className||'').toString().substring(0,80), x: Math.round(el.getBoundingClientRect().x + el.getBoundingClientRect().width/2), y: Math.round(el.getBoundingClientRect().y + el.getBoundingClientRect().height/2)}))
        .filter(el => el.x > 600 && el.y > 600))
"""})
# Look for "fa-Sent-msg_24_Line" in results
```

**Last known coordinates:** Send button at approximately **(1143, 656)** — but ALWAYS verify dynamically since window size affects position.

### Step 4: ALWAYS verify the message was sent
Take a screenshot after clicking send. If the message is still in the input box, the send button wasn't hit.
```python
r = await cdp(ws, "Page.captureScreenshot", {"format": "png"})
```

### Complete send_message helper
```python
async def send_message(ws, msg):
    await cdp(ws, "Runtime.evaluate", {"expression": """
        var input = document.querySelector('[contenteditable="true"]');
        if (input) { input.focus(); input.click(); }
    """})
    await asyncio.sleep(0.3)
    await cdp(ws, "Input.insertText", {"text": msg})
    await asyncio.sleep(0.3)
    # Click send button — get coordinates dynamically
    r = await cdp(ws, "Runtime.evaluate", {"expression": """
        var btn = document.querySelector('[class*="fa-Sent-msg"]');
        if (btn) {
            var r = btn.getBoundingClientRect();
            JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)});
        } else { 'not found'; }
    """})
    coords = json.loads(r.get("result", {}).get("value", '{"x":1143,"y":656}'))
    await cdp(ws, "Input.dispatchMouseEvent", {"type": "mousePressed", "x": coords["x"], "y": coords["y"], "button": "left", "clickCount": 1})
    await cdp(ws, "Input.dispatchMouseEvent", {"type": "mouseReleased", "x": coords["x"], "y": coords["y"], "button": "left", "clickCount": 1})
    await asyncio.sleep(1)
```

## Sending Files (CRITICAL — learned the hard way)

### The problem
- `Page.setInterceptFileChooserDialog` + `Page.handleFileChooser` **DOES NOT WORK** with Zalo
- Zalo's file chooser triggers a native GTK dialog via `xdg-desktop-portal-gtk` that CDP cannot intercept
- You MUST use AT-SPI (xdotool) to handle the native file dialog

### Toolbar button locations (bottom of chat window)

**DO NOT hardcode coordinates** — they shift when the window resizes. Always discover dynamically:
```javascript
JSON.stringify(Array.from(document.querySelectorAll('[class*="fa-Sticker_24"], [class*="fa-Photo_24"], [class*="fa-Attach_24"], [class*="fa-Sent-msg"]'))
    .map(el => ({
        cls: (el.className||'').toString().match(/fa-\w+/)?.[0],
        x: Math.round(el.getBoundingClientRect().x + el.getBoundingClientRect().width/2),
        y: Math.round(el.getBoundingClientRect().y + el.getBoundingClientRect().height/2)
    })))
```

Typical positions (1366x768 window):
```
Sticker: fa-Sticker_24_Line  (~433, 628)
Photo:   fa-Photo_24_Line    (~477, 628)  ← images
Attach:  fa-Attach_24_Line   (~521, 628)  ← files
Emoji:   fa-Emoji_24_Line    (~1107, 656) ← right side
Send:    fa-Sent-msg_24_Line (~1143, 656) ← send button (right-most)
```

### Workflow: Send a file

#### Step 1: Click the attach button (for files) or photo button (for images)
```python
# For files (zip, pdf, doc, etc.)
cdp("Input.dispatchMouseEvent", {"type": "mousePressed", "x": 521, "y": 628, "button": "left", "clickCount": 1})
cdp("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": 521, "y": 628, "button": "left", "clickCount": 1})
```

#### Step 2: Zalo shows a popup menu — click "Chọn File"
```python
# Wait 1s for popup, then find and click "Chọn File"
resp = cdp("Runtime.evaluate", {"expression": """
    JSON.stringify(Array.from(document.querySelectorAll('span, div'))
        .filter(el => el.textContent.trim() === 'Chọn File')
        .map(el => ({
            x: Math.round(el.getBoundingClientRect().x + el.getBoundingClientRect().width/2),
            y: Math.round(el.getBoundingClientRect().y + el.getBoundingClientRect().height/2)
        })))
"""})
# Click at the coordinates returned
```

#### Step 3: Handle the native file dialog via xdotool
```python
import subprocess, time

# Wait for dialog to appear
time.sleep(1)

# Focus the file dialog
subprocess.run(['xdotool', 'search', '--name', 'Open files', 'windowactivate'], check=False)
time.sleep(0.5)

# Ctrl+L opens the location bar (type full path)
subprocess.run(['xdotool', 'key', 'ctrl+l'], check=False)
time.sleep(0.5)

# Type the full file path
subprocess.run(['xdotool', 'type', '--clearmodifiers', '/full/path/to/file.zip'], check=False)
time.sleep(0.5)

# Press Enter to select and close dialog
subprocess.run(['xdotool', 'key', 'Return'], check=False)
time.sleep(2)
```

#### Step 4: Verify file was sent
Screenshot the chat and check for the file message bubble.

### Workflow: Send an image
Same as file, but click the **Photo button** (fa-Photo_24_Line at ~477, 628) instead of Attach.
The photo button opens the file dialog directly — no popup menu step needed.

```python
# Click photo button
cdp("Input.dispatchMouseEvent", {"type": "mousePressed", "x": 477, "y": 628, "button": "left", "clickCount": 1})
cdp("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": 477, "y": 628, "button": "left", "clickCount": 1})
time.sleep(1)

# Then handle native file dialog with xdotool (Step 3 above)
```

### What DOES NOT work for file sending:
- **CDP `Page.setInterceptFileChooserDialog`**: Zalo's file dialog is not intercepted by CDP
- **CDP `Page.handleFileChooser`**: Never receives the `fileChooserOpened` event
- **Drag & drop via synthetic DragEvent**: Zalo validates file origin, rejects synthetic drops
- **Direct FormData upload**: Zalo uses proprietary upload endpoints with session tokens, not standard HTTP upload

## File Downloads from Chat

### Step 1: Find file elements in the chat
```javascript
// CDP - find file download elements
JSON.stringify((() => {
    var els = document.querySelectorAll('[class*="file"], [class*="download"], [class*="attach"], [class*="doc"]');
    var results = [];
    els.forEach((el, i) => {
        var r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
            results.push({
                i, tag: el.tagName,
                class: (el.className || '').toString().substring(0, 120),
                text: el.textContent.trim().substring(0, 80),
                x: Math.round(r.x), y: Math.round(r.y),
                w: Math.round(r.width), h: Math.round(r.height)
            });
        }
    });
    return results;
})())
```

### Step 2: Trigger download via JS click on the download link
```javascript
// The download <a> tag has class "clickable file-message__actions download"
// It's hidden (class "none") until hover, but JS click() works
(() => {
    var dl = document.querySelector('a.file-message__actions.download');
    if (dl) { dl.click(); return 'clicked'; }
    return 'not found';
})()
```

**CRITICAL**: If there are multiple files, `querySelector` returns only the FIRST one. Use `querySelectorAll` and index to target specific files.

### Step 3: Handle Edge download prompt (THE HARD PART)

Edge SmartScreen blocks downloads with "File requires attention". You MUST handle this.

#### What works: CDP coordinates on edge://downloads page
```python
# 1. Open/navigate to edge://downloads
cdp("Page.navigate", {"url": "edge://downloads/"})
time.sleep(2)

# 2. Screenshot to find button positions (Shadow DOM - no querySelector)
resp = cdp("Page.captureScreenshot", {"format": "png"})

# 3. Click Save at the coordinates visible in screenshot
cdp("Input.dispatchMouseEvent", {"type": "mousePressed", "x": SAVE_X, "y": SAVE_Y, "button": "left", "clickCount": 1})
cdp("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": SAVE_X, "y": SAVE_Y, "button": "left", "clickCount": 1})
```

#### What DOES NOT work (wasted time on these):
- **dogtail `doActionNamed('press')` on Save button**: Finds the button, reports success, but DOES NOT actually save the file. The `.crdownload` file stays forever.
- **dogtail `rawinput.click()` on Save button coordinates**: Same problem - appears to click but nothing happens.
- **AT-SPI raw `do_action(0)` on notification**: Opens nothing useful.
- **Clicking the download notification via AT-SPI**: The notification has `doDefault` action but it doesn't open a useful dialog.

#### What works for detecting download status:
- **dogtail** (AT-SPI): Good for DETECTING download state
  ```python
  # Find the Downloads toolbar button
  frame.child('Downloads, file requires attention', roleName='button')  # needs attention
  frame.child('Downloads', roleName='button')  # no issues
  ```
- **dogtail**: Good for OPENING the flyout
  ```python
  dl_btn.doActionNamed('press')  # toggles flyout open/closed
  ```
- **dogtail**: Can LIST buttons in flyout (Save, Open, Save as, Cancel show up)
  ```python
  save_buttons = [b for b in frame.findChildren(
      dogtail.predicate.GenericPredicate(name='Save', roleName='button')
  ) if b.showing]
  ```
- **BUT**: To actually CLICK Save, use **CDP on edge://downloads page** with coordinate clicks

#### Dogtail gotchas:
- `searchShowingOnly = True` (default) hides the download notification (it has `showing=False`)
- Set `searchShowingOnly = False` to find notifications
- `findChildren()` does NOT accept `recursive=True` keyword - it's always recursive
- `searchBackoffDuration` config option doesn't exist in newer dogtail - don't set it

### Step 4: Verify download completed
```bash
# Check for .crdownload files (still downloading)
find ~/Downloads/temp/ -name "*.crdownload" -mmin -10

# Check for completed files
find ~/Downloads/temp/ -name "*.docx" -mmin -10
```

## Tool Selection for Each Sub-task

| Sub-task | Best Tool | Why |
|---|---|---|
| Find Zalo tab | CDP (`/json` endpoint) | Direct, reliable |
| Find contact in sidebar | CDP (`Runtime.evaluate`) | DOM search |
| Click contact | CDP (`Input.dispatchMouseEvent`) | Reliable click |
| Verify active chat | CDP (`Runtime.evaluate` on `.rich-input` placeholder) | Confirm correct conversation |
| Screenshot chat | CDP (`Page.captureScreenshot`) | See what's there |
| Click toolbar buttons (attach/photo/sticker) | CDP (`Input.dispatchMouseEvent`) | Known coordinates |
| Click popup menu items ("Chọn File") | CDP (find by text, then `Input.dispatchMouseEvent`) | DOM search + coordinate click |
| Handle native file dialog | xdotool (Ctrl+L, type path, Enter) | CDP cannot intercept Zalo's file chooser |
| Send a text message | CDP (focus input) → CDP (insertText) → CDP (click send button) | Enter key does NOT work |
| Send a file | CDP (click attach) → CDP (click Chọn File) → xdotool (file dialog) | 3-step combined workflow |
| Send an image | CDP (click photo) → xdotool (file dialog) | 2-step combined workflow |
| Trigger file download | CDP (`Runtime.evaluate` + JS click) | Hidden download link |
| Detect "file requires attention" | dogtail (AT-SPI) | Browser chrome notification |
| Open downloads flyout | dogtail (AT-SPI) | Browser chrome button |
| Actually save the file | CDP on edge://downloads + coordinate click | ONLY method that works |
| Verify download complete | Bash (`find`, `ls`) | Check filesystem |

## Workflow Template: Send File to Contact

```
1. CDP: Find and activate Zalo tab
2. CDP: Verify active chat name via .rich-input placeholder
3. CDP: Click attach button (fa-Attach_24_Line at ~521, 628)
4. CDP: Wait 1s, find and click "Chọn File" in popup menu
5. xdotool: Focus "Open files" dialog → Ctrl+L → type full path → Enter
6. Wait 2s for upload
7. CDP: Screenshot to verify file message appeared in chat
```

## Workflow Template: Send Image to Contact

```
1. CDP: Find and activate Zalo tab
2. CDP: Verify active chat name via .rich-input placeholder
3. CDP: Click photo button (fa-Photo_24_Line at ~477, 628)
4. xdotool: Focus "Open files" dialog → Ctrl+L → type full path → Enter
5. Wait 2s for upload
6. CDP: Screenshot to verify image appeared in chat
```

## Workflow Template: Download File from Contact

```
1. CDP: Find and activate Zalo tab
2. CDP: Search sidebar for contact name → get coordinates
3. CDP: Click contact at coordinates → wait 2s
4. CDP: Screenshot to see chat content
5. CDP: Find file elements in DOM → get download link
6. CDP: JS click on download link (a.file-message__actions.download)
7. CDP: Screenshot to verify download started (progress bar appears)
8. Wait 3-5s for download
9. dogtail: Check if "Downloads, file requires attention" button exists
10. If yes:
    a. CDP: Navigate downloads tab to edge://downloads/
    b. CDP: Screenshot downloads page
    c. CDP: Click Save button at coordinates from screenshot
    d. Wait 2-3s
    e. CDP: Screenshot again to verify "Open file" appeared
11. Bash: Verify file exists in ~/Downloads/temp/
12. Bash: Copy to destination
```

## General Principles

1. **ALWAYS verify after every action** — take a screenshot after sending a message/file to confirm it went through. Never assume success.
2. **ALWAYS discover coordinates dynamically** — never hardcode button positions. Window size, Zalo updates, and sidebar state all affect layout.
3. **Enter key does NOT send messages** — you MUST click the send button (`fa-Sent-msg_24_Line`).
4. **Use text walker for sidebar search** — CSS class selectors break across Zalo updates. Text walker is resilient.
5. **CDP for DOM, xdotool for native dialogs** — Zalo's file chooser is a GTK dialog that CDP cannot intercept.

## Common Issues

- **Zalo content script isolation**: TabFS evals run in extension context, not Zalo page context. Use CDP for all Zalo DOM interaction.
- **File chooser not intercepted by CDP**: This is expected. Zalo's file dialog goes through xdg-desktop-portal-gtk. Always use xdotool for file selection.
- **Toolbar button coordinates shift**: If window is resized, button positions change. Always use dynamic `getBoundingClientRect()` queries.
- **Multiple files in chat**: `querySelector` returns only first match. Use `querySelectorAll` + index or scroll to find more.
- **Download location**: Edge saves to `~/Downloads/temp/` (configured download folder). Files initially appear as `.crdownload` then rename on completion.
- **Unicode filenames**: Vietnamese filenames with diacritics work fine in filesystem. Use quotes when referencing in shell commands.
- **Flyout toggle**: The Downloads button toggles the flyout. If you click it twice, it closes. Always check if flyout is already open before clicking.
- **Search overlay blocks sidebar**: If Zalo search is open, press Escape first before trying to find contacts in the sidebar.
