#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.vite', '.DS_Store',
  '.turbo', '.next', 'coverage', '.cache', 'j'
]);
const CODE_EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.cjs', '.mjs', '.html'
]);

function isCommentOrBlank(line, ext) {
  const s = line.trim();
  if (!s) return true; // blank
  if (ext === '.js' || ext === '.jsx' || ext === '.ts' || ext === '.tsx' || ext === '.mjs' || ext === '.cjs') {
    return s.startsWith('//');
  }
  if (ext === '.css') {
    return s.startsWith('/*') || s.startsWith('*') || s.startsWith('*/');
  }
  if (ext === '.html') {
    return s.startsWith('<!--');
  }
  if (ext === '.json') {
    // JSON has no comments, count all non-blank lines
    return false;
  }
  return false;
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  let total = 0;
  for (const e of entries) {
    if (IGNORED_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      total += await walk(full);
    } else if (e.isFile()) {
      const ext = extname(e.name).toLowerCase();
      if (!CODE_EXTS.has(ext)) continue;
      const text = await readFile(full, 'utf8');
      const lines = text.split(/\r?\n/);
      let inBlock = false;
      let count = 0;
      for (let raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (ext === '.css') {
          // simple CSS block comment handling
          if (line.startsWith('/*')) inBlock = true;
          if (!inBlock) count++;
          if (line.endsWith('*/')) inBlock = false;
          continue;
        }
        if (ext === '.html') {
          if (line.startsWith('<!--')) inBlock = true;
          if (!inBlock) count++;
          if (line.endsWith('-->')) inBlock = false;
          continue;
        }
        // JS/TS-style
        if (line.startsWith('/*')) inBlock = true;
        if (!inBlock && !line.startsWith('//')) count++;
        if (line.endsWith('*/')) inBlock = false;
      }
      total += count;
    }
  }
  return total;
}

const root = process.cwd();
const total = await walk(root);
console.log(String(total));
