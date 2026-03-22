# Twitter/X Manipulator

Automate posting, replying, and reading on X (twitter.com) via CDP + AT-SPI. See `/browser-control` for the full CDP/AT-SPI setup, Python environments, and decision matrix.

## Prerequisites

- Edge running with CDP + AT-SPI flags (see `/browser-control` Prerequisites)
- Logged into X.com
- CDP env: `/tmp/cdp-env/bin/python3` (websocket-client)

## X.com DOM Selectors (data-testid)

| Element | Selector | Notes |
|---|---|---|
| Compose textbox | `[data-testid="tweetTextarea_0"]` | `contenteditable="true"`, role=textbox |
| Post button (compose page) | `[data-testid="tweetButton"]` | `aria-disabled` when empty or >280 chars |
| Post button (inline) | `[data-testid="tweetButtonInline"]` | Appears in some contexts |
| Reply button | `[data-testid="reply"]` | On each tweet |
| Tweet text | `[data-testid="tweetText"]` | All visible tweets |
| Retweet button | `[data-testid="retweet"]` | |
| Like button | `[data-testid="like"]` | |
| Unlike button | `[data-testid="unlike"]` | |
| User avatar | `[data-testid="UserAvatar-Container"]` | |

## Key URLs

| Page | URL |
|---|---|
| Compose new tweet | `https://x.com/compose/post` |
| Profile | `https://x.com/<username>` |
| Home timeline | `https://x.com/home` |
| Tweet permalink | `https://x.com/<username>/status/<id>` |

## Character Limit

- **280 characters** max per tweet
- Post button stays `aria-disabled` if text is empty or exceeds 280
- Always check length before posting: `len(tweet_text) <= 280`

## Posting a Tweet (CDP)

```python
# 1. Navigate to compose
cdp("Page.navigate", {"url": "https://x.com/compose/post"})
time.sleep(4)

# 2. Click compose box (get coordinates first)
resp = cdp("Runtime.evaluate", {"expression": """
    var el = document.querySelector('[data-testid="tweetTextarea_0"]');
    var r = el.getBoundingClientRect();
    JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)})
"""})
coords = json.loads(resp["result"]["result"]["value"])
cdp("Input.dispatchMouseEvent", {"type": "mousePressed", "x": coords["x"], "y": coords["y"], "button": "left", "clickCount": 1})
cdp("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": coords["x"], "y": coords["y"], "button": "left", "clickCount": 1})
time.sleep(0.5)

# 3. Type text
cdp("Input.insertText", {"text": tweet_text})
time.sleep(1)

# 4. Verify button is enabled
resp = cdp("Runtime.evaluate", {"expression": """
    document.querySelector('[data-testid="tweetButton"]').getAttribute('aria-disabled')
"""})
# Should be None (not 'true')

# 5. Click Post button (get coordinates, dispatch mouse events)
resp = cdp("Runtime.evaluate", {"expression": """
    var btn = document.querySelector('[data-testid="tweetButton"]');
    var r = btn.getBoundingClientRect();
    JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)})
"""})
bc = json.loads(resp["result"]["result"]["value"])
cdp("Input.dispatchMouseEvent", {"type": "mousePressed", "x": bc["x"], "y": bc["y"], "button": "left", "clickCount": 1})
cdp("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": bc["x"], "y": bc["y"], "button": "left", "clickCount": 1})
time.sleep(3)

# 6. Verify — after posting, URL changes to https://x.com/home
```

## Posting a Thread (multiple tweets as replies)

```
Step 1: Post tweet 1 via compose page (see above)
Step 2: Navigate to profile: https://x.com/<username>
Step 3: Find reply button on the latest tweet: [data-testid="reply"] (index 0 = most recent)
Step 4: Click reply → compose box appears as overlay
Step 5: Click compose box, type tweet 2, click Post
Step 6: Repeat from Step 3 for tweet 3, 4, etc.
```

**Key**: After each reply post, you stay on the profile page. Find the reply button on the MOST RECENT tweet (index 0) to continue the thread.

