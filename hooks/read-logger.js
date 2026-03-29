/**
 * Tracks which files Claude reads per session for context-gate enforcement.
 *
 * Hook: PostToolUse (Read), async
 * Cost: Zero LLM — pure command hook
 */

const fs = require('fs');
const path = require('path');
const { stdin } = process;

let input = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => { input += chunk; });
stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const filePath = (data.tool_input || {}).file_path || '';
    if (!filePath) process.exit(0);

    const sessionId = process.env.CLAUDE_SESSION_ID || 'default';
    fs.appendFileSync(path.join('/tmp', `claude-reads-${sessionId}`), filePath + '\n');
    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
