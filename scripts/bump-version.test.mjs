import assert from 'node:assert/strict';
import test from 'node:test';

import { bumpWorkingCopy, readVersion } from './bump-version.mjs';

const source = (version) => `// Raised by one in scripts/bump-version.mjs on each commit after this file is in git.
export const appVersion = ${version};
`;

test('keeps the initial version until the file is committed', () => {
  const working = source(26);
  assert.equal(bumpWorkingCopy(null, working), working);
  assert.equal(readVersion(working), 26);
});

test('adds one to the version already in git', () => {
  assert.equal(readVersion(bumpWorkingCopy(source(26), source(26))), 27);
});

test('uses the committed version when the working copy was edited', () => {
  assert.equal(readVersion(bumpWorkingCopy(source(30), source(99))), 31);
});
