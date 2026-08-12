CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_slug TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
  visitor_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_comments_post_status_created
ON comments (post_slug, status, created_at);

CREATE INDEX IF NOT EXISTS idx_comments_status_created
ON comments (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_visitor_created
ON comments (visitor_hash, created_at DESC);
