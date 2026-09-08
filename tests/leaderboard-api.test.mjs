import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../server/worker.mjs';

function createEnvironment() {
  const database = new DatabaseSync(':memory:');
  database.exec(readFileSync(new URL('../migrations/0001_scores.sql', import.meta.url), 'utf8'));
  function prepare(sql, args = []) {
    return {
      bind: (...values) => prepare(sql, values),
      all: async () => ({ results: database.prepare(sql).all(...args) }),
      run: async () => database.prepare(sql).run(...args),
      first: async () => database.prepare(sql).get(...args) || null,
    };
  }
  return {
    DB: { prepare }, SCORE_LIMITER: { limit: async () => ({ success: true }) },
    ALLOWED_ORIGINS: 'http://localhost:8876', ASSETS: { fetch: async () => new Response('game') },
    close: () => database.close(),
  };
}

const score = (id, points, mode = 'normal') => ({ runId: `test-run-${id}`, playerName: `Player ${id}`, score: points, mode });
const post = (env, data, headers = {}) => worker.fetch(new Request('https://game.example/api/scores', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data),
}), env);
const get = (env, mode = 'all') => worker.fetch(new Request(`https://game.example/api/leaderboard?mode=${mode}`), env);

test('Toy iframe and original website share cross-origin score submission and rankings', async (t) => {
  const env = createEnvironment(); t.after(env.close);
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  env.ALLOWED_ORIGINS = config.vars.ALLOWED_ORIGINS;
  const origins = ['https://www.bilibilitoy.com', 'https://ctrlcctrlvisthebest.github.io'];
  for (const [index, origin] of origins.entries()) {
    const response = await worker.fetch(new Request('https://game.example/api/scores', {
      method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    }), env);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.match(response.headers.get('access-control-allow-methods'), /POST/);
    assert.match(response.headers.get('access-control-allow-headers'), /Content-Type/i);
    assert.equal((await post(env, score(`site-${index}`, 100 + index), { Origin: origin })).status, 200);
  }
  for (const origin of origins) {
    const response = await worker.fetch(new Request('https://game.example/api/leaderboard', { headers: { Origin: origin } }), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('vary'), 'Origin');
    assert.deepEqual((await response.json()).entries.map(entry => entry.score), [101, 100]);
  }
  for (const origin of ['https://www.bilibilitoy.com.evil.example', 'https://unrelated.example', 'null']) {
    const response = await worker.fetch(new Request('https://game.example/api/scores', { method: 'OPTIONS', headers: { Origin: origin } }), env);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
});

test('independent players share one persisted top three; mode filters and ties are stable', async (t) => {
  const env = createEnvironment(); t.after(env.close);
  for (const payload of [score('a', 300), score('b', 1200, 'hard'), score('c', 900), score('d', 700)]) {
    assert.equal((await post(env, payload)).status, 200);
  }
  let result = await (await get(env)).json();
  assert.deepEqual(result.entries.map((entry) => entry.score), [1200, 900, 700]);
  assert.deepEqual(result.entries.map((entry) => entry.rank), [1, 2, 3]);
  assert.equal(result.entries[0].playerName, 'Player b');
  assert.equal((await (await get(env, 'hard')).json()).entries.length, 1);
  assert.deepEqual((await (await get(env, 'normal')).json()).entries.map((entry) => entry.score), [900, 700, 300]);
  await post(env, score('e', 1200));
  result = await (await get(env)).json();
  assert.deepEqual(result.entries.slice(0, 2).map((entry) => entry.playerName), ['Player b', 'Player e']);
  assert.equal((await get(env, 'invalid')).status, 400);
});

test('retrying the same game is idempotent and cannot overwrite its score', async (t) => {
  const env = createEnvironment(); t.after(env.close);
  const payload = score('retry', 100);
  assert.equal((await post(env, payload)).status, 200);
  assert.equal((await post(env, payload)).status, 200);
  assert.equal((await post(env, { ...payload, score: 999 })).status, 409);
  const entries = (await (await get(env)).json()).entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].score, 100);
});

