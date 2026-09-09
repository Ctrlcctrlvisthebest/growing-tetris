// Platform accounts are selected by the Toy host. Never replay Cloudflare's anonymous
// queue or persist an account-less upload across browser sessions.
const toySessionScores = new Map();
let toySdkLoading = null;
let toyRankEntries = null;
let toyMine = null;
let toyReadVersion = 0;
let toyMineVersion = 0;
let toySubmitting = false;

function toyBoard(mode) {
  if (mode === 'normal') return 1;
  if (mode === 'hard') return 2;
  throw new Error('Invalid Toy mode.');
}
function toySelection() {
  const mode = document.querySelector('#global-leaderboard-mode').value;
  return { mode, board: toyBoard(mode), period: document.querySelector('#toy-period').value };
}
function toyScoreValid(score) { return Number.isInteger(score) && score >= -16777216 && score <= 16777215; }
function loadToySdk() {
  if (window.toy) return Promise.resolve(window.toy);
  if (toySdkLoading) return toySdkLoading;
  toySdkLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => { script.remove(); reject(new Error('SDK load timeout')); }, 12000);
    script.src = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
    script.onload = () => { clearTimeout(timer); window.toy ? resolve(window.toy) : reject(new Error('SDK missing')); };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('SDK load failed')); };
    document.head.append(script);
  }).catch(error => { toySdkLoading = null; throw error; });
  return toySdkLoading;
}
function toyReadWithTimeout(promise) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Toy request timeout')), 10000);
  })]).finally(() => clearTimeout(timer));
}
async function toySdkFor(ability) {
  const sdk = await loadToySdk();
  if (typeof sdk[ability] !== 'function' || !await toyReadWithTimeout(sdk.isSupport(ability))) throw new Error('Unsupported Toy capability');
  return sdk;
}
function toyAccountStatus(message) { setLocalizedText(document.querySelector('#toy-account-status'), message); }
function updateToySubmit() {
  const record = toySessionScores.get(toySelection().mode);
  document.querySelector('#toy-submit').disabled = toySubmitting || !record || !toyScoreValid(record.score);
}
function queueToyScore(record) {
  if (record.status !== 'completed' || !['normal', 'hard'].includes(record.mode)) return;
  // Keep only the latest completed game in each mode. Historical scores must not
  // be re-submitted into a later day/week/month or a different platform account.
  toySessionScores.set(record.mode, { id: record.id, score: record.score });
  updateToySubmit();
  toyAccountStatus(toyScoreValid(record.score)
    ? 'Score ready. Submit with your currently logged-in Bilibili account.'
    : 'This score exceeds the Toy limit (16,777,215). Local history is preserved.');
}
async function submitToyScore() {
  if (toySubmitting) return;
  const selection = toySelection();
  const record = toySessionScores.get(selection.mode);
  if (!record) { toyAccountStatus('Finish a game in the selected mode to submit a score.'); return; }
  if (!toyScoreValid(record.score)) { toyAccountStatus('This score exceeds the Toy limit (16,777,215). Local history is preserved.'); return; }
  toySubmitting = true;
  updateToySubmit();
  toyAccountStatus('Submitting… Complete any Bilibili login or data confirmation prompt.');
  try {
    const sdk = await toySdkFor('submitScore');
    const result = await sdk.submitScore({ board: selection.board, score: record.score });
    if (!result || !toyScoreValid(result.score) || result.score < record.score) throw new Error('Invalid score acknowledgement');
    if (toySessionScores.get(selection.mode) === record) toySessionScores.delete(selection.mode);
    toyAccountStatus('Score submitted. Bilibili keeps your personal best on this board.');
    await refreshToyLeaderboard();
  } catch (_) {
    toyAccountStatus('Submission failed or was cancelled. Log in to Bilibili and retry; local history is preserved.');
  } finally { toySubmitting = false; updateToySubmit(); }
}
function renderToyRankings() {
  const list = document.querySelector('#global-top-three');
  if (!list || toyRankEntries === null) return;
  list.replaceChildren();
  for (let index = 0; index < 3; index++) {
    const record = toyRankEntries[index];
    const item = document.createElement('li');
    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = String(record?.rank ?? index + 1).padStart(2, '0');
    const name = document.createElement('strong');
    name.textContent = record ? record.nickname : t('No score yet');
    const points = document.createElement('strong');
    points.className = 'leaderboard-points';
    points.textContent = record ? record.score.toLocaleString(languageLocale()) : '—';
    item.append(rank, name, points);
    list.append(item);
  }
  if (toyMine) {
    const target = document.querySelector('#toy-my-rank-result');
    target.textContent = toyMine.ranked
      ? `${t('Rank')}: ${toyMine.rank} · ${t('Score')}: ${toyMine.score.toLocaleString(languageLocale())}`
      : t('Not ranked in this period.');
  }
}
async function refreshToyLeaderboard() {
  const version = ++toyReadVersion;
  const { board, period } = toySelection();
  const status = document.querySelector('#global-leaderboard-status');
  setLocalizedText(status, 'Loading global scores…');
  try {
    const sdk = await toySdkFor('getRankList');
    const entries = await toyReadWithTimeout(sdk.getRankList({ board, period, limit: 3 }));
    if (!Array.isArray(entries) || entries.length > 3 || !entries.every((r, i) =>
      r && r.rank === i + 1 && typeof r.nickname === 'string' && toyScoreValid(r.score)
      && (i === 0 || entries[i - 1].score >= r.score))) throw new Error('Invalid rankings');
    if (version !== toyReadVersion) return;
    toyRankEntries = entries;
    renderToyRankings();
    setLocalizedText(status, 'Bilibili players · personal best · ties go to the first submission.');
  } catch (_) {
    if (version !== toyReadVersion) return;
    toyRankEntries = [];
    renderToyRankings();
    setLocalizedText(status, 'Open this game on Bilibili Toy to use the platform leaderboard. Local play is available.');
  }
}
async function readToyMyRank() {
  const version = ++toyMineVersion;
  const { board, period } = toySelection();
  try {
    const sdk = await toySdkFor('getMyRank');
    const mine = await toyReadWithTimeout(sdk.getMyRank({ board, period }));
    if (!mine || typeof mine.ranked !== 'boolean' || !toyScoreValid(mine.score)
      || !Number.isInteger(mine.rank) || (mine.ranked ? mine.rank < 1 : mine.rank !== 0 || mine.score !== 0)) throw new Error('Invalid personal ranking');
    if (version !== toyMineVersion) return;
    toyMine = mine;
    renderToyRankings();
  } catch (_) {
    if (version !== toyMineVersion) return;
    toyMine = null;
    setLocalizedText(document.querySelector('#toy-my-rank-result'), 'Sign in to Bilibili and retry My rank.');
  }
}
function initializeToyLeaderboard() {
  for (const element of document.querySelectorAll('.player-name-field, [data-nickname-status]')) element.hidden = true;
  for (const note of document.querySelectorAll('.leaderboard-sharing-note')) setLocalizedText(note, 'Toy leaderboard uses your Bilibili account. Finish a game, then open Scores to submit.');
  document.querySelector('#toy-leaderboard-controls').hidden = false;
  const mode = document.querySelector('#global-leaderboard-mode');
  mode.querySelector('[value="all"]').remove();
  mode.value = 'normal';
  const mine = document.createElement('p');
  mine.id = 'toy-my-rank-result';
  mine.setAttribute('role', 'status');
  document.querySelector('#toy-leaderboard-controls').append(mine);
  const changed = () => {
    toyMineVersion++;
    toyMine = null;
    setLocalizedText(mine, '');
    toyRankEntries = [];
    renderToyRankings();
    updateToySubmit();
    void refreshToyLeaderboard();
  };
  mode.addEventListener('change', changed);
  document.querySelector('#toy-period').addEventListener('change', changed);
  document.querySelector('#toy-submit').addEventListener('click', () => { void submitToyScore(); });
  document.querySelector('#toy-my-rank').addEventListener('click', () => { void readToyMyRank(); });
  document.querySelector('#global-leaderboard-refresh').addEventListener('click', () => { void refreshToyLeaderboard(); });
  void loadToySdk().catch(() => {});
}
