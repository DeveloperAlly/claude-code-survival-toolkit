/**
 * Auto-injects platform constraints when user messages mention MDX/component work.
 * Keyword-matching only, zero LLM cost.
 *
 * Hook: UserPromptSubmit
 * Cost: Zero LLM — pure command hook
 *
 * This was built for Mintlify but the pattern works for any platform with
 * non-obvious constraints. Edit the keywords and constraints for your stack.
 */

const { stdin } = process;

let input = '';
stdin.setEncoding('utf8');
stdin.on('data', (chunk) => { input += chunk; });
stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const message = (data.message || data.content || '').toLowerCase();

    // Edit these for your platform
    const signals = [
      /\.mdx/, /component/, /import.*from/, /jsx/, /snippet/,
      /frontmatter/, /accordion/, /tab.*group/, /card.*group/,
      /edit.*page/, /fix.*page/, /update.*page/, /broken.*render/,
      /hydration/, /layout.*component/,
    ];

    if (signals.some(re => re.test(message))) {
      console.log(JSON.stringify({
        systemMessage: [
          'PLATFORM CONSTRAINTS (auto-injected):',
          // Edit these for your platform
          '1. Do NOT import React or hooks — they are global',
          '2. Do NOT import built-in components (Card, Tabs, etc.) — they are global',
          '3. Custom imports MUST use absolute paths with file extension',
          '4. No dynamic JS expressions — MDX compiles at build time',
          '5. Verify every import path exists before using it',
        ].join(' | ')
      }));
    }

    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
