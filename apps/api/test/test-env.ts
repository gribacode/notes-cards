export const TEST_DATABASE_URL = 'postgresql://notes:notes@localhost:5432/notes_cards_test'

export const TEST_ENV = {
  DATABASE_URL: TEST_DATABASE_URL,
  JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
  GITHUB_CLIENT_ID: 'test-client-id',
  GITHUB_CLIENT_SECRET: 'test-client-secret',
  GITHUB_CALLBACK_URL: 'http://localhost:3000/api/auth/github/callback',
  AI_KEY_SECRET: Buffer.alloc(32, 9).toString('base64'),
  WEB_URL: 'http://localhost:5173',
  COOKIE_SECURE: 'false',
}
