#!/usr/bin/env node
// Activate a tenant: copy tenants/<slug>/ over the "active" files that both the
// web app and the desktop app import directly. Run before building/deploying for
// a given association, e.g. `npm run use-tenant orentano`.
//
// Overlay layout (tenants/<slug>/):
//   tenant.json        -> shared/src/config/tenant.json
//   menu.json          -> shared/src/data/menu.json
//   assets/*           -> static/*                    (web logo + PWA icons + favicon)
//   desktop/*          -> apps/desktop/resources/*    (app icon.ico/.icns + runtime logo.png)
import { cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: npm run use-tenant <slug>   (e.g. orentano)');
  process.exit(1);
}

const overlay = join(repoRoot, 'tenants', slug);
if (!existsSync(overlay)) {
  const available = existsSync(join(repoRoot, 'tenants'))
    ? readdirSync(join(repoRoot, 'tenants')).join(', ')
    : '(none)';
  console.error(`Unknown tenant "${slug}". Available: ${available}`);
  process.exit(1);
}

const copies = [
  ['tenant.json', 'shared/src/config/tenant.json'],
  ['menu.json', 'shared/src/data/menu.json']
];

for (const [from, to] of copies) {
  const src = join(overlay, from);
  if (!existsSync(src)) {
    console.error(`Missing ${join('tenants', slug, from)} — cannot activate.`);
    process.exit(1);
  }
  cpSync(src, join(repoRoot, to));
  console.log(`  ${from} -> ${to}`);
}

function copyDir(fromDir, toDir, label) {
  if (!existsSync(fromDir)) return;
  for (const name of readdirSync(fromDir)) {
    const src = join(fromDir, name);
    if (!statSync(src).isFile()) continue;
    cpSync(src, join(toDir, name));
    console.log(`  ${label}/${name} -> ${toDir.replace(repoRoot + '/', '')}/${name}`);
  }
}

copyDir(join(overlay, 'assets'), join(repoRoot, 'static'), 'assets');
copyDir(join(overlay, 'desktop'), join(repoRoot, 'apps/desktop/resources'), 'desktop');

console.log(`\nActivated tenant "${slug}".`);
