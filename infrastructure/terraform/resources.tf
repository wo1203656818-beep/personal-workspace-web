# D1 数据库
resource "cloudflare_d1_database" "main" {
  account_id       = var.account_id
  name             = "${var.project_name}-db"
  read_replication = { mode = "disabled" }
}

# R2 存储桶（存放知识库文件）
resource "cloudflare_r2_bucket" "storage" {
  account_id = var.account_id
  name       = "${var.project_name}-storage"
}

# Workers KV 命名空间（可用于缓存、锁等）
resource "cloudflare_workers_kv_namespace" "cache" {
  account_id = var.account_id
  title      = "${var.project_name}-cache"
}
