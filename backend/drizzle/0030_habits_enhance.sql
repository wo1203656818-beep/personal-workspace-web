-- 习惯增强：负向习惯（坏习惯）、每周指定天数、每周目标次数
ALTER TABLE habits ADD COLUMN is_good INTEGER NOT NULL DEFAULT 1;
ALTER TABLE habits ADD COLUMN frequency TEXT;
ALTER TABLE habits ADD COLUMN target_per_week INTEGER;

-- 习惯详情统计（可选索引）
CREATE INDEX IF NOT EXISTS idx_habit_checkins_habit_date ON habit_checkins(habit_id, date);
