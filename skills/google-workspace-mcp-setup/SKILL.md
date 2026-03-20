---
name: google-workspace-mcp-setup
description: Set up and troubleshoot Google Workspace MCP (workspace-mcp) for Claude Code. Use when adding Google Drive/Sheets/Docs/Calendar MCP integration, fixing OAuth errors, or debugging workspace-mcp authentication issues.
user_invocable: true
---

# Google Workspace MCP Setup Skill

## Quick Setup

```bash
claude mcp add google_workspace \
  -e GOOGLE_OAUTH_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com \
  -e GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-YOUR_SECRET \
  -- uvx workspace-mcp --tools drive --single-user
```

Then restart Claude Code (`/exit` + relaunch) and call any Google Workspace tool to trigger OAuth.

## Why Custom OAuth Client is Required

The bundled OAuth client in `workspace-mcp` (`196367124860-vpc826oikj5kt6ju545e9jgg3sokhiac`) was **deleted by the maintainer** as of March 2026. You MUST create and use your own.

## Step-by-Step

### 1. Create OAuth Client

1. Go to https://console.cloud.google.com/apis/credentials
2. Create **OAuth 2.0 Client ID** (type: **Desktop**)
3. Add authorized redirect URI: `http://localhost:8000/oauth2callback`
4. Note **Client ID** and **Client Secret**
5. Enable required APIs in the same project: Google Drive API, Google Sheets API, etc.

### 2. Add MCP Server

```bash
# Drive only
claude mcp add google_workspace \
  -e GOOGLE_OAUTH_CLIENT_ID=YOUR_ID \
  -e GOOGLE_OAUTH_CLIENT_SECRET=YOUR_SECRET \
  -- uvx workspace-mcp --tools drive --single-user

# Drive + Sheets + Docs
claude mcp add google_workspace \
  -e GOOGLE_OAUTH_CLIENT_ID=YOUR_ID \
  -e GOOGLE_OAUTH_CLIENT_SECRET=YOUR_SECRET \
  -- uvx workspace-mcp --tools drive sheets docs --single-user

# Everything
claude mcp add google_workspace \
  -e GOOGLE_OAUTH_CLIENT_ID=YOUR_ID \
  -e GOOGLE_OAUTH_CLIENT_SECRET=YOUR_SECRET \
  -- uvx workspace-mcp --single-user

# Read-only mode
claude mcp add google_workspace \
  -e GOOGLE_OAUTH_CLIENT_ID=YOUR_ID \
  -e GOOGLE_OAUTH_CLIENT_SECRET=YOUR_SECRET \
  -- uvx workspace-mcp --read-only --single-user
```

### 3. Restart Claude Code

```bash
/exit
claude
```

### 4. Authenticate

On first tool call, workspace-mcp starts a callback server on `localhost:8000` and returns an auth URL.

**Server with desktop (RustDesk):**
```bash
DISPLAY=:0 microsoft-edge-stable "AUTH_URL" &>/dev/null &
```
Authorize in browser. Callback hits localhost:8000 on the same machine.

**SSH-only access:**
```bash
ssh -L 8000:127.0.0.1:8000 user@server
```
Then open auth URL in local browser.

### 5. Verify

Call any tool:
```
mcp__google_workspace__list_drive_items(user_google_email="your@gmail.com")
```

## Environment Variables

| Variable | Purpose |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Your OAuth 2.0 Client ID (REQUIRED — bundled one is dead) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Your OAuth 2.0 Client Secret |

## Credentials Storage

```
~/.google_workspace_mcp/
  credentials/
    user@gmail.com.json   # token, refresh_token, client_id, client_secret, scopes
```

## Troubleshooting

### `401: deleted_client`
Bundled OAuth client was revoked. Pass your own via `-e GOOGLE_OAUTH_CLIENT_ID=...` env vars.

### Port 8000 already in use
Another workspace-mcp instance from a different Claude Code session is holding port 8000:
```bash
ss -tlnp | grep :8000
kill <PID>
```

### `invalid_grant` / Token won't refresh
Refresh tokens are bound to the client_id that issued them. If you changed the client, delete the old token and re-auth:
```bash
rm ~/.google_workspace_mcp/credentials/your@gmail.com.json
```

### Cannot copy tokens between machines
Tokens from machine A (client X) cannot be used on machine B (client Y). Each machine needs its own OAuth flow.

### `gcloud` doesn't work for Sheets/Drive
`gcloud auth print-access-token` only supports Cloud Platform scopes, NOT Workspace scopes. Must use workspace-mcp's OAuth flow.

## REDACTED_USER's Current Setup

```bash
claude mcp add google_workspace \
  -e GOOGLE_OAUTH_CLIENT_ID=REDACTED_OAUTH_CLIENT_ID \
  -e GOOGLE_OAUTH_CLIENT_SECRET=REDACTED_OAUTH_SECRET \
  -- uvx workspace-mcp --tools drive --single-user
```
Email: `REDACTED_EMAIL`

## Available Drive Tools

| Tool | Description |
|---|---|
| `list_drive_items` | List files/folders |
| `search_drive_files` | Search by name/type |
| `get_drive_file_content` | Read content (Docs, Sheets, Office) |
| `get_drive_file_download_url` | Download/export |
| `create_drive_file` | Create files |
| `create_drive_folder` | Create folders |
| `update_drive_file` | Update metadata |
| `manage_drive_access` | Grant/revoke permissions |
| `get_drive_shareable_link` | Get sharing links |
| `copy_drive_file` | Copy files |
| `import_to_google_doc` | Import to Google Docs format |
