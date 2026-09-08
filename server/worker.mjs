const MAX_BODY_BYTES = 2048;
const MAX_SCORE = 10_000_000;

class HttpError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) { super(message); this.status = status; }
}

/** @param {Request} request */
async function readScore(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Send application/json.');
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Score is required.');
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(413, 'Request too large.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); }
  catch (_) { throw new HttpError(400, 'Invalid JSON.'); }
  if (!data || typeof data !== 'object'
      || typeof data.runId !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(data.runId)
      || typeof data.playerName !== 'string' || data.playerName.trim() !== data.playerName
      || [...data.playerName].length < 1 || [...data.playerName].length > 24
      || /[\u0000-\u001f\u007f]/.test(data.playerName)
      || !Number.isSafeInteger(data.score) || data.score < 0 || data.score > MAX_SCORE
      || !['normal', 'hard'].includes(data.mode)) {
    throw new HttpError(400, 'Invalid score, nickname or mode.');
  }
  return data;
}

/** @param {Env} env @param {string} mode */
async function topScores(env, mode) {
  if (!['all', 'normal', 'hard'].includes(mode)) throw new HttpError(400, 'Invalid mode.');
  const columns = 'player_name AS playerName, score, mode, created_at AS achievedAt';
  const query = mode === 'all'
    ? env.DB.prepare(`SELECT ${columns} FROM scores ORDER BY score DESC, created_at ASC, run_id ASC LIMIT 3`)
    : env.DB.prepare(`SELECT ${columns} FROM scores WHERE mode = ? ORDER BY score DESC, created_at ASC, run_id ASC LIMIT 3`).bind(mode);
  const { results } = await query.all();
  return { entries: results.map((row, index) => ({ rank: index + 1, ...row })) };
}

/** @param {Request} request @param {Env} env */
async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  const origin = request.headers.get('origin');
  const allowed = !origin || origin === url.origin || env.ALLOWED_ORIGINS.split(',').includes(origin);
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  if (origin && allowed) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  /** @param {unknown} body @param {number} status */
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (!allowed) return json({ error: 'Origin not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  try {
    if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
      return json(await topScores(env, url.searchParams.get('mode') || 'all'));
    }
    if (url.pathname === '/api/scores' && request.method === 'POST') {
      const { success } = await env.SCORE_LIMITER.limit({ key: `growing-tetris:${request.headers.get('CF-Connecting-IP') || 'local'}` });
      if (!success) {
        headers.set('Retry-After', '60');
        return json({ error: 'Please retry in a minute.' }, 429);
      }
      const data = await readScore(request);
      await env.DB.prepare('INSERT INTO scores (run_id, player_name, score, mode, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(run_id) DO NOTHING')
        .bind(data.runId, data.playerName, data.score, data.mode, Date.now()).run();
      const stored = await env.DB.prepare('SELECT player_name, score, mode FROM scores WHERE run_id = ?').bind(data.runId).first();
      if (!stored || stored.player_name !== data.playerName || stored.score !== data.score || stored.mode !== data.mode) {
        throw new HttpError(409, 'This game was already submitted with different data.');
      }
      return json({ saved: true });
    }
    return json({ error: 'Not found.' }, 404);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(JSON.stringify({ event: 'leaderboard_error', path: url.pathname }));
    return json({ error: 'Leaderboard temporarily unavailable.' }, 503);
  }
}

export default { fetch: handleRequest };
