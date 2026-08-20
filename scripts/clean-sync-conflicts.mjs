#!/usr/bin/env node
/**
 * Removes the duplicate files a file-sync client (iCloud Drive, Dropbox) leaves
 * behind when it resolves a conflict — "cache-life.d 2.ts" and friends.
 *
 * They land inside .next/types, which tsconfig includes, and every one of them
 * produces a duplicate-identifier error. Deleting them is safe: they are copies
 * of generated files.
 */
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ROOTS = ['.next', 'src', 'tests', 'prisma', 'scripts'];
const CONFLICT = / \d+\.[a-z]+$/;

let removed = 0;

async function walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (CONFLICT.test(entry.name)) {
      await rm(path, { force: true });
      removed += 1;
    }
  }
}

for (const root of ROOTS) {
  if (await stat(root).catch(() => null)) await walk(root);
}

if (removed > 0) console.log(`Removed ${removed} sync-conflict file(s).`);
