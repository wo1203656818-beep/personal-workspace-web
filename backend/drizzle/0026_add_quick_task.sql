-- 两分钟规则：扩展 tasks 表
ALTER TABLE tasks ADD COLUMN is_quick INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN quick_deadline TEXT;
