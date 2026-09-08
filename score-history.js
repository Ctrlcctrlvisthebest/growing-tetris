// Each run has its own local key: saving a score never rewrites the full history.
const SCORE_STORAGE_PREFIX = 'growing-tetris-score-v1:';
const SCORE_PAGE_SIZE = 20;
const SCORE_STATUSES = ['playing', 'completed', 'restarted', 'mode-change'];
let activeScoreRecord = null;
const unsavedScoreRecords = new Map();
let scoreStorageReadFailed = false;
let scoreHistoryDialog = null;
let scoreHistoryPage = 0;
let scoreHistoryRecords = [];

function persistScoreRecord(record) {
  try {
    window.localStorage.setItem(SCORE_STORAGE_PREFIX + record.id, JSON.stringify(record));
    unsavedScoreRecords.delete(record.id);
    return true;
  } catch (_) {
    unsavedScoreRecords.set(record.id, { ...record });
    return false;
  }
}

function beginScoreRun() {
  const now = Date.now();
  const id = window.crypto?.randomUUID?.()
    ?? `${now}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  activeScoreRecord = {
    id, score: 0, mode: hardMode ? 'hard' : 'normal',
    playerName: typeof currentPlayerName === 'function' ? currentPlayerName() : 'Player',
    startedAt: now, updatedAt: now, status: 'playing',
  };
  persistScoreRecord(activeScoreRecord);
}

function saveScoreProgress(status = 'playing') {
  if (!activeScoreRecord || activeScoreRecord.status !== 'playing') return false;
  if (!SCORE_STATUSES.includes(status) || !Number.isSafeInteger(score) || score < 0) return false;
  activeScoreRecord.score = score;
  activeScoreRecord.updatedAt = Math.max(activeScoreRecord.startedAt, Date.now());
  activeScoreRecord.status = status;
  const saved = persistScoreRecord(activeScoreRecord);
  if (status === 'completed' && typeof queueGlobalScore === 'function') queueGlobalScore(activeScoreRecord);
  return saved;
}

function isValidScoreRecord(record) {
  return record && typeof record === 'object'
    && typeof record.id === 'string' && record.id.length > 0 && record.id.length <= 128
    && Number.isSafeInteger(record.score) && record.score >= 0
    && ['normal', 'hard'].includes(record.mode)
    && SCORE_STATUSES.includes(record.status)
    && Number.isFinite(record.startedAt) && record.startedAt > 0
    && Number.isFinite(record.updatedAt) && record.updatedAt >= record.startedAt
    && Number.isFinite(new Date(record.updatedAt).getTime());
}

/** Read only when opening history; malformed entries cannot break the game. */
function readScoreRecords() {
  const records = new Map();
  scoreStorageReadFailed = false;
  try {
    const storage = window.localStorage;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(SCORE_STORAGE_PREFIX)) continue;
      try {
        const record = JSON.parse(storage.getItem(key));
        if (isValidScoreRecord(record) && key === SCORE_STORAGE_PREFIX + record.id) {
          records.set(record.id, record);
        }
      } catch (_) {
        // A single damaged record does not hide the remaining history.
      }
    }
  } catch (_) {
    scoreStorageReadFailed = true;
  }
  for (const [id, record] of unsavedScoreRecords) records.set(id, record);
  return [...records.values()].sort((a, b) => b.startedAt - a.startedAt || b.id.localeCompare(a.id));
}

function scoreRecordStatus(record) {
  if (record.status === 'playing') {
    return record.id === activeScoreRecord?.id ? 'In progress' : 'Unfinished';
  }
  return { completed: 'Game over', restarted: 'Restarted', 'mode-change': 'Mode changed' }[record.status];
}

function renderScoreHistory() {
  if (!scoreHistoryDialog) return;
  const records = scoreHistoryRecords;
  const pageCount = Math.max(1, Math.ceil(records.length / SCORE_PAGE_SIZE));
  scoreHistoryPage = Math.min(scoreHistoryPage, pageCount - 1);
  const best = { normal: 0, hard: 0 };
  for (const record of records) best[record.mode] = Math.max(best[record.mode], record.score);
  document.querySelector('#score-best-normal').textContent = best.normal.toLocaleString();
  document.querySelector('#score-best-hard').textContent = best.hard.toLocaleString();
  document.querySelector('#score-run-count').textContent = records.length.toLocaleString();
  document.querySelector('#score-storage-status').textContent = scoreStorageReadFailed || unsavedScoreRecords.size
    ? 'Some scores could not be saved to this browser. They are available in this session; export a copy to keep them.'
    : 'Saved only in this browser. Clearing site data removes these scores. Export a copy to keep a backup.';

  const rows = document.querySelector('#score-history-rows');
  rows.replaceChildren();
  const start = scoreHistoryPage * SCORE_PAGE_SIZE;
  for (const record of records.slice(start, start + SCORE_PAGE_SIZE)) {
    const row = document.createElement('tr');
    const date = new Date(record.startedAt).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    for (const value of [date, record.score.toLocaleString(), record.mode === 'hard' ? 'Hard' : 'Normal', scoreRecordStatus(record)]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    rows.append(row);
  }
  document.querySelector('#score-history-empty').hidden = records.length > 0;
  document.querySelector('#score-history-table').hidden = records.length === 0;
  document.querySelector('#score-history-page').textContent = `${scoreHistoryPage + 1} / ${pageCount}`;
  document.querySelector('#score-history-previous').disabled = scoreHistoryPage === 0;
  document.querySelector('#score-history-next').disabled = scoreHistoryPage >= pageCount - 1;
  document.querySelector('#score-history-export').disabled = records.length === 0;
}

function openScoreHistory() {
  if (!scoreHistoryDialog || scoreHistoryDialog.open || controlsSuspended) return;
  saveScoreProgress();
  scoreHistoryRecords = readScoreRecords();
  scoreHistoryPage = 0;
  renderScoreHistory();
  scoreHistoryDialog.showModal();
  controlsSuspended = true;
  resetInputTimers();
  syncGameLoop();
  syncBackgroundMusic();
  if (typeof refreshGlobalLeaderboard === 'function') void refreshGlobalLeaderboard();
}

function resumeAfterScoreHistory() {
  controlsSuspended = false;
  resetInputTimers();
  syncGameLoop();
  syncBackgroundMusic();
}

function exportScoreHistory() {
  const lines = ['Date,Score,Mode,Result'];
  for (const record of scoreHistoryRecords) {
    lines.push([new Date(record.startedAt).toISOString(), record.score, record.mode, scoreRecordStatus(record)].join(','));
  }
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `growing-tetris-scores-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function initializeScoreHistory() {
  scoreHistoryDialog = document.querySelector('#score-history');
  if (!scoreHistoryDialog) return;
  document.querySelectorAll('[data-open-scores]').forEach((button) => {
    button.addEventListener('click', openScoreHistory);
  });
  document.querySelector('#score-history-close').addEventListener('click', () => scoreHistoryDialog.close());
  scoreHistoryDialog.addEventListener('close', resumeAfterScoreHistory);
  document.querySelector('#score-history-previous').addEventListener('click', () => {
    scoreHistoryPage = Math.max(0, scoreHistoryPage - 1);
    renderScoreHistory();
  });
  document.querySelector('#score-history-next').addEventListener('click', () => {
    scoreHistoryPage += 1;
    renderScoreHistory();
  });
  document.querySelector('#score-history-export').addEventListener('click', exportScoreHistory);
}
