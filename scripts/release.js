'use strict';
// Publish the desktop app: `npm run release` after bumping "version" in package.json
// and pushing your commits. Creates the GitHub Release first (electron-builder's
// parallel uploads otherwise race to create it), then builds and uploads into it.
const { execFileSync } = require('child_process');
const fs = require('fs');

const version = require('../package.json').version;
const tag = `v${version}`;
const GH = fs.existsSync('C:\Program Files\GitHub CLI\gh.exe') ? 'C:\Program Files\GitHub CLI\gh.exe' : 'gh';
const gh = (...args) => execFileSync(GH, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const head = git('rev-parse', 'HEAD');
git('fetch', '-q', 'origin');
if (git('rev-parse', 'origin/main') !== head) {
  console.error('Push your commits to GitHub first (HEAD is not the same as origin/main).');
  process.exit(1);
}

try {
  gh('release', 'view', tag);
  console.log(`Release ${tag} already exists, uploading into it.`);
} catch {
  gh('release', 'create', tag, '--title', version, '--target', head, '--generate-notes');
  console.log(`Created release ${tag}.`);
}

const env = { ...process.env, GH_TOKEN: process.env.GH_TOKEN || gh('auth', 'token') };
execFileSync('npx', ['electron-builder', '--win', 'nsis', '--publish', 'always'], { stdio: 'inherit', env, shell: true });
console.log(`Done: https://github.com/TheBigVoid/prompt-vault/releases/tag/${tag}`);
