/**
 * Writes a session checkpoint before context compaction in long sessions.
 * Preserves mid-session state without needing observer agents.
 *
 * Hook: PreCompact
 * Cost: Zero LLM — pure command hook
 */

const fs = require('fs');
const path = require('path');
const { stdin } = process;

// Edit this path for your project
const LOG_PATH = path.join(process.cwd(), 'session-log.txt');

let input = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => { input += chunk; });
stdin.on('end', () => {
  try {
    const data = input.trim() ? JSON.parse(input) : {};
    const sessionId = process.env.CLAUDE_SESSION_ID || 'unknown';
    const timestamp = new Date().toISOString();
    const summary = data.transcript_summary || data.summary || '';

    const lines = [
      `--- CHECKPOINT ${timestamp} [${sessionId}] ---`,
      summary || '(Context compaction occurred)',
      '---',
      ''
    ];

    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_PATH, lines.join('\n'));

    console.log(JSON.stringify({
      systemMessage: 'CONTEXT COMPACTION OCCURRED — checkpoint written. Re-read thread outcome and task list before continuing.'
    }));

    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
