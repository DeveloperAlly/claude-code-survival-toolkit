#!/bin/bash
# sort-sessions.sh — Re-sort model.cache by created date (newest first)
# CLOSE VS CODE BEFORE RUNNING.
#
# IMPORTANT: Edit WSID for your machine before running.
set -euo pipefail

# === EDIT THIS FOR YOUR MACHINE ===
WSID="YOUR_WORKSPACE_STORAGE_ID_HERE"
# ==================================

STATEDB="$HOME/Library/Application Support/Code/User/workspaceStorage/$WSID/state.vscdb"
DRY_RUN="${1:-}"

if [ ! -f "$STATEDB" ]; then
    echo "[ERROR] state.vscdb not found"
    exit 1
fi

echo "=== Sort model.cache by created date (newest first) ==="

sqlite3 "$STATEDB" "SELECT value FROM ItemTable WHERE key='agentSessions.model.cache';" | python3 -c "
import sys, json
from datetime import datetime

data = json.loads(sys.stdin.read())
print(f'Total entries: {len(data)}')

claude = [e for e in data if 'claude-code' in e.get('resource', '')]
others = [e for e in data if 'claude-code' not in e.get('resource', '')]

claude.sort(key=lambda e: e.get('timing', {}).get('created', 0), reverse=True)
others.sort(key=lambda e: e.get('timing', {}).get('created', 0), reverse=True)

sorted_data = claude + others

print(f'Claude Code sessions: {len(claude)}')
print(f'Other sessions: {len(others)}')
print()
print('=== New order (first 20) ===')
for i, e in enumerate(sorted_data[:20]):
    label = e.get('label', 'NO LABEL')[:60]
    created = e.get('timing', {}).get('created', 0)
    dt = datetime.fromtimestamp(created/1000).strftime('%m-%d %H:%M') if created else 'NONE'
    print(f'  [{i:2d}] {dt} | {label}')

with open('/tmp/sorted-model-cache.json', 'w') as f:
    json.dump(sorted_data, f)
print()
print('Sorted data written to /tmp/sorted-model-cache.json')
"

if [ "$DRY_RUN" = "--dry-run" ]; then
    echo ""
    echo "[DRY RUN] Would write sorted model.cache to state.vscdb"
    echo "Run without --dry-run to apply."
else
    if pgrep -x "Code" > /dev/null 2>&1; then
        echo ""
        echo "[WARNING] VS Code is running. Changes may be overwritten."
        read -p "Continue? (y/N) " confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            echo "Aborted."
            exit 0
        fi
    fi

    sqlite3 "$STATEDB" "UPDATE ItemTable SET value=readfile('/tmp/sorted-model-cache.json') WHERE key='agentSessions.model.cache';"
    echo ""
    echo "[OK] model.cache sorted and written to state.vscdb"
fi
