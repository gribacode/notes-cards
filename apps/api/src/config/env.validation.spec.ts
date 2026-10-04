import { validateEnv } from './env.validation'

const validEnv = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
  GITHUB_CLIENT_ID: 'id',
  GITHUB_CLIENT_SECRET: 'secret',
  GITHUB_CALLBACK_URL: 'http://localhost:3000/api/auth/github/callback',
  WEB_URL: 'http://localhost:5173',
  AI_KEY_SECRET: Buffer.alloc(32, 7).toString('base64'),
}

describe('validateEnv', () => {
  it('applies defaults for PORT and COOKIE_SECURE', () => {
    const env = validateEnv(validEnv)
    expect(env.PORT).toBe(3000)
    expect(env.COOKIE_SECURE).toBe(true)
  })

  it('parses COOKIE_SECURE=false and a numeric PORT', () => {
    const env = validateEnv({ ...validEnv, COOKIE_SECURE: 'false', PORT: '4000' })
    expect(env.COOKIE_SECURE).toBe(false)
    expect(env.PORT).toBe(4000)
  })

  it('rejects a short JWT_SECRET with a message naming the variable', () => {
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/)
  })

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({ ...validEnv, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/)
  })

  it('rejects an AI_KEY_SECRET that does not decode to 32 bytes', () => {
    expect(() => validateEnv({ ...validEnv, AI_KEY_SECRET: Buffer.alloc(16).toString('base64') })).toThrow(/AI_KEY_SECRET/)
    expect(() => validateEnv({ ...validEnv, AI_KEY_SECRET: undefined })).toThrow(/AI_KEY_SECRET/)
  })
})
