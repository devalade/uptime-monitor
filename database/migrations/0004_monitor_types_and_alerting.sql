-- Monitor types (http, tcp, heartbeat), response assertions and per-monitor alerting.

ALTER TABLE monitors ADD COLUMN type TEXT NOT NULL DEFAULT 'http';

-- Accepted status codes as a list of codes, ranges and classes, e.g. "200-299, 301" or "2xx".
-- Replaces expected_status, which is kept only so a rollback to the previous release still works.
ALTER TABLE monitors ADD COLUMN expected_statuses TEXT NOT NULL DEFAULT '200';
UPDATE monitors SET expected_statuses = CAST(expected_status AS TEXT);

-- One "Name: value" header per line.
ALTER TABLE monitors ADD COLUMN request_headers TEXT;
ALTER TABLE monitors ADD COLUMN request_body TEXT;
ALTER TABLE monitors ADD COLUMN keyword TEXT;
ALTER TABLE monitors ADD COLUMN keyword_mode TEXT NOT NULL DEFAULT 'contains';
ALTER TABLE monitors ADD COLUMN json_path TEXT;
ALTER TABLE monitors ADD COLUMN json_expected TEXT;

-- Heartbeat monitors: the monitored job pings /api/health/ping/<token>.
ALTER TABLE monitors ADD COLUMN heartbeat_token TEXT;
ALTER TABLE monitors ADD COLUMN grace_seconds INTEGER NOT NULL DEFAULT 300;
ALTER TABLE monitors ADD COLUMN last_ping_at INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_monitors_heartbeat_token ON monitors(heartbeat_token);

-- Failed checks in a row needed before the monitor goes down.
ALTER TABLE monitors ADD COLUMN failure_threshold INTEGER NOT NULL DEFAULT 1;
ALTER TABLE monitors ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
-- Repeat the DOWN alert every N minutes while the outage lasts; 0 turns reminders off.
ALTER TABLE monitors ADD COLUMN reminder_minutes INTEGER NOT NULL DEFAULT 0;
-- JSON array of alert channel ids; NULL sends to every channel.
ALTER TABLE monitors ADD COLUMN alert_channel_ids TEXT;

ALTER TABLE incidents ADD COLUMN last_alerted_at INTEGER;

-- Checks made during a maintenance window do not count against uptime.
ALTER TABLE monitor_results ADD COLUMN is_maintenance INTEGER NOT NULL DEFAULT 0;
