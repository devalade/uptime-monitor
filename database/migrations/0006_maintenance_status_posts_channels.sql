-- Maintenance windows, status page announcements and alert channels managed from the dashboard.

CREATE TABLE IF NOT EXISTS maintenance_windows (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    starts_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    monitor_ids TEXT, -- JSON array; NULL covers every monitor
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_maintenance_windows_ends_at ON maintenance_windows(ends_at);

CREATE TABLE IF NOT EXISTS status_posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    impact TEXT NOT NULL CHECK(impact IN ('none', 'minor', 'major')),
    status TEXT NOT NULL CHECK(status IN ('investigating', 'identified', 'monitoring', 'resolved')),
    resolved_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_status_posts_created_at ON status_posts(created_at DESC);

CREATE TABLE IF NOT EXISTS status_post_updates (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES status_posts(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('investigating', 'identified', 'monitoring', 'resolved')),
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_status_post_updates_post_id ON status_post_updates(post_id, created_at);

CREATE TABLE IF NOT EXISTS alert_channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('webhook', 'telegram', 'pagerduty')),
    config TEXT NOT NULL, -- JSON, shape depends on type
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
