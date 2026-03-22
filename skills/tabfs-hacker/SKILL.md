# TabFS Hacker Skill

Use this skill when the user wants to interact with browser tabs via TabFS, extract data from web pages, automate browser actions, or hack/scrape web content using the TabFS filesystem.

## Setup

- **Mount point:** `~/TabFS/fs/mnt/`
- **Browser:** Microsoft Edge Stable
- **Extension ID:** `feeooocmaefkfcofecbajbdeomjmdpog`
- **Native messaging:** `~/.config/microsoft-edge/NativeMessagingHosts/com.rsnous.tabfs.json`
- **Detailed docs:** `~/docs/hacking/tabfs-hacks.md`

## Quick Reference

All paths relative to `~/TabFS/fs/mnt/`.

### Find a tab
```bash
ls tabs/by-title/ | grep -i keyword
# Tab ID = number after last dot in filename
```

### Read tab content
```bash
cat tabs/by-id/$TAB/url.txt      # URL
cat tabs/by-id/$TAB/title.txt    # title
cat tabs/by-id/$TAB/text.txt     # visible text (slow — FUSE call)
cat tabs/by-id/$TAB/body.html    # rendered HTML
```

### Execute JS in a tab
```bash
# Write code → read result
echo 'document.title' > tabs/by-id/$TAB/evals/test.js
cat tabs/by-id/$TAB/evals/test.js.result

# Execute in ALL frames (including iframes)
echo 'code' > tabs/by-id/$TAB/evals/test.all-frames.js
```

### Persistent watches (re-evaluate on every read)
```bash
touch tabs/by-id/$TAB/watches/'window.scrollY'
cat tabs/by-id/$TAB/watches/'window.scrollY'
```

### Tab control
```bash
echo "https://url" > tabs/create                    # new tab
echo "https://url" > tabs/by-id/$TAB/url.txt        # navigate
echo remove > tabs/by-id/$TAB/control                # close
echo reload > tabs/by-id/$TAB/control                # reload
echo duplicate > tabs/by-id/$TAB/control             # duplicate (undocumented)
echo discard > tabs/by-id/$TAB/control               # unload to save memory
echo true > tabs/by-id/$TAB/active                   # focus tab
```

### Form automation
```bash
ls tabs/by-id/$TAB/inputs/                                    # list inputs
echo "value" > tabs/by-id/$TAB/inputs/field-id.txt            # fill field
echo 'document.querySelector("form").submit()' > tabs/by-id/$TAB/evals/submit.js  # submit
echo 'document.querySelector("#btn").click()' > tabs/by-id/$TAB/evals/click.js    # click
```

### Screenshots
```bash
cp windows/last-focused/visible-tab.png ~/screenshot.png
```

### Extensions
```bash
echo false > extensions/ExtName.*/enabled   # disable
echo true > extensions/ExtName.*/enabled    # enable
```

## Data Extraction Recipes

### Cookies & storage
```bash
echo 'document.cookie' > tabs/by-id/$TAB/evals/c.js && cat tabs/by-id/$TAB/evals/c.js.result
echo 'JSON.stringify(localStorage)' > tabs/by-id/$TAB/evals/ls.js && cat tabs/by-id/$TAB/evals/ls.js.result
```

### Network requests (Performance API)
```bash
echo 'JSON.stringify(performance.getEntriesByType("resource").map(e=>({url:e.name,type:e.initiatorType,size:e.transferSize})))' \
  > tabs/by-id/$TAB/evals/net.js
cat tabs/by-id/$TAB/evals/net.js.result | python3 -m json.tool
```

### XHR/fetch interceptor
```bash
echo 'if(!window._xhrLog){window._xhrLog=[];
const _open=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){window._xhrLog.push({method:m,url:u,time:Date.now()});_open.apply(this,arguments)};
const _fetch=window.fetch;
window.fetch=function(u,o){window._xhrLog.push({method:o?.method||"GET",url:u.toString(),time:Date.now()});return _fetch.apply(this,arguments)};
"installed"}' > tabs/by-id/$TAB/evals/intercept.js

echo 'JSON.stringify(window._xhrLog)' > tabs/by-id/$TAB/evals/read_xhr.js
cat tabs/by-id/$TAB/evals/read_xhr.js.result
```

### WebSocket interception
```bash
echo 'if(!window._wsLog){window._wsLog=[];
const _WS=window.WebSocket;
window.WebSocket=function(url,protocols){
  const ws=new _WS(url,protocols);
  window._wsLog.push({url,time:Date.now(),messages:[]});
  const entry=window._wsLog[window._wsLog.length-1];
  ws.addEventListener("message",e=>entry.messages.push({dir:"in",data:e.data.toString().slice(0,500),time:Date.now()}));
  const _send=ws.send.bind(ws);
  ws.send=function(data){entry.messages.push({dir:"out",data:data.toString().slice(0,500),time:Date.now()});_send(data)};
  return ws;
};
"installed"}' > tabs/by-id/$TAB/evals/ws_intercept.js

echo 'JSON.stringify(window._wsLog)' > tabs/by-id/$TAB/evals/ws_read.js
cat tabs/by-id/$TAB/evals/ws_read.js.result
```

