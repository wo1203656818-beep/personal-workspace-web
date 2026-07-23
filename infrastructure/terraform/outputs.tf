output "d1_database_id" {
  description = "D1 数据库 ID，填入 backend/wrangler.jsonc"
  value       = cloudflare_d1_database.main.id
}

output "d1_database_name" {
  description = "D1 数据库名称"
  value       = cloudflare_d1_database.main.name
}

output "r2_bucket_name" {
  description = "R2 存储桶名称"
  value       = cloudflare_r2_bucket.storage.name
}

output "kv_namespace_id" {
  description = "KV 命名空间 ID，填入 backend/wrangler.jsonc"
  value       = cloudflare_workers_kv_namespace.cache.id
}
