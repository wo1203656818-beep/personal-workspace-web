-- 语义检索向量表：存储笔记/任务/知识库的文本向量（CF Workers AI 嵌入模型生成）
CREATE TABLE IF NOT EXISTS `embeddings` (
  `id` text PRIMARY KEY NOT NULL,
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `model` text NOT NULL,
  `vector` text NOT NULL,
  `created_at` text DEFAULT (datetime('now'))
);