test('rejects malformed payloads, oversized streams and disallowed origins', async (t) => {
  const env = createEnvironment(); t.after(env.close);
  for (const data of [null, {}, { ...score('bad', 2), score: -1 }, { ...score('bad', 2), score: 1.5 },
    { ...score('bad', 2), score: 10000001 }, { ...score('bad', 2), playerName: 'a'.repeat(25) },
    { ...score('bad', 2), playerName: 'a\nb' }, { ...score('bad', 2), mode: 'unknown' }]) {
    assert.equal((await post(env, data)).status, 400);
  }
  assert.equal((await post(env, score('origin', 1), { Origin: 'https://unrelated.example' })).status, 403);
  const allowed = await post(env, score('allowed', 1), { Origin: 'http://localhost:8876' });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:8876');
  const oversized = new Request('https://game.example/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'a'.repeat(3000) });
  assert.equal((await worker.fetch(oversized, env)).status, 413);
  const wrongType = new Request('https://game.example/api/scores', { method: 'POST', body: '{}' });
  assert.equal((await worker.fetch(wrongType, env)).status, 415);
});

test('rate limits submissions and isolates database failures from static gameplay', async (t) => {
  const env = createEnvironment(); t.after(env.close);
  env.SCORE_LIMITER.limit = async () => ({ success: false });
  const response = await post(env, score('rate', 10));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  env.DB.prepare = () => { throw new Error('private database detail'); };
  const unavailable = await get(env);
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /private database detail/);
  assert.equal(await (await worker.fetch(new Request('https://game.example/'), env)).text(), 'game');
});

const checkNickname = (env, playerName) => worker.fetch(new Request('https://game.example/api/nickname/check', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8876' },
  body: JSON.stringify({ playerName }),
}), env);

test('nickname review handles obfuscation and blocks direct API bypass before storing a score', async (t) => {
  const env = createEnvironment(); t.after(env.close);
  for (const name of ['习近平', '習 近 平', '习\u200b近\u200d平', 'ＸＩ－ＪＩＮ－ＰＩＮＧ', 'xí jìn píng', 'хijinping', '台 灣 獨 立']) {
    const review = await checkNickname(env, name);
    assert.equal(review.status, 200);
    assert.equal(review.headers.get('access-control-allow-origin'), 'http://localhost:8876');
    assert.equal((await review.json()).allowed, false, name);
    const rejected = await post(env, { ...score('blocked', 999), playerName: name });
    assert.equal(rejected.status, 422, name);
    assert.equal((await rejected.json()).code, 'nickname_not_allowed');
  }
  assert.deepEqual((await (await get(env)).json()).entries, []);
});

test('safe nicknames remain available and canonical names round-trip on the shared leaderboard', async (t) => {
  const env = createEnvironment(); t.after(env.close);
  for (const name of ['Alice', '方块玩家64', 'GrapePlayer', '小习同学', '陈同学', 'Player 🎮']) {
    assert.equal((await (await checkNickname(env, name)).json()).allowed, true, name);
  }
  const reviewed = await (await checkNickname(env, 'Ｔｅｔｒｉｓ')).json();
  assert.equal(reviewed.name, 'Tetris');
  const data = { ...score('normalized', 120), playerName: reviewed.name };
  assert.equal((await post(env, data)).status, 200);
  assert.equal((await post(env, data)).status, 200);
  assert.equal((await (await get(env)).json()).entries[0].playerName, 'Tetris');
  for (const invalid of ['', 'a'.repeat(25), '\u200b', 'abc\u0000', 123, null]) {
    assert.equal((await (await checkNickname(env, invalid)).json()).allowed, false);
  }
});

test('new moderation rules mask old public nicknames without deleting scores', async (t) => {
  const env = createEnvironment(); t.after(env.close);
  await post(env, { ...score('legacy', 100), playerName: 'TestCustomTerm' });
  env.NICKNAME_BLOCKLIST = 'TestCustomTerm\nAnotherTerm';
  assert.equal((await (await checkNickname(env, 'Test Custom Term')).json()).allowed, false);
  assert.equal((await post(env, { ...score('newblocked', 90), playerName: 'AnotherTerm' })).status, 422);
  const entries = (await (await get(env)).json()).entries;
  assert.equal(entries[0].playerName, 'Player');
  assert.equal(entries[0].score, 100);
  const stored = await env.DB.prepare('SELECT player_name FROM scores WHERE run_id = ?').bind('test-run-legacy').first();
  assert.equal(stored.player_name, 'TestCustomTerm');
});

test('nickname endpoint uses bounded JSON and a separate rate-limit bucket', async (t) => {
  const env = createEnvironment(); t.after(env.close);
  const keys = [];
  env.SCORE_LIMITER.limit = async ({ key }) => { keys.push(key); return { success: true }; };
  await checkNickname(env, 'Alice'); await post(env, score('limitcheck', 0));
  assert.notEqual(keys[0], keys[1]);
  const oversized = await worker.fetch(new Request('https://game.example/api/nickname/check', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerName: 'a'.repeat(2100) }),
  }), env);
  assert.equal(oversized.status, 413);
  env.SCORE_LIMITER.limit = async () => ({ success: false });
  assert.equal((await checkNickname(env, 'Alice')).status, 429);
});
