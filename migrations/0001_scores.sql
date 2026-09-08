CREATE TABLE IF NOT EXISTS scores (
  run_id TEXT PRIMARY KEY,
  player_name TEXT NOT NULL CHECK(length(player_name) BETWEEN 1 AND 24),
  score INTEGER NOT NULL CHECK(score >= 0 AND score <= 10000000),
  mode TEXT NOT NULL CHECK(mode IN ('normal', 'hard')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_ranking ON scores(score DESC, created_at ASC, run_id ASC);
CREATE INDEX IF NOT EXISTS scores_mode_ranking ON scores(mode, score DESC, created_at ASC, run_id ASC);
