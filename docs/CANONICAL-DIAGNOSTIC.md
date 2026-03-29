# VS Code Claude Code Extension — Canonical Diagnostic

> **Single source of truth.** Supersedes all prior investigation files.
> Read this before touching anything. Every future session starts here.
>
> Last verified: 2026-03-29
> Extension version at time of writing: v2.1.86

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                VS Code Chat Sidebar                          │
│  Renders sessions in agentSessions.model.cache array order   │
└──────────────┬──────────────────────────┬────────────────────┘
               │                          │
    ┌──────────▼──────────────┐  ┌───────▼─────────────────┐
    │  agentSessions          │  │  agentSessions          │
    │  .model.cache           │  │  .state.cache            │
    │                         │  │                          │
    │  Fields:                │  │  Fields:                 │
    │  - label (sidebar title)│  │  - read (timestamp)      │
    │  - timing.created       │  │  - archived (bool)       │
    │  - timing.lastReqEnded  │  │  - resource (URI)        │
    │  - resource (URI)       │  │                          │
    │  - badge, status        │  │                          │
    │  - providerType         │  │                          │
    │  - metadata.cwd         │  │                          │
    └──────────┬──────────────┘  └───────┬──────────────────┘
               │                          │
               │    Both stored in:       │
               └────────────┬─────────────┘
                            │
                ┌───────────▼────────────────────────┐
                │  state.vscdb (SQLite)               │
                │  ItemTable: key TEXT, value BLOB     │
                │                                     │
                │  Location (workspace-specific):      │
                │  ~/Library/Application Support/      │
                │  Code/User/workspaceStorage/         │
                │  {WSID}/state.vscdb                  │
                └───────────┬────────────────────────┘
                            │
           ┌────────────────┼─────────────────┐
           │                │                  │
  ┌────────▼─────────┐ ┌───▼──────────┐ ┌────▼──────────────┐
  │ claude-code:/     │ │ vscode-chat  │ │ openai-codex://    │
  │ sessions          │ │ sessions     │ │ sessions           │
  │                   │ │              │ │                    │
  │ Stored at:        │ │ Stored at:   │ │                    │
  │ ~/.claude/        │ │ chatSessions/│ │                    │
  │ projects/...      │ │ *.jsonl|json │ │                    │
  │ /*.jsonl          │ │              │ │                    │
  └───────────────────┘ └──────────────┘ └────────────────────┘
```

### Three session providers

| Provider | URI scheme | Storage |
|---|---|---|
| Claude Code | `claude-code:/UUID` | `~/.claude/projects/{workspace-hash}/*.jsonl` |
| Copilot Chat | `vscode-chat-session://local/BASE64` | `chatSessions/*.jsonl\|json` in workspace storage |
| OpenAI Codex | `openai-codex://route/local/UUID` | Unknown |

### JSONL file structure (Claude Code sessions)

Session files are append-only JSONL. Key entry types:
```
{"type": "queue-operation", "operation": "enqueue", "timestamp": "...", "sessionId": "..."}
{"type": "user", ...}           — user messages
{"type": "text", ...}           — assistant responses
{"type": "custom-title", "customTitle": "...", "sessionId": "..."}  — user-set title
{"type": "ai-title", "aiTitle": "...", "sessionId": "..."}         — auto-generated title
{"type": "summary", "title": "...", "summary": "..."}
{"type": "last-prompt", ...}    — last user prompt
```

**Title resolution priority:** custom-title > ai-title > UUID fallback

### Key state database keys

| Key | What |
|---|---|
| `agentSessions.model.cache` | Session metadata array (labels, timing, resources) — **controls sidebar** |
| `agentSessions.state.cache` | Read timestamps and archived flags |
| `chat.ChatSessionStore.index` | Copilot Chat session metadata |
| `agentSessions.readDateBaseline2` | Baseline timestamp for read status |

---

## 12 Confirmed Root Causes

### Critical severity

| # | Cause | Detail | GitHub issues |
|---|---|---|---|
| 1 | `sessions-index.json` not written | Extension stopped writing session index around v2.1.31. Without it, session discovery relies on filesystem scan. | #26123, #24729, #18619, #29331 |
| 2 | 64KB head/tail buffer truncation | `fetchSessions()` reads only first/last 64KB of each JSONL. Sessions >128KB have title data outside this window and are silently dropped. | #35085 |
| 5 | CLI deletes session files on update | Auto-updates delete JSONL files. Irrecoverable data loss. | #36272 |
| 9 | `deserializeWebviewPanel` passes void 0 | When restoring tabs after crash, session ID is lost. Panel shows blank. | #35022 |
| 11 | `state.cache` wiped to [] on crash | After VS Code crash, `agentSessions.state.cache` contains zero claude-code entries. Extension can list but not load sessions. | Recovery report |

### High severity

| # | Cause | Detail | GitHub issues |
|---|---|---|---|
| 3 | Cross-project cache contamination | Cache is global, not per-project. Opening a different workspace can contaminate session list. | #22215 |
| 6 | No sort in broadcastSessionStates() | Sessions broadcast as `Array.from(this.sessionStates.values())` — Map insertion order, not chronological. | Verified in extension.js |
| 7 | hiddenSessionIds in-memory overwrite | Extension loads hidden list into memory on startup. External DB changes are overwritten when extension writes back. | Verified in extension.js |
| 10 | 600-second webview timeout | Webview discards session IDs after 600s timeout. | #35005 |
| 12 | Bulk timestamp stamping on load | On every load, extension batch-stamps `lastRequestEnded` on all sessions. Destroys any time-based ordering. | Verified in model.cache |

### Medium severity

| # | Cause | Detail |
|---|---|---|
| 4 | macOS file permissions | Dirs created 0700, extension may run as different user. |
| 8 | Title resolution garbage fallback | Falls back to ai-title (garbage like `<ide_selection>The user selected lines 70-71`) or raw UUID. |

---

## Hackable Paths (quick reference)

### Find your workspace storage ID
```bash
# List all workspace storages
ls ~/Library/Application\ Support/Code/User/workspaceStorage/

# Find which one has Claude sessions
for d in ~/Library/Application\ Support/Code/User/workspaceStorage/*/; do
  if sqlite3 "$d/state.vscdb" "SELECT 1 FROM ItemTable WHERE key='agentSessions.model.cache' LIMIT 1;" 2>/dev/null; then
    echo "FOUND: $d"
  fi
