import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { Client } from 'pg'
import { TEST_DATABASE_URL } from './test-env'

const TEST_DATABASE_NAME = new URL(TEST_DATABASE_URL).pathname.slice(1)
const API_ROOT = path.resolve(__dirname, '..')

async function recreateTestDatabase() {
  if (!TEST_DATABASE_NAME.endsWith('_test')) throw new Error(`Refusing to drop non-test database: ${TEST_DATABASE_NAME}`)
  const adminUrl = new URL(TEST_DATABASE_URL)
  adminUrl.pathname = '/postgres'
  const admin = new Client({ connectionString: adminUrl.toString() })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE_NAME}" WITH (FORCE)`)
    await admin.query(`CREATE DATABASE "${TEST_DATABASE_NAME}"`)
  } finally {
    await admin.end()
  }
}

function applyMigrations() {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  })
}

export default async function globalSetup() {
  await recreateTestDatabase()
  applyMigrations()
}
