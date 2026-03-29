/**
 * Pre-tool enforcement for Claude Code sessions.
 * Blocks destructive git, warns template vs page, cross-session collision detection,
 * read-before-write gate, broader context warnings.
 *
 * Hook: PreToolUse (Bash, Write|Edit)
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
    const toolName = data.tool_name || '';
    const toolInput = data.tool_input || {};

    // --- BASH COMMANDS ---
    if (toolName === 'Bash') {
      const cmd = toolInput.command || '';

      if (/git\s+checkout\s+-b/.test(cmd)) {
        process.exit(0);
      }

      if (/git\s+(checkout|clean|reset\s+--hard|push\s+--force|push\s+-f|branch\s+-D)/.test(cmd)) {
        console.log(JSON.stringify({
          decision: 'block',
          reason: 'BLOCKED: Destructive git command. Run manually if needed.'
        }));
        process.exit(2);
      }

      if (/gh\s+(issue|pr)\s+(create|comment|edit)/i.test(cmd) ||
          /curl.*(api\.github|hooks\.slack)/i.test(cmd)) {
        console.log(JSON.stringify({
          decision: 'block',
          reason: 'BLOCKED: This command posts to a public service. Review content first.'
        }));
        process.exit(2);
      }
    }

    // --- WRITE/EDIT: context gate ---
    if ((toolName === 'Write' || toolName === 'Edit') && toolInput.file_path) {
      const fp = toolInput.file_path;
      const sessionId = process.env.CLAUDE_SESSION_ID || 'default';
      const readLogPath = path.join('/tmp', `claude-reads-${sessionId}`);

      let readFiles = [];
      try {
        readFiles = fs.readFileSync(readLogPath, 'utf8').trim().split('\n').filter(Boolean);
      } catch (_) {}

      const targetRead = readFiles.some(f => f === fp);
      const targetDir = path.dirname(fp);
      const siblingReads = readFiles.filter(f => f !== fp && path.dirname(f) === targetDir);
      const totalDistinctReads = new Set(readFiles).size;

      // Cross-session collision check
      try {
        const reg = JSON.parse(fs.readFileSync('/tmp/claude-session-registry', 'utf8'));
        const otherSessions = Object.entries(reg)
          .filter(([sid]) => sid !== sessionId)
          .filter(([, entry]) => Date.now() - entry.lastSeen < 4 * 60 * 60 * 1000);
        for (const [sid, entry] of otherSessions) {
          if (entry.files && entry.files.includes(fp)) {
            const ago = Math.round((Date.now() - entry.lastSeen) / 60000);
            console.log(JSON.stringify({
              systemMessage: `COLLISION WARNING: Another session (${sid.slice(0, 8)}..., active ${ago}m ago) has edited this same file.`
            }));
            break;
          }
        }
      } catch (_) {}

      if (!targetRead && !/session-log\.txt/.test(fp) && !/\.json$/.test(fp)) {
        console.log(JSON.stringify({
          systemMessage: 'CONTEXT GATE: You are editing a file you have not Read in this session. Read it first.'
        }));
      }

      if (targetRead && siblingReads.length === 0 && totalDistinctReads <= 2 &&
          !/session-log\.txt/.test(fp) && !/settings\.json/.test(fp)) {
        console.log(JSON.stringify({
          systemMessage: 'CONTEXT WARNING: You have only read the target file. Check broader context before editing.'
        }));
      }
    }

    // --- BASH: file move stale ref reminder ---
    if (toolName === 'Bash') {
      const cmd = toolInput.command || '';
      if (/git\s+mv|mv\s+/.test(cmd) || /rename/i.test(cmd)) {
        console.log(JSON.stringify({
          systemMessage: 'File move detected. Scan all file types for stale references after completing moves.'
        }));
      }
    }

    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
