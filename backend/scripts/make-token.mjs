import { Jwt } from 'hono/utils/jwt'

const token = await Jwt.sign(
  { exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 },
  'local-dev-secret-key-2026',
  'HS256'
)
console.log(token)
