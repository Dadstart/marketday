import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const marker = 'scripts/bump-version.mjs';

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const root = repoRoot();
if (!root) {
  process.exit(0);
}

const hookPath = join(root, '.git', 'hooks', 'pre-commit');
const command = `node ${marker}\n`;
if (!existsSync(hookPath)) {
  writeFileSync(hookPath, `#!/bin/sh\n${command}`, { mode: 0o755 });
} else {
  const current = readFileSync(hookPath, 'utf8');
  if (!current.includes(marker)) {
    writeFileSync(hookPath, `${current.endsWith('\n') ? current : `${current}\n`}${command}`);
  }
}
