CREATE TABLE users (
  email TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE pages (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  project TEXT NOT NULL,
  project_label TEXT,
  source TEXT,
  device_id TEXT,
  content_hash TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX pages_updated_at ON pages (updated_at DESC);
CREATE INDEX pages_project ON pages (project);

CREATE TABLE page_states (
  user_email TEXT NOT NULL,
  slug TEXT NOT NULL,
  read_version TEXT,
  starred INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_email, slug)
);

CREATE TABLE project_states (
  user_email TEXT NOT NULL,
  project TEXT NOT NULL,
  starred INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_email, project)
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE pairings (
  code_hash TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('request', 'review')),
  user_email TEXT NOT NULL,
  device_id TEXT,
  session_id TEXT,
  title TEXT,
  body TEXT NOT NULL,
  target TEXT,
  context TEXT,
  recommendation TEXT,
  status TEXT NOT NULL CHECK (status IN ('waiting', 'answered', 'completed')),
  approved INTEGER,
  response_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  answered_at TEXT,
  completed_at TEXT,
  expires_at TEXT NOT NULL
);
CREATE INDEX tasks_user_status ON tasks (user_email, status, created_at);
CREATE INDEX tasks_session ON tasks (session_id, status);
