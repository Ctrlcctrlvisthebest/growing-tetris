import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('..', import.meta.url));

test('GitHub and Toy ship identical gameplay, moderation and translations with different language defaults', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'growing-tetris-build-'));
  const shared = ['index.html', 'style.css', 'renderer.js', 'sketch.js', 'score-history.js', 'leaderboard.js', 'leaderboard-config.js', 'i18n.js'];
  try {
    await mkdir(path.join(temp, 'scripts'));
    for (const file of [...shared, 'scripts/build.mjs', 'assets']) await cp(path.join(root, file), path.join(temp, file), { recursive: true });
    execFileSync(process.execPath, [path.join(temp, 'scripts/build.mjs')]);
    execFileSync(process.execPath, [path.join(temp, 'scripts/build.mjs'), '--toy']);
    for (const file of shared) assert.deepEqual(await readFile(path.join(temp, 'dist', file)), await readFile(path.join(temp, 'dist-toy', file)), file);
    assert.match(await readFile(path.join(temp, 'dist/locale-config.js'), 'utf8'), /'en'/);
    assert.match(await readFile(path.join(temp, 'dist-toy/locale-config.js'), 'utf8'), /'zh-CN'/);
    assert.match(await readFile(path.join(temp, 'dist-toy/leaderboard-config.js'), 'utf8'), /growing-tetris-leaderboard\.zoeli2010xl\.workers\.dev/);
    assert.throws(() => execFileSync(process.execPath, [path.join(temp, 'scripts/build.mjs'), '--toy', '--local'], { stdio: 'pipe' }));
  } finally { await rm(temp, { recursive: true, force: true }); }
});
