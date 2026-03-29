/**
 * Registers active sessions and tracks which files each session touches.
 * Warns about parallel session collisions at session start.
 *
 * Hook: SessionStart + PostToolUse (Edit|Write), async for PostToolUse
 * Cost: Zero LLM — pure command hook
 */

const fs = require('fs');
const path = require('path');
const { stdin } = process;

const REGISTRY = '/tmp/claude-session-registry';
const STALE_MS = 4 * 60 * 60 * 1000;

let input = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => { input += chunk; });
stdin.on('end', () => {
  try {
    const data = input.trim() ? JSON.parse(input) : {};
    const sessionId = process.env.CLAUDE_SESSION_ID || 'unknown';
    const now = Date.now();

    let registry = {};
    try { registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); } catch (_) {}

    for (const [sid, entry] of Object.entries(registry)) {
      if (now - entry.lastSeen > STALE_MS) delete registry[sid];
    }

    if (!registry[sessionId]) {
      registry[sessionId] = { started: new Date().toISOString(), lastSeen: now, files: [] };
    }
    registry[sessionId].lastSeen = now;

    const filePath = (data.tool_input || {}).file_path || '';
    if (filePath) {
      const files = registry[sessionId].files;
      if (!files.includes(filePath)) {
        files.push(filePath);
        if (files.length > 50) files.shift();
      }
    }

    fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2));

    if (!filePath) {
      const others = Object.entries(registry)
        .filter(([sid]) => sid !== sessionId)
        .map(([sid, entry]) => {
          const ago = Math.round((now - entry.lastSeen) / 60000);
          const recent = entry.files.slice(-5).map(f => path.basename(f)).join(', ');
          return `  ${sid.slice(0, 8)}... (${ago}m ago, ${entry.files.length} files${recent ? ': ' + recent : ''})`;
        });

      if (others.length > 0) {
        console.log(JSON.stringify({
          systemMessage: `PARALLEL SESSIONS ACTIVE (${others.length} other):\n${others.join('\n')}\nCheck for file overlap before editing.`
        }));
      }
    }

    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
