import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const versionFile = 'client/src/version.ts';
const versionPattern = /export const appVersion = (\d+);/;

export function readVersion(source) {
  const match = source.match(versionPattern);
  if (!match) {
    throw new Error(`appVersion was not found in ${versionFile}`);
  }
  return Number(match[1]);
}

export function bumpWorkingCopy(committedSource, workingSource) {
  if (committedSource == null) {
    readVersion(workingSource);
    return workingSource;
  }
  const next = readVersion(committedSource) + 1;
  if (!versionPattern.test(workingSource)) {
    throw new Error(`appVersion was not found in ${versionFile}`);
  }
  return workingSource.replace(versionPattern, `export const appVersion = ${next};`);
}

export function committedVersionSource() {
  try {
    return execFileSync('git', ['show', `HEAD:${versionFile}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = `${error.stderr ?? ''}`;
    if (
      stderr.includes('does not exist') ||
      stderr.includes('exists on disk') ||
      stderr.includes('invalid object name')
    ) {
      return null;
    }
    throw error;
  }
}

function bumpVersionFile() {
  const working = readFileSync(versionFile, 'utf8');
  const updated = bumpWorkingCopy(committedVersionSource(), working);
  if (updated !== working) {
    writeFileSync(versionFile, updated);
  }
  execFileSync('git', ['add', '--', versionFile], { stdio: 'inherit' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bumpVersionFile();
}
