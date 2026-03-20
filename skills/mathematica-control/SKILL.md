# Skill: mathematica-control

Control Wolfram Mathematica (branded "Wolfram") via three complementary layers: HTTP API (expression server inside the running notebook), AT-SPI (menu automation), and xdotool (keyboard/content input).

## Installation Location

- Binary: `/usr/local/bin/wolfram` (launches the GUI notebook app "WolframNB")
- Kernel: `/usr/local/Wolfram/Wolfram/14.3/Executables/WolframKernel`
- Script runner: `/usr/bin/wolframscript`
- Version: Wolfram 14.3.0 (2025)
- AT-SPI app name: `WolframNB`

## Three Control Layers

| Need | Tool | How |
|---|---|---|
| **Compute expressions, read/write cells** | **HTTP API** | `SocketListen` expression server inside notebook |
| **Menu commands** (File, Edit, Evaluation, etc.) | **AT-SPI** | Python `gi.repository.Atspi` — full menu tree exposed |
| **Type into cells, keyboard shortcuts** | **xdotool** | `xdotool type`, `xdotool key shift+Return` |

### What each layer CAN'T do

| Layer | Limitation |
|---|---|
| AT-SPI | Cannot see notebook content (cells are `filler` nodes with no Text interface) |
| xdotool | Cannot read content — only type and send keys |
| HTTP API | Requires a `SocketListen` expression server to be running inside the notebook first |

## Launching Wolfram

```bash
# Launch the GUI notebook app
DISPLAY=:0 wolfram &>/tmp/wolfram_output.log & disown

# Wait ~10 seconds for the window to appear
sleep 10
```

The binary is `wolfram`, NOT `mathematica`. The window title will be "Untitled-1 - Wolfram" or similar.

### Headless computation (no GUI needed)

```bash
# One-shot expression
wolframscript -code 'Integrate[x^2, x]'

# Run a script file
wolframscript -file script.wl

# Interactive REPL
math
```

## HTTP API (Primary Control Method)

### Setting Up the Expression Server

The expression server must be started **inside the running notebook** so it shares the same kernel and frontend. There is no built-in API — we create one with `SocketListen`.

#### Via xdotool (type into a cell)

```bash
export DISPLAY=:0
WID=$(xdotool search --name "Wolfram" | head -1)
xdotool windowactivate --sync $WID
sleep 0.3

# Click to create a new cell
xdotool mousemove --window $WID 400 500 && xdotool click 1
sleep 0.3

# Paste the server code via clipboard (more reliable than typing)
SERVER_CODE='SocketListen[8766, Function[{assoc}, Module[{data, expr, result, client}, client = assoc["SourceSocket"]; data = ByteArrayToString[assoc["DataByteArray"]]; If[StringContainsQ[data, "GET /exec"], expr = StringCases[data, "expr=" ~~ x__ ~~ " HTTP" :> x]; result = If[Length[expr] > 0, ToString[ToExpression[URLDecode[First[expr]]], InputForm], "no expr"]; WriteString[client, "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\n" <> result]; Close[client]]]]]'

echo "$SERVER_CODE" | xclip -selection clipboard
xdotool key ctrl+v
sleep 0.5
xdotool key shift+Return
sleep 3

# Verify
ss -tlnp | grep 8766
```

#### wolframclient Python (separate kernel — cannot access existing notebook content)

```python
from wolframclient.evaluation import WolframLanguageSession
from wolframclient.language import wl, wlexpr

session = WolframLanguageSession('/usr/local/Wolfram/Wolfram/14.3/Executables/WolframKernel')
session.start()
result = session.evaluate(wlexpr('Factor[x^4 - 1]'))
print(result)  # (-1 + x)*(1 + x)*(1 + x^2)
session.terminate()
```

**WARNING**: `wolframclient` spawns a **separate kernel**. `UsingFrontEnd` in this context launches a new invisible frontend — it does NOT connect to the running GUI. To interact with the visible notebook, you MUST use the in-notebook `SocketListen` server.

### Using the HTTP API

Base URL: `http://127.0.0.1:8766/exec?expr=<URL-encoded expression>`

```bash
# Simple computation
curl -s "http://127.0.0.1:8766/exec?expr=2%2B2"
# -> 4

# URL-encode complex expressions with Python
curl -s "http://127.0.0.1:8766/exec?expr=$(python3 -c "import urllib.parse; print(urllib.parse.quote('Integrate[x^2, x]'))")"
# -> x^3/3

curl -s "http://127.0.0.1:8766/exec?expr=$(python3 -c "import urllib.parse; print(urllib.parse.quote('Table[Prime[n], {n, 1, 10}]'))")"
# -> {2, 3, 5, 7, 11, 13, 17, 19, 23, 29}

curl -s "http://127.0.0.1:8766/exec?expr=$(python3 -c "import urllib.parse; print(urllib.parse.quote('Series[Sin[x], {x, 0, 5}]'))")"
# -> SeriesData[x, 0, {1, 0, -1/6, 0, 1/120}, 1, 6, 1]
```

