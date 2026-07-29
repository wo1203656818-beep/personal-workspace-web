-- 资讯模块 v3 重设计：从"信息流"改为"AI 主编日报"
-- 核心变化：
--   1. feed_items 移除 is_urgent（不再有紧急推送概念，改为每日简报）
--   2. feed_items 新增 ai_reason（AI 判断的"为什么重要"）
--   3. feed_items 新增 briefed_at（标记是否已入选简报）
--   4. daily_digests 新增 pushed_at（推送时间标记）
--   5. 新建 news_feedback 表（用户 👍/👎 反馈）

-- 1. 清空旧数据（用户确认全部清空重做）
DELETE FROM feed_items;
DELETE FROM daily_digests;

-- 2. feed_items 表结构变更
-- 移除 is_urgent 列（SQLite 不支持 DROP COLUMN，通过重建表实现）
CREATE TABLE IF NOT EXISTS feed_items_new (
	id text PRIMARY KEY NOT NULL,
	source_id text NOT NULL,
	title text NOT NULL,
	url text NOT NULL,
	summary text,
	category text NOT NULL,
	ai_score integer DEFAULT 0,
	ai_summary text,
	ai_reason text,
	ai_tags text,
	briefed_at text,
	published_at text,
	fetched_at text DEFAULT (datetime('now')),
	FOREIGN KEY (source_id) REFERENCES feed_sources(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS feed_items_new_url_unique ON feed_items_new (url);
INSERT INTO feed_items_new (id, source_id, title, url, summary, category, ai_score, ai_summary, ai_tags, published_at, fetched_at)
  SELECT id, source_id, title, url, summary, category, ai_score, ai_summary, ai_tags, published_at, fetched_at FROM feed_items;
DROP TABLE feed_items;
ALTER TABLE feed_items_new RENAME TO feed_items;
CREATE UNIQUE INDEX IF NOT EXISTS feed_items_url_unique ON feed_items (url);

-- 3. daily_digests 新增 pushed_at 列
ALTER TABLE daily_digests ADD COLUMN pushed_at text;

-- 4. 新建 news_feedback 表
CREATE TABLE IF NOT EXISTS news_feedback (
	id text PRIMARY KEY NOT NULL,
	target_type text NOT NULL,
	target_id text NOT NULL,
	feedback text NOT NULL,
	reason text,
	created_at text DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS news_feedback_target_idx ON news_feedback (target_type, target_id);
CREATE INDEX IF NOT EXISTS news_feedback_created_idx ON news_feedback (created_at DESC);
