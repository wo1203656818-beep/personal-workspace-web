-- 资讯源权重字段：1-5，用于三级漏斗预筛
-- 5=权威媒体/官方源，3=优质聚合，1=辅助参考
ALTER TABLE feed_sources ADD COLUMN weight integer DEFAULT 3;

-- 清理旧分类数据（旧分类：时政/国际/社会/军事/体育/娱乐/热榜 → 新分类：要闻/科技/财经/生活）
-- 将旧分类映射到新分类
UPDATE feed_sources SET category = '要闻' WHERE category IN ('时政', '国际', '社会', '军事');
UPDATE feed_sources SET category = '生活' WHERE category IN ('体育', '娱乐', '热榜');

-- 删除旧的无用数据（体育/娱乐/热榜类条目）
DELETE FROM feed_items WHERE category IN ('体育', '娱乐', '热榜');

-- 给现有源设置默认权重（根据名称）
UPDATE feed_sources SET weight = 5 WHERE name IN ('澎湃新闻', '新华社要闻', '华尔街见闻');
UPDATE feed_sources SET weight = 4 WHERE name IN ('人民网头条', '中国新闻网', 'BBC 中文', '路透中文', '36氪', '爱范儿', '少数派', '量子位', '机器之心', '财联社深度', '金十数据');
UPDATE feed_sources SET weight = 3 WHERE name IN ('IT之家', 'Hacker News', '东方财富', '知乎日报', '丁香医生');
UPDATE feed_sources SET weight = 2 WHERE name IN ('什么值得买');