### Console capture
```bash
echo 'if(!window._consoleLogs){window._consoleLogs=[];
["log","warn","error","info"].forEach(m=>{
  const orig=console[m];
  console[m]=function(){window._consoleLogs.push({level:m,args:[...arguments].map(String),time:Date.now()});orig.apply(console,arguments)};
});
"hooked"}' > tabs/by-id/$TAB/evals/hook_console.js

echo 'JSON.stringify(window._consoleLogs.splice(0))' > tabs/by-id/$TAB/evals/read_console.js
cat tabs/by-id/$TAB/evals/read_console.js.result
```

### DOM mutation monitoring
```bash
echo 'if(!window._tabfsObs){window._tabfsDirty=true;
window._tabfsObs=new MutationObserver(()=>{window._tabfsDirty=true});
window._tabfsObs.observe(document.body,{childList:true,subtree:true,characterData:true});
"ok"}' > tabs/by-id/$TAB/evals/install_obs.js

# O(1) dirty check — no content read
echo 'let d=window._tabfsDirty;window._tabfsDirty=false;d' > tabs/by-id/$TAB/watches/is_dirty
cat tabs/by-id/$TAB/watches/is_dirty
```

## HLS Video Download (parallel)

```bash
# 1. Extract segment URLs via Performance API
echo 'JSON.stringify(performance.getEntriesByType("resource").filter(e=>e.name.match(/seg-.*\.ts/)).map(e=>e.name))' \
  > tabs/by-id/$TAB/evals/find_segments.js
RESULT=$(cat tabs/by-id/$TAB/evals/find_segments.js.result)

# 2. Extract base URL and segment count
BASE=$(echo "$RESULT" | grep -oP 'https://[^"]+\.mp4' | head -1)
TOTAL=$(curl -s --max-time 5 "$BASE/index-v1-a1.m3u8" | grep -c "seg-")

# 3. Parallel download
TMPDIR=$(mktemp -d) && mkdir -p "$TMPDIR/segments"
seq 1 $TOTAL | xargs -P 128 -I {} sh -c \
  "curl -s -o '$TMPDIR/segments/seg-\$(printf '%05d' {}).ts' '$BASE/seg-{}-v1-a1.ts'"

# 4. Remux
ls $TMPDIR/segments/seg-*.ts | sort | while read f; do cat "$f"; done > $TMPDIR/combined.ts
ffmpeg -i $TMPDIR/combined.ts -c copy -bsf:a aac_adtstoasc output.mp4 -y
rm -rf $TMPDIR
```

## Debugger Subsystem (Chrome/Edge only)

```bash
# Cross-origin resource reading (bypasses CORS)
ls tabs/by-id/$TAB/debugger/resources/
cat tabs/by-id/$TAB/debugger/resources/https_cdn.example.com_app.js

# Live JS hot-patching (modify running scripts without reload)
cat tabs/by-id/$TAB/debugger/scripts/42_app.js > /tmp/app.js
# edit /tmp/app.js
cat /tmp/app.js > tabs/by-id/$TAB/debugger/scripts/42_app.js
```

## Content Indexing (SQLite FTS5)

```bash
# Index all tabs
sqlite3 ~/tabfs_index.db "CREATE VIRTUAL TABLE IF NOT EXISTS tabs USING fts5(tab_id, title, url, body);"
for dir in ~/TabFS/fs/mnt/tabs/by-id/*/; do
  id=$(basename "$dir")
  sqlite3 ~/tabfs_index.db "INSERT INTO tabs VALUES('$id','$(cat "$dir/title.txt" 2>/dev/null | sed "s/'/''/g")','$(cat "$dir/url.txt" 2>/dev/null | sed "s/'/''/g")','$(cat "$dir/text.txt" 2>/dev/null | sed "s/'/''/g")');"
done

# Search
sqlite3 ~/tabfs_index.db "SELECT tab_id, title, snippet(tabs,3,'>>','<<','...',20) FROM tabs WHERE tabs MATCH 'keyword';"
```

## Key Gotchas

- **Result in separate file**: Write to `evals/foo.js`, read from `evals/foo.js.result`
- **Content script isolation**: Evals run in extension context, not page context. Some page globals aren't accessible directly
- **FUSE reads are slow**: Each `cat text.txt` = browser API call (~100ms). Use parallel reads with `xargs -P` for bulk operations
- **1-second timeout**: All FUSE operations timeout after 1s. Large pages may truncate
- **Cloudflare Turnstile**: JS clicks don't work on cross-origin iframes. Use `xdotool` for real X11 events: `export DISPLAY=:0 && xdotool mousemove X Y && xdotool click 1`
- **Session/URL expiry**: CDN keys (e.g., HLS streams) are IP-bound and time-limited. Download before they expire
