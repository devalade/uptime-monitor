-- Lets the hourly retention sweep delete old check results without a full table scan.
CREATE INDEX IF NOT EXISTS idx_monitor_results_created_at ON monitor_results(created_at);
