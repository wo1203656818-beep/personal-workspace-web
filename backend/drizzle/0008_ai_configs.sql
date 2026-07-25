-- AI 配置表（支持多条，可自由设置默认）
CREATE TABLE IF NOT EXISTS `ai_configs` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `type` text NOT NULL,
  `base_url` text,
  `api_key` text,
  `model` text,
  `is_default` integer NOT NULL DEFAULT 0,
  `created_at` text DEFAULT (datetime('now')),
  `updated_at` text DEFAULT (datetime('now'))
);
