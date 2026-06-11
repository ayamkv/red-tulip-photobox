CREATE TABLE photo_shares (
	id TEXT PRIMARY KEY,
	object_key TEXT NOT NULL UNIQUE,
	created_at INTEGER NOT NULL,
	expires_at INTEGER NOT NULL,
	download_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX photo_shares_expires_at_idx ON photo_shares (expires_at);

CREATE TABLE upload_limits (
	client_hash TEXT NOT NULL,
	minute_bucket INTEGER NOT NULL,
	upload_count INTEGER NOT NULL DEFAULT 1,
	PRIMARY KEY (client_hash, minute_bucket)
);