done
```

### Read current state
```bash
WSID="YOUR_ID_HERE"
STATEDB="$HOME/Library/Application Support/Code/User/workspaceStorage/$WSID/state.vscdb"
GLOBALDB="$HOME/Library/Application Support/Code/User/globalStorage/state.vscdb"

# model.cache (sidebar metadata)
sqlite3 "$STATEDB" "SELECT value FROM ItemTable WHERE key='agentSessions.model.cache';" | python3 -m json.tool

# state.cache (read timestamps, archived)
sqlite3 "$STATEDB" "SELECT value FROM ItemTable WHERE key='agentSessions.state.cache';" | python3 -m json.tool

# hiddenSessionIds
sqlite3 "$GLOBALDB" "SELECT value FROM ItemTable WHERE key='Anthropic.claude-code';" | python3 -m json.tool
```

### Modify state (close VS Code first)
```bash
# Re-sort model.cache by created date (newest first)
sqlite3 "$STATEDB" "SELECT value FROM ItemTable WHERE key='agentSessions.model.cache';" | \
  python3 -c "import sys,json; d=json.loads(sys.stdin.read()); d.sort(key=lambda e: e.get('timing',{}).get('created',0), reverse=True); print(json.dumps(d))" | \
  python3 -c "import sys; open('/tmp/mc.json','w').write(sys.stdin.read())"
sqlite3 "$STATEDB" "UPDATE ItemTable SET value=readfile('/tmp/mc.json') WHERE key='agentSessions.model.cache';"

# Clear hidden session IDs
sqlite3 "$GLOBALDB" "UPDATE ItemTable SET value=json_set(value, '$.hiddenSessionIds', json('[]')) WHERE key='Anthropic.claude-code';"
```

---

## Related GitHub Issues

| Issue | Title | Status | Root cause # |
|---|---|---|---|
| #9258 | History Sessions lost (original Oct 2025) | Open | Multiple |
| #12872 | Past conversations not loaded after restart (macOS) | Open | 4 |
| #18619 | sessions-index.json not written | Open | 1 |
| #22215 | Past conversations not showing despite valid index | Open | 3 |
| #24172 | CRITICAL: Conversations disappear when closing VSCode | Open | 11 |
| #24729 | sessions-index.json not indexed since v2.1.31 | Open | 1 |
| #26123 | Consolidated: 3 root causes identified | Closed (still broken) | 1, 2, 3 |
| #28577 | Session resume loads blank (4.5MB file intact) | Open | 2, 9 |
| #29331 | sessions-index.json severely out of sync | Open | 1 |
| #29736 | Chat history lost when dragging tab to new window | Open | 11 |
| #33165 | Title eviction family (~20 bugs from same root cause) | Open | 8 |
| #35005 | 600-second webview timeout discards session IDs | Open | 10 |
| #35022 | deserializeWebviewPanel passes void 0 | Open | 9 |
| #35085 | fetchSessions() silently drops large sessions | Open | 2 |
| #36272 | CLI silently deletes session files during updates | Open, data-loss | 5 |
| #38691 | All sessions lost after Claude Desktop update | Open | 5 |
| #39136 | Session name, color, and index lost after reboot | Open | 8, 11 |

---

_Maintained by: [@DeveloperAlly](https://github.com/DeveloperAlly). Open issues or PRs to update._
