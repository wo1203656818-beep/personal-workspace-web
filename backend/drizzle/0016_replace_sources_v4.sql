-- v4: 替换资讯源为小众民间情报源（加密/财经/科技/综合）
-- 设计：删除全部官方通用新闻源（澎湃/新华社/BBC等），改用 Reddit/HN/V2EX/加密专业媒体
-- 旧分类映射：
--   时政/国际/社会/军事/要闻 → 综合（旧数据将被清理，因源已被替换）
--   生活 → 直接删除（无对应新分类）
-- 新分类：加密 / 财经 / 科技 / 综合

-- 1. 清空旧源（让 init-sources 接口重新写入新清单）
DELETE FROM feed_sources;

-- 2. 清空旧新闻条目（旧条目来自已删除的源，无保留价值）
DELETE FROM feed_items;

-- 3. 清空旧简报（基于旧条目生成的简报，无意义）
DELETE FROM daily_digests;

-- 4. 清空反馈表（关联的旧条目已删除）
DELETE FROM news_feedback;

-- 5. 重置 SQLite 自增序列
DELETE FROM sqlite_sequence WHERE name IN ('feed_items', 'daily_digests', 'news_feedback');
