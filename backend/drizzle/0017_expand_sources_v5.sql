-- v5 资讯源大规模扩展迁移（2026-07-29）
-- 清空旧数据，让 init-sources 接口重新写入 140+ 个新源

-- 1. 清空旧源（让 init-sources 接口重新写入新清单）
DELETE FROM feed_sources;

-- 2. 清空旧新闻条目
DELETE FROM feed_items;

-- 3. 清空旧简报
DELETE FROM daily_digests;

-- 4. 清空反馈表
DELETE FROM news_feedback;

-- 5. 重置 SQLite 自增序列
DELETE FROM sqlite_sequence WHERE name IN ('feed_items', 'daily_digests', 'news_feedback');