### Reading Notebook Cells via API

```bash
# Read all input cells from the visible notebook
curl -s "http://127.0.0.1:8766/exec?expr=$(python3 -c "
import urllib.parse
print(urllib.parse.quote('Map[First, Cases[NotebookGet[First[Notebooks[]]], Cell[content_, \"Input\", ___] :> {content}, Infinity]]'))
")"
```

### Writing Notebook Cells via API

```bash
# Write a new input cell at the end of the notebook
curl -s "http://127.0.0.1:8766/exec?expr=$(python3 -c "
import urllib.parse
print(urllib.parse.quote('With[{nb = First[Notebooks[]]}, SelectionMove[nb, After, Notebook]; NotebookWrite[nb, Cell[BoxData[\"Factor[x^4 - 1]\"], \"Input\"]]; \"cell written\"]'))
")"
# -> "cell written"
```

### Computing Cells via API

```bash
# Run the last cell
curl -s "http://127.0.0.1:8766/exec?expr=$(python3 -c "
import urllib.parse
print(urllib.parse.quote('With[{nb = First[Notebooks[]]}, SelectionMove[nb, Previous, Cell]; SelectionEvaluateCreateCell[nb]; \"done\"]'))
")"
```

### Notebook Operations via API

```bash
# Save notebook
curl -s "http://127.0.0.1:8766/exec?expr=$(python3 -c "
import urllib.parse
print(urllib.parse.quote('NotebookSave[First[Notebooks[]], \"/tmp/my_notebook.nb\"]'))
")"

# Delete all output cells
curl -s "http://127.0.0.1:8766/exec?expr=$(python3 -c "
import urllib.parse
print(urllib.parse.quote('FrontEndTokenExecute[First[Notebooks[]], \"DeleteGeneratedCells\"]'))
")"

# Run entire notebook
curl -s "http://127.0.0.1:8766/exec?expr=$(python3 -c "
import urllib.parse
print(urllib.parse.quote('NotebookEvaluate[First[Notebooks[]]]'))
")"

# List all open notebooks
curl -s "http://127.0.0.1:8766/exec?expr=$(python3 -c "
import urllib.parse
print(urllib.parse.quote('Length[Notebooks[]]'))
")"
```

### Python Helper for API Calls

```python
import urllib.parse, urllib.request

def wolfram_run(expr, port=8766):
    """Run a Wolfram Language expression via the in-notebook HTTP API."""
    url = f"http://127.0.0.1:{port}/exec?expr={urllib.parse.quote(expr)}"
    with urllib.request.urlopen(url, timeout=30) as resp:
        return resp.read().decode()

# Examples
print(wolfram_run("Factor[x^4 - 1]"))           # (-1 + x)*(1 + x)*(1 + x^2)
print(wolfram_run("D[Sin[x]*Cos[x], x]"))       # Cos[x]^2 - Sin[x]^2
print(wolfram_run("Length[Notebooks[]]"))         # 1
```

## AT-SPI Control (Menu Automation)

### What AT-SPI Can See

Wolfram Mathematica uses a **custom rendering engine** for notebook content, but exposes standard widgets for:

- **Full menu bar** with all 10 menus (File, Edit, Insert, Format, Cell, Graphics, Evaluation, Palettes, Window, Help) — complete submenus with Action interfaces
- **Status bar** — zoom button
- **Scroll bars**

**NOT visible**: cell content, mathematical expressions, input/output areas (rendered as `filler` nodes).

### Python Setup

```python
import gi
gi.require_version('Atspi', '2.0')
from gi.repository import Atspi
Atspi.init()
```

Must run with: `DISPLAY=:0 python3 script.py`

### Find Wolfram Application

```python
def find_wolfram():
    desktop = Atspi.get_desktop(0)
    for i in range(desktop.get_child_count()):
        app = desktop.get_child_at_index(i)
        if app and app.get_name() == 'WolframNB':
            return app
    return None

wolfram = find_wolfram()
frame = wolfram.get_child_at_index(0)  # main frame
```

### Menu Structure

The AT-SPI tree exposes the full menu hierarchy. Key menus:

