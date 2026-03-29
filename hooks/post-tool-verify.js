/**
 * Circuit breaker: tracks consecutive tool failures, stops at 3.
 *
 * Hook: PostToolUseFailure
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
    const toolName = data.tool_name || 'unknown';
    const sessionId = process.env.CLAUDE_SESSION_ID || 'default';
    const trackerPath = path.join('/tmp', `claude-circuit-breaker-${sessionId}`);

    fs.appendFileSync(trackerPath, toolName + '\n');

    const content = fs.readFileSync(trackerPath, 'utf8').trim().split('\n');
    if (content.length >= 3) {
      const last3 = content.slice(-3);
      if (new Set(last3).size === 1) {
        console.log(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PostToolUseFailure',
            additionalContext: 'CIRCUIT BREAKER: 3 consecutive failures. STOP. Root-cause analyse before retrying.'
          }
        }));
      }
    }

    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
