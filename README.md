# Claude Code Survival Toolkit

> Community repair toolkit for the Claude Code VS Code extension. 12 confirmed root causes, 9 fix scripts, 7 governance hooks.
>
> Built from 320 sessions of pain by [@DeveloperAlly](https://github.com/DeveloperAlly). Co-written with Claude Code (the product being complained about).

## Why this exists

82 open `data-loss` issues on [anthropics/claude-code](https://github.com/anthropics/claude-code). 50+ session management issues. Zero Anthropic staff responses. Zero. The bot closes duplicates, fragmenting engagement below triage thresholds. Enterprise users report this is blocking adoption.

So here's everything I've found, built, and verified across 3 weeks of production use. Take what you need. Contribute what you've found.

## What's in here

### Extension fix scripts (`scripts/`)

Bash scripts for macOS. Should be adaptable to Linux/Windows.

| Script | What it does | When to run |
|--------|-------------|-------------|
| `patch-extension.sh` | Patches `fetchSessions()` buffer from 64KB to 512KB. Auto-finds active extension version. | **After every extension update** |
| `recover-dropped-sessions.sh` | Finds sessions on disk missing from sidebar, injects into cache | When sessions disappear |
| `fix-titles.sh` | Resolves UUID-only labels from JSONL `custom-title` entries | When titles show as UUIDs |
| `fix-title-overwrite.sh` | Detects `last-prompt` pushing `custom-title` outside tail window, re-appends | Run on 2-min timer (launchd/cron) |
| `sort-sessions.sh` | Re-sorts model.cache by created date | After sidebar gets scrambled |
| `backup-vscode-state.sh` | Snapshots state.vscdb + exports model.cache/state.cache as JSON | On cron (every 30 min recommended) |
| `restore-vscode-state.sh` | Restores from backup (lists available, picks latest or specified) | After data loss |
| `full-repair.sh` | Runs all above in sequence | When everything is broken |
| `com.alison.claude-backup.plist` | macOS launchd agent for automated 30-minute backups | Install once |

**Important:** Close VS Code before running scripts that write to `state.vscdb`. The extension holds state in memory and will overwrite your changes.

### Governance hooks (`hooks/`)

Claude Code hook scripts that mechanically enforce safety rules. Zero LLM cost. These fire automatically on every tool use.

| Hook | Event | What it does |
|------|-------|-------------|
| `pre-tool-guard.js` | PreToolUse (Bash, Edit, Write) | Blocks destructive git, warns template vs page, cross-session collision detection, read-before-write gate |
| `read-logger.js` | PostToolUse (Read) | Tracks which files Claude reads per session (feeds the context gate) |
| `session-register.js` | SessionStart + PostToolUse (Edit/Write) | Shared registry of active sessions and file claims. Warns about parallel session collisions. |
| `grep-loop-guard.js` | PostToolUse (Grep) | Detects 3+ consecutive empty searches, forces approach change |
| `post-tool-verify.js` | PostToolUseFailure | Circuit breaker: stops Claude after 3 consecutive failures of same tool |
| `pre-compact-checkpoint.js` | PreCompact | Writes structured checkpoint to session log before context compaction |
| `mdx-constraints-injector.js` | UserPromptSubmit | Keyword-matches for MDX/component work, auto-injects platform constraints |

### Documentation

| File | What |
|------|------|
| `docs/CANONICAL-DIAGNOSTIC.md` | Full architecture diagram, all 12 root causes with evidence, hackable paths, script reference |
| `docs/COMMUNITY-RESEARCH.md` | 82 data-loss issues catalogued, community workarounds, third-party tools, Anthropic engagement (zero) |
| `docs/settings-example.json` | Example `.claude/settings.json` with all hooks wired |

## Quick start

### 1. Prevent auto-deletion (do this NOW)

```json
// Add to ~/.claude/settings.json
{ "cleanupPeriodDays": 99999 }
```

### 2. Patch the buffer

```bash
chmod +x scripts/*.sh
./scripts/patch-extension.sh --dry-run  # Review first
./scripts/patch-extension.sh            # Apply
# Restart VS Code
```

### 3. Set up automated backups

```bash
# Edit the plist to update paths for your machine
cp scripts/com.alison.claude-backup.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.alison.claude-backup.plist
```

### 4. Install hooks (optional)

Copy the hook scripts to your project and wire them in `.claude/settings.json`. See `docs/settings-example.json` for the full configuration.

## The 12 root causes

| # | Cause | Severity |
|---|-------|----------|
| 1 | `sessions-index.json` stopped being written (~v2.1.31) | Critical |
| 2 | `fetchSessions()` 64KB head/tail buffer silently drops large sessions | Critical |
| 3 | Cross-project cache contamination (global, not per-project) | High |
| 4 | macOS file permissions (dirs created 0700) | Medium |
| 5 | CLI deletes session files on auto-update | Critical |
| 6 | No sort in `broadcastSessionStates()` — Map insertion order | High |
| 7 | `hiddenSessionIds` in-memory overwrite | High |
| 8 | Title resolution garbage fallback (`<ide_selection>...` or UUID) | Medium |
| 9 | `deserializeWebviewPanel` passes `void 0` instead of `state?.sessionId` | Critical |
| 10 | 600-second webview timeout discards session IDs | High |
| 11 | `state.cache` wiped to `[]` on crash | Critical |
| 12 | Bulk `lastRequestEnded` timestamp stamping on every load | High |

Full details with evidence and related GitHub issues: [CANONICAL-DIAGNOSTIC.md](docs/CANONICAL-DIAGNOSTIC.md)

## What I still can't fix

- **Bulk timestamp reset on load** (root cause #12) — no user-side fix. Every restart scrambles your sidebar.
- **No folders, no custom ordering, no pinning** — the sidebar is a flat list sorted by a timestamp that gets destroyed on every load.
- **Patches die on every extension update** — `patch-extension.sh` must be re-run manually.
- **`sessions-index.json` not written** — needs an Anthropic code change.

## Community tools I've tested

| Tool | Verdict |
|------|---------|
| [agsoft.claude-history-viewer](https://marketplace.visualstudio.com/items?itemName=agsoft.claude-history-viewer) | Useful for browsing, doesn't fix ordering |
| [ccmanager](https://github.com/kbwo/ccmanager) | Terminal TUI, bypasses broken sidebar entirely |
| [mcp-claude-context-continuity](https://github.com/tethiro/mcp-claude-context-continuity) | MCP server for cross-session context, no conflict with hooks |
| [Cozempic](https://github.com/Ruya-AI/cozempic) | Defers compaction, bypasses broken index |

## How to contribute

- **Found a better workaround?** Open an issue or PR.
- **Have a fix for the timestamp reset?** I will name my next pet after you.
- **Adapted scripts for Linux/Windows?** Please PR them.
- **Found root cause #13?** Add it to the diagnostic.
- **Think I'm doing something wrong?** Tell me. Seriously. I built this under duress and I want to know if there are better approaches.

## Related issues

- [#9258](https://github.com/anthropics/claude-code/issues/9258) — Original session loss report (Oct 2025)
- [#18619](https://github.com/anthropics/claude-code/issues/18619) — sessions-index.json not written
- [#24172](https://github.com/anthropics/claude-code/issues/24172) — Conversations disappear on close
- [#35085](https://github.com/anthropics/claude-code/issues/35085) — fetchSessions 64KB buffer
- [#36272](https://github.com/anthropics/claude-code/issues/36272) — CLI deletes files on update
- [#32150](https://github.com/anthropics/claude-code/issues/32150) — Title eviction (community root cause analysis)

Full list of 50+ related issues: [COMMUNITY-RESEARCH.md](docs/COMMUNITY-RESEARCH.md)

## Disclaimer

This toolkit was co-built with Claude Code. The irony is noted. The scripts modify VS Code's internal state database — use at your own risk and always run `--dry-run` first. Back up before doing anything.

---

*Built by [@DeveloperAlly](https://github.com/DeveloperAlly) (Alison Haire). Maintained with spite and determination.*
