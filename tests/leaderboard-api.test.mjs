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
