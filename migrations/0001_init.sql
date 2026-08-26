CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  destination_url TEXT NOT NULL,
  title TEXT,
  og_image_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  clicks INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL,
  clicked_at INTEGER NOT NULL,
  country TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_links_code
ON links(code);

CREATE INDEX IF NOT EXISTS idx_clicks_link_id
ON clicks(link_id);

CREATE INDEX IF NOT EXISTS idx_clicks_clicked_at
ON clicks(clicked_at);

CREATE INDEX IF NOT EXISTS idx_clicks_link_time
ON clicks(link_id, clicked_at);
