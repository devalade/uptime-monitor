-- DNS monitors, certificate and domain expiry, slowness alerts, more alert channels,
-- status page settings and subscribers, and REST API keys.

-- DNS monitors: record type to resolve and the values it must contain (comma-separated).
ALTER TABLE monitors ADD COLUMN dns_record_type TEXT NOT NULL DEFAULT 'A';
ALTER TABLE monitors ADD COLUMN dns_expected TEXT;

-- Warn this many days before the TLS certificate or the domain expires; 0 turns it off.
ALTER TABLE monitors ADD COLUMN expiry_warning_days INTEGER NOT NULL DEFAULT 14;
ALTER TABLE monitors ADD COLUMN cert_expires_at INTEGER;
ALTER TABLE monitors ADD COLUMN cert_issuer TEXT;
ALTER TABLE monitors ADD COLUMN cert_error TEXT;
ALTER TABLE monitors ADD COLUMN cert_checked_at INTEGER;
-- Smallest "days left" milestone already alerted for the current certificate.
ALTER TABLE monitors ADD COLUMN cert_warned_days INTEGER;
ALTER TABLE monitors ADD COLUMN domain_expires_at INTEGER;
ALTER TABLE monitors ADD COLUMN domain_checked_at INTEGER;
ALTER TABLE monitors ADD COLUMN domain_warned_days INTEGER;

-- Alert when a monitor turns slow (degraded) and when it is back to normal.
ALTER TABLE monitors ADD COLUMN alert_on_degraded INTEGER NOT NULL DEFAULT 0;
-- Latest result from every region, JSON, from "Check from every region" or a confirmed failure.
ALTER TABLE monitors ADD COLUMN region_results TEXT;

-- SQLite cannot change a CHECK constraint, so the alert channel table is rebuilt with the new types.
CREATE TABLE alert_channels_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('webhook', 'telegram', 'pagerduty', 'pushover', 'opsgenie', 'twilio', 'email')),
    config TEXT NOT NULL,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
INSERT INTO alert_channels_new (id, name, type, config, is_enabled, created_at, updated_at)
SELECT id, name, type, config, is_enabled, created_at, updated_at FROM alert_channels;
DROP TABLE alert_channels;
ALTER TABLE alert_channels_new RENAME TO alert_channels;

-- Status page branding and other settings, one row per key.
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- People who get status page updates by email, after confirming their address.
CREATE TABLE IF NOT EXISTS status_subscribers (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    token TEXT NOT NULL UNIQUE,
    confirmed_at INTEGER,
    confirmation_sent_at INTEGER,
    created_at INTEGER NOT NULL
);

-- REST API keys; only a SHA-256 hash of each key is stored.
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    last_used_at INTEGER,
    created_at INTEGER NOT NULL
);
