/**
 * Detects repeated empty Grep results and fires a circuit-breaker warning.
 * Resets on successful results.
 *
 * Hook: PostToolUse (Grep)
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
    if ((data.tool_name || '') !== 'Grep') process.exit(0);

    const sessionId = process.env.CLAUDE_SESSION_ID || 'default';
    const trackerPath = path.join('/tmp', `claude-grep-loop-${sessionId}`);

    const result = data.tool_response || data.tool_result || '';
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    const isEmpty = !resultStr || resultStr.trim() === '' || /no matches found/i.test(resultStr);

    if (isEmpty) {
      let count = 0;
      try { count = parseInt(fs.readFileSync(trackerPath, 'utf8').trim(), 10) || 0; } catch (_) {}
      count += 1;
      fs.writeFileSync(trackerPath, String(count));

      if (count >= 3) {
        console.log(JSON.stringify({
          systemMessage: `SEARCH LOOP WARNING: ${count} consecutive empty Grep calls. STOP and change approach.`
        }));
      }
    } else {
      try { fs.unlinkSync(trackerPath); } catch (_) {}
    }

    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
