import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { hashPassword, encrypt } from '../src/crypto-utils'

function generatePassword(length = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length]
  }
  return result
}

async function main() {
  const devVarsPath = path.resolve(__dirname, '../.dev.vars')
  if (!fs.existsSync(devVarsPath)) {
    console.error('找不到 .dev.vars 文件')
    process.exit(1)
  }

  const devVars = fs.readFileSync(devVarsPath, 'utf-8')
  const jwtSecretMatch = devVars.match(/^JWT_SECRET=(.+)$/m)
  if (!jwtSecretMatch) {
    console.error('找不到 JWT_SECRET')
    process.exit(1)
  }
  const jwtSecret = jwtSecretMatch[1].trim()

  const password = generatePassword()
  const hash = await hashPassword(password)
  const encrypted = await encrypt(jwtSecret, hash)

  const sql =
    `INSERT INTO settings (key, value, updated_at) VALUES ('password_hash', '${encrypted.replace(/'/g, "''")}', datetime('now'))\n` +
    `ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`

  const isRemote = process.argv.includes('--remote')
  const sqlPath = path.resolve(__dirname, '../seed_password.tmp.sql')
  fs.writeFileSync(sqlPath, sql)

  try {
    execSync(
      `npx wrangler d1 execute personal-workspace-db ${isRemote ? '--remote' : '--local'} --file=seed_password.tmp.sql`,
      { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' },
    )
    console.log(`\n✅ 临时密码已写入${isRemote ? '远程' : '本地'} D1 settings 表`)
    console.log(`临时密码：${password}`)
    console.log('登录后可通过「设置 → 修改密码」自行更换。')
  } finally {
    fs.unlinkSync(sqlPath)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
