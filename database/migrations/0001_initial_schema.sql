-- Initial Schema for Uptime Monitor (D1 Database)

CREATE TABLE IF NOT EXISTS monitors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'HEAD',
    expected_status INTEGER NOT NULL DEFAULT 200,
    interval_seconds INTEGER NOT NULL DEFAULT 60,
    timeout_seconds INTEGER NOT NULL DEFAULT 10,
    degraded_after_ms INTEGER NOT NULL DEFAULT 3000,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    last_status TEXT CHECK(last_status IN ('up', 'down', 'degraded')),
    last_checked_at INTEGER,
    last_response_time_ms INTEGER,
    next_due_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_monitors_next_due_at ON monitors(next_due_at, is_enabled);

CREATE TABLE IF NOT EXISTS monitor_results (
    id TEXT PRIMARY KEY,
    monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    response_status INTEGER,
    response_time_ms INTEGER,
    is_up INTEGER NOT NULL,
    error_message TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_monitor_results_monitor_id_created_at ON monitor_results(monitor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,
    resolved_at INTEGER,
    cause TEXT NOT NULL,
    error_details TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incidents_monitor_id_started_at ON incidents(monitor_id, started_at DESC);
