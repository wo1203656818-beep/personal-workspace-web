#!/usr/bin/env node
/**
 * 密码哈希生成脚本
 * 生成格式：pbkdf2$<iterations>$<salt_hex>$<hash_hex>
 * 与 backend/src/index.ts verifyPassword 函数对应
 *
 * 用法：node scripts/hash-password.mjs [password]
 * 输出可直接用于 wrangler secret put PASSWORD_HASH
 */
import { pbkdf2Sync, randomBytes } from 'node:crypto'

const password = process.argv[2] || 'password'
const iterations = 100000
const salt = randomBytes(16)
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256')
const stored = `pbkdf2$${iterations}$${salt.toString('hex')}$${hash.toString('hex')}`
console.log(stored)
