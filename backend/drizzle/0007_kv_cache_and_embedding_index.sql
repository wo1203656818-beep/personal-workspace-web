-- KV 缓存表（AI 搜索结果等短时缓存）
CREATE TABLE IF NOT EXISTS `kv_cache` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` text DEFAULT (datetime('now'))
);

-- 向量嵌入唯一索引（targetType + targetId），避免重复嵌入
CREATE UNIQUE INDEX IF NOT EXISTS `embeddings_target_unique` ON `embeddings` (`target_type`, `target_id`);
