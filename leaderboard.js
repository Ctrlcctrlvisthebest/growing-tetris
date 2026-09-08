const PLAYER_NAME_KEY = 'growing-tetris-player-name-v1';
const GLOBAL_SCORE_QUEUE_PREFIX = 'growing-tetris-global-pending-v1:';
const pendingGlobalScores = new Map();
let globalQueueLoaded = false;
let globalLeaderboardRequest = null;
let globalRefreshRequested = false;
let rejectedGlobalScore = false;

function normalizePlayerName(value) {
  return [...String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, 24).join('') || 'Player';
}

function currentPlayerName() {
  const input = document.querySelector('[data-player-name]');
  return normalizePlayerName(input?.value || readLocalStorageItem(PLAYER_NAME_KEY));
}

function loadGlobalQueue() {
  if (globalQueueLoaded) return;
  globalQueueLoaded = true;
  try {
    const storage = window.localStorage;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(GLOBAL_SCORE_QUEUE_PREFIX)) continue;
      try {
        const record = JSON.parse(storage.getItem(key));
        if (record && typeof record.runId === 'string' && key === GLOBAL_SCORE_QUEUE_PREFIX + record.runId
            && typeof record.playerName === 'string' && Number.isSafeInteger(record.score)
            && record.score >= 0 && ['normal', 'hard'].includes(record.mode)) {
          pendingGlobalScores.set(record.runId, record);
        }
      } catch (_) { /* Ignore a damaged queue entry. */ }
    }
  } catch (_) { /* Keep this session's in-memory queue when storage is blocked. */ }
}

function queueGlobalScore(record) {
  if (record.status !== 'completed') return;
  loadGlobalQueue();
  const payload = { runId: record.id, playerName: normalizePlayerName(record.playerName), score: record.score, mode: record.mode };
  pendingGlobalScores.set(record.id, payload);
  writeLocalStorageItem(GLOBAL_SCORE_QUEUE_PREFIX + record.id, JSON.stringify(payload));
  void refreshGlobalLeaderboard();
}

async function leaderboardFetch(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const base = (window.GROWING_TETRIS_API_BASE || '').replace(/\/$/, '');
    const response = await fetch(`${base}/api/${path}`, { ...options, signal: controller.signal });
    if (!response.ok) {
      const error = new Error(`Leaderboard request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally { clearTimeout(timeout); }
}

async function flushGlobalScores() {
  loadGlobalQueue();
  for (const [runId, payload] of pendingGlobalScores) {
    try {
      const result = await leaderboardFetch('scores', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (result.saved !== true) throw new Error('Score was not acknowledged.');
    } catch (error) {
      if (![400, 409, 413, 415].includes(error.status)) throw error;
      // A permanently rejected entry must not block later valid scores.
      rejectedGlobalScore = true;
    }
    pendingGlobalScores.delete(runId);
    try { window.localStorage.removeItem(GLOBAL_SCORE_QUEUE_PREFIX + runId); } catch (_) { /* Retrying the same ID is safe. */ }
  }
}

function renderGlobalLeaderboard(entries) {
  const list = document.querySelector('#global-top-three');
  if (!list) return;
  list.replaceChildren();
  for (let index = 0; index < 3; index += 1) {
    const record = entries[index];
    const item = document.createElement('li');
    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = String(index + 1).padStart(2, '0');
    const player = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = record?.playerName || 'No score yet';
    const detail = document.createElement('small');
    detail.textContent = record
      ? `${record.mode === 'hard' ? 'Hard' : 'Normal'} · ${new Date(record.achievedAt).toLocaleDateString()}`
      : 'Finish a game to take this spot';
    player.append(name, detail);
    const points = document.createElement('strong');
    points.className = 'leaderboard-points';
    points.textContent = record ? record.score.toLocaleString() : '—';
    item.append(rank, player, points);
    list.append(item);
  }
}

function refreshGlobalLeaderboard() {
  if (globalLeaderboardRequest) {
    globalRefreshRequested = true;
    return globalLeaderboardRequest;
  }
  const status = document.querySelector('#global-leaderboard-status');
  if (!status || typeof fetch !== 'function') return Promise.resolve();
  const mode = document.querySelector('#global-leaderboard-mode').value;
  status.textContent = 'Loading global scores…';
  globalLeaderboardRequest = (async () => {
    try {
      try { await flushGlobalScores(); } catch (_) { /* Rankings remain readable while uploads wait for retry. */ }
      const result = await leaderboardFetch(`leaderboard?mode=${encodeURIComponent(mode)}`);
      if (!Array.isArray(result.entries) || result.entries.length > 3 || !result.entries.every((record) => (
        typeof record.playerName === 'string' && Number.isSafeInteger(record.score) && record.score >= 0
        && ['normal', 'hard'].includes(record.mode) && Number.isFinite(record.achievedAt)
      ))) throw new Error('Invalid leaderboard response.');
      if (document.querySelector('#global-leaderboard-mode').value !== mode) {
        globalRefreshRequested = true;
        return;
      }
      renderGlobalLeaderboard(result.entries);
      status.textContent = pendingGlobalScores.size
        ? 'Global scores loaded. Your score is waiting to upload; use Refresh to retry.'
        : rejectedGlobalScore
          ? 'A score could not be accepted online. Its local history entry is preserved.'
          : 'All players · finished games · highest scores first. Ties go to the first submission.';
    } catch (_) {
      status.textContent = pendingGlobalScores.size
        ? 'Your score is saved locally and waiting to upload. Use Refresh when online to retry.'
        : 'Global leaderboard unavailable. Use Refresh to retry. Your local history is still available.';
    } finally {
      globalLeaderboardRequest = null;
      if (globalRefreshRequested) {
        globalRefreshRequested = false;
        void refreshGlobalLeaderboard();
      }
    }
  })();
  return globalLeaderboardRequest;
}

function initializeGlobalLeaderboard() {
  const inputs = [...document.querySelectorAll('[data-player-name]')];
  const savedName = readLocalStorageItem(PLAYER_NAME_KEY) || '';
  for (const input of inputs) {
    input.value = savedName;
    input.addEventListener('input', () => {
      for (const other of inputs) if (other !== input) other.value = input.value;
      writeLocalStorageItem(PLAYER_NAME_KEY, normalizePlayerName(input.value));
    });
    input.addEventListener('keydown', (event) => {
      if (event.code !== 'Enter') return;
      event.preventDefault();
      input.blur();
      if (!gameStarted && !controlsSuspended) startGame();
    });
  }
  document.querySelector('#global-leaderboard-refresh').addEventListener('click', () => { void refreshGlobalLeaderboard(); });
  document.querySelector('#global-leaderboard-mode').addEventListener('change', () => { void refreshGlobalLeaderboard(); });
  window.addEventListener('online', () => { void refreshGlobalLeaderboard(); });
}
