import fs from 'node:fs/promises';
import path from 'node:path';

export const rootDir = process.cwd();
export const runsDir = path.join(rootDir, 'runs');
export const uploadsDir = path.join(rootDir, 'uploads');

export async function ensureStorage() {
  await fs.mkdir(runsDir, { recursive: true });
  await fs.mkdir(uploadsDir, { recursive: true });
}

export function runDir(runId) {
  return path.join(runsDir, runId);
}

export function publicAssetPath(filePath) {
  if (!filePath) return undefined;
  const relative = path.relative(rootDir, filePath).replaceAll('\\', '/');
  return `/assets/${relative}`;
}
