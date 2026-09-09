import { mkdir, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const toy = process.argv.includes('--toy');
const dist = path.join(root, toy ? 'dist-toy' : 'dist');
const local = process.argv.includes('--local');
if (toy && local) throw new Error('Toy builds must keep the production Cloudflare API. Use --toy without --local.');
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'assets/audio'), { recursive: true });
// Explicit allowlist: never publish the repository, database, configuration or secrets.
for (const file of ['index.html', 'style.css', 'renderer.js', 'sketch.js', 'score-history.js', 'leaderboard.js', 'toy-leaderboard.js', 'i18n.js']) {
  await copyFile(path.join(root, file), path.join(dist, file));
}
await writeFile(path.join(dist, 'locale-config.js'), `window.GROWING_TETRIS_DEFAULT_LANGUAGE = '${toy ? 'zh-CN' : 'en'}';\n`);
await writeFile(path.join(dist, 'platform-config.js'), `window.GROWING_TETRIS_LEADERBOARD = '${toy ? 'toy' : 'cloudflare'}';\n`);
if (local) {
  // Local development uses the simulated D1 database, never the public leaderboard.
  await writeFile(path.join(dist, 'leaderboard-config.js'), "window.GROWING_TETRIS_API_BASE = '';\n");
} else {
  // Preserve the Cloudflare endpoint; platform-config selects Toy rankings separately.
  await copyFile(path.join(root, 'leaderboard-config.js'), path.join(dist, 'leaderboard-config.js'));
}
for (const file of await readdir(path.join(root, 'assets/audio'))) {
  if (file.endsWith('.m4a')) await copyFile(path.join(root, 'assets/audio', file), path.join(dist, 'assets/audio', file));
}
if (!toy) await writeFile(path.join(dist, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
if (!toy) await writeFile(path.join(dist, '.nojekyll'), '');
if (toy) {
  await mkdir(path.join(dist, 'assets/toy'), { recursive: true });
  for (const file of ['cover.png', 'icon.png']) {
    await copyFile(path.join(root, 'assets/toy', file), path.join(dist, 'assets/toy', file));
  }
}
console.log(`Built ${toy ? 'Toy' : local ? 'local' : 'production'} game assets in ${path.basename(dist)}/.`);