```
menu bar (frame child [0])
+-- File: New, Open, Save, Save As, Close, Print, Quit
+-- Edit: Undo, Redo, Cut, Copy, Paste, Find, Preferences...
+-- Insert: Input from Above, AI Content Suggestion, Special Character, Typesetting, Table/Matrix
+-- Format: Style (Title/Section/Input/Code/Text...), Stylesheet, Font, Size, Colors
+-- Cell: Convert To, Cell Properties, Grouping, Divide/Merge, Delete All Output, Show Expression
+-- Graphics: Canvas, Group/Ungroup, Alignment, Distribution
+-- Evaluation: Evaluate Cells, Evaluate in Place, Evaluate Notebook, Abort, Debugger, Kernel mgmt
+-- Palettes: Basic Math Assistant, Classroom Assistant, Writing Assistant, Special Characters
+-- Window: Magnification, Toolbar, Full Screen
+-- Help: Documentation, Find Selected Function, System Information
```

### Click Menu Items

```python
def find_by_name(node, name, depth=0, max_d=15):
    if depth > max_d: return None
    try:
        if name in (node.get_name() or ''):
            return node
        for i in range(node.get_child_count()):
            r = find_by_name(node.get_child_at_index(i), name, depth+1, max_d)
            if r: return r
    except: pass
    return None

import time

# Example: Run entire notebook via menu
eval_menu = find_by_name(frame, "Evaluation")
eval_menu.get_action_iface().do_action(0)  # open menu
time.sleep(0.3)
eval_nb = find_by_name(eval_menu, "Evaluate Notebook")
eval_nb.get_action_iface().do_action(0)

# Example: Open Preferences
edit_menu = find_by_name(frame, "Edit")
edit_menu.get_action_iface().do_action(0)
time.sleep(0.3)
prefs = find_by_name(edit_menu, "Preferences...")
prefs.get_action_iface().do_action(0)

# Example: Abort computation
eval_menu = find_by_name(frame, "Evaluation")
eval_menu.get_action_iface().do_action(0)
time.sleep(0.3)
abort = find_by_name(eval_menu, "Abort Evaluation")
abort.get_action_iface().do_action(0)
```

### Frame Children

```
frame child [0]: menu bar (full menu tree)
frame child [1]: status bar (contains "100%" zoom button)
frame child [2]: filler (notebook content area — NOT accessible via AT-SPI)
```

### FrontEndTokenExecute (Alternative to AT-SPI Menu Clicks)

Many menu actions can be triggered more reliably via `FrontEndTokenExecute` through the HTTP API, bypassing AT-SPI entirely:

```bash
# Evaluate selected cells
curl -s "http://127.0.0.1:8766/exec?expr=$(python3 -c "import urllib.parse; print(urllib.parse.quote('FrontEndTokenExecute[First[Notebooks[]], \"EvaluateCells\"]'))")"

# Abort computation
curl -s "http://127.0.0.1:8766/exec?expr=$(python3 -c "import urllib.parse; print(urllib.parse.quote('FrontEndTokenExecute[\"EvaluatorAbort\"]'))")"

# Delete all output
curl -s "http://127.0.0.1:8766/exec?expr=$(python3 -c "import urllib.parse; print(urllib.parse.quote('FrontEndTokenExecute[First[Notebooks[]], \"DeleteGeneratedCells\"]'))")"

# Group/Ungroup cells
curl -s "http://127.0.0.1:8766/exec?expr=$(python3 -c "import urllib.parse; print(urllib.parse.quote('FrontEndTokenExecute[\"CellGroup\"]'))")"

# Toggle cell expression view
curl -s "http://127.0.0.1:8766/exec?expr=$(python3 -c "import urllib.parse; print(urllib.parse.quote('FrontEndTokenExecute[\"ToggleShowExpression\"]'))")"
```

Common tokens: `EvaluateCells`, `EvaluatorAbort`, `EvaluatorHalt`, `DeleteGeneratedCells`, `CellGroup`, `CellUngroup`, `CellSplit`, `CellMerge`, `ToggleShowExpression`, `SelectionOpenAllGroups`, `SelectionCloseAllGroups`, `OpenCloseGroup`. Full list: Wolfram docs guide/FrontEndTokens.

## xdotool Control (Keyboard & Content Input)

### Type and Run Code

```bash
export DISPLAY=:0
WID=$(xdotool search --name "Wolfram" | head -1)
xdotool windowactivate --sync $WID
sleep 0.3

# Click to create/focus a cell
xdotool mousemove --window $WID 400 500 && xdotool click 1
sleep 0.3

# Type Wolfram Language code
xdotool type --delay 30 'Plot[Sin[x], {x, 0, 2 Pi}]'

# Run with Shift+Enter
xdotool key shift+Return
```

### Read Content via Clipboard

```bash
export DISPLAY=:0
WID=$(xdotool search --name "Wolfram" | head -1)
xdotool windowactivate --sync $WID
sleep 0.3

# Select all cells
xdotool key ctrl+a
sleep 0.2

# Copy to clipboard
xdotool key ctrl+c
sleep 0.3

# Read from clipboard
xclip -selection clipboard -o
```

