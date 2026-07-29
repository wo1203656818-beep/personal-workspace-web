CREATE TABLE IF NOT EXISTS feed_sources (
	id text PRIMARY KEY NOT NULL,
	name text NOT NULL,
	url text NOT NULL,
	type text NOT NULL,
	category text NOT NULL,
	lang text DEFAULT 'zh',
	enabled integer DEFAULT 1,
	last_fetched_at text,
	created_at text DEFAULT (datetime('now')),
	updated_at text DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feed_items (
	id text PRIMARY KEY NOT NULL,
	source_id text NOT NULL,
	title text NOT NULL,
	url text NOT NULL,
	summary text,
	content_hash text,
	ai_summary text,
	ai_score integer DEFAULT 0,
	ai_tags text,
	category text NOT NULL,
	is_urgent integer DEFAULT 0,
	published_at text,
	fetched_at text DEFAULT (datetime('now')),
	FOREIGN KEY (source_id) REFERENCES feed_sources(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS feed_items_url_unique ON feed_items (url);

CREATE TABLE IF NOT EXISTS daily_digests (
	id text PRIMARY KEY NOT NULL,
	date text NOT NULL,
	title text NOT NULL,
	overview text,
	top_items text NOT NULL,
	created_at text DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_digests_date_unique ON daily_digests (date);
