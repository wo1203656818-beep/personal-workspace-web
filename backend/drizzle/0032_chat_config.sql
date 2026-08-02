-- AI 聊天：会话绑定 AI 配置（支持每会话选择模型）
ALTER TABLE chat_sessions ADD COLUMN config_id TEXT;
