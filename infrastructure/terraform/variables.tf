variable "account_id" {
  description = "Cloudflare Account ID"
  type        = string
  nullable    = false
}

variable "project_name" {
  description = "项目资源前缀"
  type        = string
  default     = "personal-workspace"
}

variable "permission_group_id" {
  description = "API Token 所需权限组 ID（Workers Scripts:Edit、Account Settings:Edit 等）"
  type        = string
  default     = "b89a480218d04ceb98b4fe57ca29dc1f"
}
