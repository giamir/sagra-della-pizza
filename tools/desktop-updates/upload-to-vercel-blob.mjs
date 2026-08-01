import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { put } from '@vercel/blob';
import { pruneOldVersions } from './prune-blob-versions.mjs';

const distDir = process.argv[2] ?? 'apps/desktop/dist';
const prefix = process.env.DESKTOP_UPDATE_BLOB_PREFIX ?? 'desktop-updates';
const cacheSeconds = 60;

const contentTypes = new Map([
  ['.yml', 'application/x-yaml'],
  ['.yaml', 'application/x-yaml'],
  ['.blockmap', 'application/octet-stream'],
  ['.exe', 'application/vnd.microsoft.portable-executable'],
  ['.dmg', 'application/x-apple-diskimage'],
  ['.zip', 'application/zip']
]);

function contentTypeFor(fileName) {
  for (const [suffix, type] of contentTypes) {
    if (fileName.endsWith(suffix)) return type;
  }
  return 'application/octet-stream';
}

function shouldUpload(fileName) {
  return (
    fileName === 'latest.yml' ||
    fileName === 'latest-mac.yml' ||
    fileName === 'win7-latest.yml' ||
    fileName.endsWith('.blockmap') ||
    fileName.endsWith('.exe') ||
    fileName.endsWith('.dmg') ||
    fileName.endsWith('.zip')
  );
}

const entries = await readdir(distDir);
const files = [];

for (const entry of entries) {
  if (!shouldUpload(entry)) continue;
  const fullPath = join(distDir, entry);
  const info = await stat(fullPath);
  if (!info.isFile()) continue;
  files.push({ name: entry, path: fullPath, size: info.size });
}

if (files.length === 0) {
  throw new Error(`No update artifacts found in ${distDir}`);
}

async function uploadFileAs(file, uploadName) {
  const pathname = `${prefix}/${uploadName}`;
  const MULTIPART_THRESHOLD = 100 * 1024 * 1024;
  const body = file.size > MULTIPART_THRESHOLD
    ? createReadStream(file.path)
    : await readFile(file.path);
  const blob = await put(pathname, body, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: cacheSeconds,
    contentType: contentTypeFor(file.name),
    multipart: file.size > MULTIPART_THRESHOLD
  });

  console.log(`Uploaded ${file.name} as ${uploadName} -> ${blob.url}`);
}

for (const file of files) {
  const uploadNames = new Set([
    basename(file.name),
    basename(file.name).replaceAll(' ', '-')
  ]);

  for (const uploadName of uploadNames) {
    await uploadFileAs(file, uploadName);
  }
}

// Each release adds ~1.3 GB that nothing used to remove, so stores grew without
// bound (sagra reached 43 GB / 40 releases before the first cleanup). Prune here
// so every build leaves the store at the retention limit. Set
// DESKTOP_UPDATE_KEEP_VERSIONS=0 to skip.
const keep = Number(process.env.DESKTOP_UPDATE_KEEP_VERSIONS ?? 3);
if (Number.isInteger(keep) && keep > 0) {
  console.log(`\nPruning old releases (keeping ${keep})…`);
  try {
    await pruneOldVersions({ token: process.env.BLOB_READ_WRITE_TOKEN, keep, dryRun: false });
  } catch (err) {
    // Never fail a release because cleanup failed — the artifacts are already up.
    console.warn(`Prune skipped: ${err.message}`);
  }
} else {
  console.log('\nPruning disabled (DESKTOP_UPDATE_KEEP_VERSIONS).');
}