## Replying to a Tweet

```python
# Find reply buttons on page
resp = cdp("Runtime.evaluate", {"expression": """
    JSON.stringify(Array.from(document.querySelectorAll('[data-testid="reply"]')).map((r, i) => {
        var rect = r.getBoundingClientRect();
        return {i, x: Math.round(rect.x + rect.width/2), y: Math.round(rect.y + rect.height/2)};
    }))
"""})
# Click the desired reply button → compose overlay opens
# Then type + click Post (same as posting)
```

## Verifying Tweets Were Posted

```python
# Navigate to profile
cdp("Page.navigate", {"url": "https://x.com/REDACTED_HANDLE"})
time.sleep(4)

# Read all visible tweets
resp = cdp("Runtime.evaluate", {"expression": """
    JSON.stringify(Array.from(document.querySelectorAll('[data-testid="tweetText"]')).map(
        (t, i) => ({i, text: t.textContent.substring(0, 100)})
    ))
"""})
```

**ALWAYS verify after posting.** Previous attempts reported success but nothing was actually posted. Trust DOM state, not script output.

## Critical Pitfalls

### "Leave site?" Dialog (MOST DANGEROUS)

When compose has unsaved text and you navigate away, Edge shows a native "Leave site?" dialog.

- **CDP CANNOT see or dismiss this dialog** — it blocks all CDP commands
- **AT-SPI CAN see and dismiss it**:
  ```python
  # Find and click "Leave" button via AT-SPI
  # See /browser-control for AT-SPI reference code
  button = find_by_name(edge_frame, "Leave")  # role=button
  button.get_action_iface().do_action(0)
  ```
- **Prevention**: Don't navigate away from compose with text in it. Either post first or dismiss the compose overlay (click X button)
- **`window.onbeforeunload = null` does NOT work** — X uses React synthetic events, not native handlers

### Clearing Compose Text

- `Ctrl+A → Backspace` via CDP key events does NOT reliably clear contenteditable
- `selectAllChildren() → Backspace` also unreliable
- **Best approach**: Navigate away (handle Leave dialog via AT-SPI), then navigate back to fresh compose

### JS `.click()` vs Coordinate Clicks

- `document.querySelector('[data-testid="tweetButton"]').click()` — **may silently fail** on X
- **Always use coordinate-based clicks** via `Input.dispatchMouseEvent` (mousePressed + mouseReleased)
- Get coordinates from `getBoundingClientRect()` first

### Post Button States

- `aria-disabled` = `null` or absent → button is **clickable**
- `aria-disabled` = `"true"` → button is **disabled** (no text, or >280 chars)
- Always check before clicking

### CDP WebSocket Stability

- Long-running connections can go stale
- Create a fresh `create_connection()` for each operation batch
- If `ws.recv()` hangs, the "Leave site?" dialog is probably blocking — check AT-SPI

## Reading Timeline / Scraping

```python
# Get interactive elements on any X page
resp = cdp("Runtime.evaluate", {"expression": """
    JSON.stringify(Array.from(document.querySelectorAll('article')).map((a, i) => ({
        i,
        text: a.querySelector('[data-testid="tweetText"]')?.textContent?.substring(0, 200),
        author: a.querySelector('[data-testid="User-Name"]')?.textContent?.substring(0, 50),
        time: a.querySelector('time')?.getAttribute('datetime')
    })))
"""})
```

## Quick Reference: Tool Selection

| Task | Tool | Why |
|---|---|---|
| Type tweet text | CDP (`Input.insertText`) | Web content |
| Click Post button | CDP (`Input.dispatchMouseEvent`) | Web content |
| Read tweets | CDP (`Runtime.evaluate`) | DOM access |
| Dismiss "Leave site?" | **AT-SPI** | Native browser dialog |
| Check for blocking dialogs | **AT-SPI** | Browser chrome |
| Read tab list | **AT-SPI** | Browser chrome |

For full AT-SPI/CDP setup and Python environments, see `/browser-control`.
