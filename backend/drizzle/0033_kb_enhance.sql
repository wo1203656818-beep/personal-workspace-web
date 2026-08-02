-- 知识库增强：星标收藏 + AI 摘要缓存
ALTER TABLE kb_documents ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kb_documents ADD COLUMN ai_summary TEXT;
