terraform {
  required_version = ">= 1.9.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = ">= 5.0.0"
    }
  }
}

# 通过环境变量 CLOUDFLARE_API_TOKEN 注入，避免硬编码
provider "cloudflare" {}
