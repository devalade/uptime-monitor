-- Daily uptime rollups, kept after raw check results are pruned (30 days),
-- so uptime can be reported over 90 days and longer.

CREATE TABLE IF NOT EXISTS monitor_daily_stats (
    id TEXT PRIMARY KEY, -- "<monitor_id>:<day>"
    monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    day TEXT NOT NULL, -- UTC date, YYYY-MM-DD
    total_checks INTEGER NOT NULL,
    up_checks INTEGER NOT NULL,
    avg_response_ms INTEGER,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_monitor_daily_stats_monitor_day ON monitor_daily_stats(monitor_id, day);

INSERT INTO monitor_daily_stats (id, monitor_id, day, total_checks, up_checks, avg_response_ms, updated_at)
SELECT
    monitor_id || ':' || date(created_at / 1000, 'unixepoch'),
    monitor_id,
    date(created_at / 1000, 'unixepoch'),
    COUNT(*),
    SUM(is_up),
    CAST(AVG(response_time_ms) AS INTEGER),
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM monitor_results
WHERE is_maintenance = 0
GROUP BY monitor_id, date(created_at / 1000, 'unixepoch');
