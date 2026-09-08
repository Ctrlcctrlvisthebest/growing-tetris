import { mkdir, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');
const local = process.argv.includes('--local');
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'assets/audio'), { recursive: true });
// Explicit allowlist: never publish the repository, database, configuration or secrets.
for (const file of ['index.html', 'style.css', 'renderer.js', 'sketch.js', 'score-history.js', 'leaderboard.js']) {
  await copyFile(path.join(root, file), path.join(dist, file));
}
if (local) {
  // Local development uses the simulated D1 database, never the public leaderboard.
  await writeFile(path.join(dist, 'leaderboard-config.js'), "window.GROWING_TETRIS_API_BASE = '';\n");
} else {
  // GitHub Pages has no /api route: publish the explicit Cloudflare endpoint.
  await copyFile(path.join(root, 'leaderboard-config.js'), path.join(dist, 'leaderboard-config.js'));
}
for (const file of await readdir(path.join(root, 'assets/audio'))) {
  if (file.endsWith('.m4a')) await copyFile(path.join(root, 'assets/audio', file), path.join(dist, 'assets/audio', file));
}
await writeFile(path.join(dist, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
await writeFile(path.join(dist, '.nojekyll'), '');
console.log(`Built ${local ? 'local' : 'production'} game assets in dist/.`);
