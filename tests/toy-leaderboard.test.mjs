import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../toy-leaderboard.js', import.meta.url), 'utf8');
function setup(sdk = {}) {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { value: id === '#global-leaderboard-mode' ? 'normal' : 'all', textContent: '', children: [], replaceChildren() { this.children = []; }, append(...items) { this.children.push(...items); } });
    return nodes.get(id);
  }
  const calls = [];
  const context = vm.createContext({ window: { toy: { isSupport: async () => true, getRankList: async () => [], ...sdk } }, document: { querySelector: node, createElement: () => node(Symbol()) }, setTimeout, clearTimeout, setLocalizedText: (el, text) => { el.textContent = text; }, t: s => s, languageLocale: () => 'en-US', calls });
  vm.runInContext(source, context);
  return { context, node, run: s => vm.runInContext(s, context) };
}
test('Toy boards are isolated and score limits allow zero and negative scores', () => {
  const { run } = setup();
  assert.equal(run("toyBoard('normal')"), 1);
  assert.equal(run("toyBoard('hard')"), 2);
  assert.throws(() => run("toyBoard('all')"));
  for (const score of [-16777216, -1, 0, 16777215]) assert.equal(run(`toyScoreValid(${score})`), true);
  for (const score of [-16777217, 16777216, 0.5, NaN]) assert.equal(run(`toyScoreValid(${score})`), false);
});
test('finished score waits for explicit submission and sends an absolute mode-specific score', async () => {
  const submitted = [];
  const { run, node } = setup({ submitScore: async req => { submitted.push({ ...req }); return { score: 1000 }; } });
  run("queueToyScore({id:'a',status:'playing',mode:'hard',score:40})");
  assert.equal(run('toySessionScores.size'), 0);
  run("queueToyScore({id:'b',status:'completed',mode:'hard',score:75})");
  assert.equal(submitted.length, 0);
  node('#global-leaderboard-mode').value = 'hard';
  await run('submitToyScore()');
  assert.deepEqual(submitted, [{ board: 2, score: 75 }]);
  assert.equal(run('toySessionScores.size'), 0);
});
test('cancelled login keeps local session score for a deliberate retry; no fallback request', async () => {
  const { run, node } = setup({ submitScore: async () => { throw new Error('cancelled'); } });
  run("queueToyScore({id:'a',status:'completed',mode:'normal',score:0})");
  await run('submitToyScore()');
  assert.equal(run('toySessionScores.size'), 1);
  assert.equal(node('#toy-submit').disabled, false);
  assert.match(node('#toy-account-status').textContent, /failed or was cancelled/);
});
test('out-of-range scores are not clamped or submitted', async () => {
  let called = false;
  const { run } = setup({ submitScore: async () => { called = true; } });
  run("queueToyScore({id:'a',status:'completed',mode:'normal',score:16777216})");
  await run('submitToyScore()');
  assert.equal(called, false);
  assert.equal(run('toySessionScores.size'), 1);
});
test('guest list reads do not access personal ranking or submit, and preserve tied rank order', async () => {
  const reqs = [];
  const { run, node } = setup({ getRankList: async req => { reqs.push({...req}); return [{rank:1,score:0,nickname:'中文昵称'}, {rank:2,score:0,nickname:'second'}]; }, submitScore: () => assert.fail(), getMyRank: () => assert.fail() });
  node('#toy-period').value = 'week';
  await run('refreshToyLeaderboard()');
  assert.deepEqual(reqs, [{board:1,period:'week',limit:3}]);
  assert.equal(node('#global-top-three').children[0].children[1].textContent, '中文昵称');
});
test('ranked true with zero or negative score is shown as ranked', async () => {
  for (const score of [0, -10]) {
    const { run, node } = setup({ getMyRank: async () => ({ranked:true,rank:12,score}) });
    await run('refreshToyLeaderboard()');
    await run('readToyMyRank()');
    assert.equal(node('#toy-my-rank-result').textContent, `Rank: 12 · Score: ${score}`);
  }
});
test('unranked uses ranked flag and unsupported SDK does not call rank APIs', async () => {
  const { run, node } = setup({ getMyRank: async () => ({ranked:false,rank:0,score:0}) });
  await run('refreshToyLeaderboard()'); await run('readToyMyRank()');
  assert.equal(node('#toy-my-rank-result').textContent, 'Not ranked in this period.');
  const other = setup({ isSupport: async () => false, getRankList: () => assert.fail() });
  await other.run('refreshToyLeaderboard()');
  assert.match(other.node('#global-leaderboard-status').textContent, /Open this game on Bilibili Toy/);
});
test('stale list response cannot replace a newly selected board', async () => {
  const pending = [];
  const {run, node} = setup({getRankList: req => new Promise(resolve => pending.push({req,resolve}))});
  const first = run('refreshToyLeaderboard()');
  await new Promise(resolve => setImmediate(resolve));
  node('#global-leaderboard-mode').value = 'hard';
  const second = run('refreshToyLeaderboard()');
  await new Promise(resolve => setImmediate(resolve));
  pending[1].resolve([{rank:1,score:7,nickname:'hard'}]); await second;
  pending[0].resolve([{rank:1,score:10,nickname:'normal'}]); await first;
  assert.equal(node('#global-top-three').children[0].children[1].textContent, 'hard');
});