This returns the full notebook content including `In[n]:=` and `Out[n]=` labels in plain text.

### Paste Complex Code

For multi-line or special-character code, use clipboard paste instead of `xdotool type`:

```bash
echo 'Plot3D[Sin[x]*Cos[y], {x, -Pi, Pi}, {y, -Pi, Pi}]' | xclip -selection clipboard
DISPLAY=:0 xdotool search --name "Wolfram" windowactivate --sync
sleep 0.3
DISPLAY=:0 xdotool key ctrl+v
sleep 0.3
DISPLAY=:0 xdotool key shift+Return
```

### Useful Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Shift+Return` | Run current cell |
| `Ctrl+Shift+Return` | Run in place (no new output cell) |
| `Alt+Return` | Create new cell below without running |
| `Ctrl+A` | Select all |
| `Ctrl+C` / `Ctrl+V` | Copy / Paste |
| `Ctrl+S` | Save notebook |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+F` | Find |
| `Ctrl+.` | Abort computation |
| `Alt+F4` | Close/Quit |

## Shutdown

### Clean Shutdown (preferred)

```bash
# Via xdotool
DISPLAY=:0 xdotool search --name "Wolfram" windowactivate --sync
DISPLAY=:0 xdotool key alt+F4
# Handle save dialog if needed
sleep 1
DISPLAY=:0 xdotool key Return  # confirm "Don't Save" or "Save"
```

### Via API (if expression server is running)

```bash
curl -s "http://127.0.0.1:8766/exec?expr=$(python3 -c "import urllib.parse; print(urllib.parse.quote('Quit[]'))")"
```

### Shut Down Expression Server Without Closing Wolfram

```bash
curl -s "http://127.0.0.1:8766/exec?expr=$(python3 -c "import urllib.parse; print(urllib.parse.quote('DeleteObject /@ SocketListeners[]'))")"
```

## wolframclient Python Library

For **headless** computation (no GUI interaction needed):

```bash
# Install
python3 -m pip install --break-system-packages wolframclient
```

```python
from wolframclient.evaluation import WolframLanguageSession
from wolframclient.language import wl, wlexpr

session = WolframLanguageSession('/usr/local/Wolfram/Wolfram/14.3/Executables/WolframKernel')
session.start()

# Run expressions
result = session.evaluate(wl.Plus(2, 3))             # 5
result = session.evaluate(wlexpr('Factor[x^4-1]'))    # (-1 + x)*(1 + x)*(1 + x^2)

session.terminate()
```

**IMPORTANT**: This spawns a **separate kernel** — it does NOT share state with any running GUI notebook. Use the HTTP API (SocketListen) for that.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `wolfram` command not found | Not in PATH | Use full path: `/usr/local/bin/wolfram` |
| Window not found by xdotool | Wrong search string | Search for "Wolfram" not "Mathematica" |
| AT-SPI shows no WolframNB app | Wolfram not running or DISPLAY not set | `export DISPLAY=:0` and check `Atspi.get_desktop(0)` |
| `SocketListen` not responding | Handler crash or port conflict | Check `ss -tlnp \| grep 8766`, restart the listener |
| `wolframclient` can't see GUI notebooks | Separate kernel | Use in-notebook `SocketListen` API instead |
| `UsingFrontEnd` doesn't affect visible window | Spawns its own frontend | Known limitation — use HTTP API or xdotool |
| Curl returns empty/timeout | Handler function signature wrong | Use the exact `SocketListen` code from this skill |
| `expr=` not parsed | URL encoding issue | Always URL-encode with `urllib.parse.quote()` |

## Critical Rules

1. **Binary is `wolfram`** — the product is now branded "Wolfram", not "Mathematica". The notebook app binary is `wolfram` (or `WolframNB`). Window titles say "Wolfram".
2. **Content is invisible to AT-SPI** — notebook cells are custom-rendered `filler` nodes. Use HTTP API or xdotool+clipboard for content.
3. **HTTP API requires setup** — `SocketListen` expression server must be started inside the notebook first. It is not built-in.
4. **`wolframclient` is a separate kernel** — it does NOT connect to the running GUI. Never assume `UsingFrontEnd` reaches the visible notebook.
5. **Always URL-encode API expressions** — use `python3 -c "import urllib.parse; print(urllib.parse.quote('...'))"` for shell usage.
6. **Port 8766 for expression server** — default port convention. Binds to `127.0.0.1` only.
7. **Shift+Enter runs cells** — not just Enter. Enter creates a new line within the same cell.
8. **Clipboard for reading** — `Ctrl+A -> Ctrl+C -> xclip -selection clipboard -o` is the most reliable way to read notebook content when the API isn't set up yet.
