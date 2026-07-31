-- 决策规则预置模板
CREATE TABLE IF NOT EXISTS decision_templates (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  condition TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 决策日志
CREATE TABLE IF NOT EXISTS decision_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  options TEXT,
  chosen_option TEXT,
  duration_sec INTEGER,
  satisfaction INTEGER,
  rule_applied TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 性能索引
CREATE INDEX IF NOT EXISTS idx_decision_templates_category ON decision_templates(category);
CREATE INDEX IF NOT EXISTS idx_decision_logs_task_id ON decision_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_decision_logs_category ON decision_logs(category);

-- 预置决策模板数据
INSERT INTO decision_templates (id, category, title, condition, action, description, sort_order) VALUES
-- 出行类
('tpl-train-001', '出行', '短途优先省时', '路程<300km 或 差价<50元', '直接选高铁/动车，不看普速', '短途出行，时间比金钱更值钱', 1),
('tpl-train-002', '出行', '长途差价阈值', '路程≥300km 且 差价>100元', '选普速卧铺，省下的钱够吃一顿', '长途出行，省钱有意义', 2),
('tpl-train-003', '出行', '极端时间差直接选快的', '耗时差>4小时', '不管差价，直接选最快方案', '时间差距太大时，省钱不划算', 3),
('tpl-train-004', '出行', '选项不超过3个', '同时对比>3个方案时', '砍掉最贵和最慢的，中间选一个', '减少选项=减少纠结', 4),
-- 购物类
('tpl-shop-001', '购物', '小件不纠结', '单价<100元 且 不影响核心体验', '5分钟内下单，不回头比价', '小钱买时间，比价成本远超省下的钱', 10),
('tpl-shop-002', '购物', '大件冷静期', '单价>500元 或 长期使用', '加入购物车，等24小时再决定', '大件值得冷静，但冷静有时限', 11),
('tpl-shop-003', '购物', '三选一原则', '同类商品>3个选项', '按预算筛到3个，选中间价位', '中间价位通常性价比最高', 12),
-- 饮食类
('tpl-food-001', '饮食', '工作日快餐决策', '工作日午餐 且 预算<30元', '选最近的，不翻菜单对比', '午餐不值得花超过2分钟选择', 20),
('tpl-food-002', '饮食', '聚餐选餐厅', '多人聚餐 且 有人选不出', '轮流选或指定一人30秒决定', '聚餐重点是人，不是餐厅', 21),
-- 时间安排类
('tpl-time-001', '时间安排', '两难选A不选B', '只有两个选项且各有优劣', '选那个更难/更不想做的（吃青蛙）', '做完难的，轻松的自然跟上', 30),
('tpl-time-002', '时间安排', '5分钟法则', '任务启动困难 且 预计<30分钟', '先做5分钟再说，做了再决定', '启动成本是最大的障碍，5分钟能打破', 31),
('tpl-time-003', '时间安排', '碎片时间利用', '剩余时间<30分钟 且 有零碎任务', '做子任务或整理，不启动新大任务', '碎片时间做碎片事，保护大块时间', 32),
-- 社交类
('tpl-social-001', '社交', '已读不回默认值', '收到消息 且 不知道怎么回', '先回"收到，稍后回复"，再想', '先稳住对方，给自己留缓冲', 40),
('tpl-social-002', '社交', '邀约决策', '收到邀约 且 纠结去不去', '问自己：拒绝后会后悔吗？会就去', '后悔没去 > 后悔去了', 41);
