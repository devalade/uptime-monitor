-- Lets each monitor be shown on or hidden from the public status page.
-- Existing monitors stay public so the status page does not change on deploy.
ALTER TABLE monitors ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1;
