import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import {
  createTestApp,
  FAKE_GITHUB_ACCESS_TOKEN,
  FAKE_GITHUB_USER,
  truncateAll,
  type TestApp,
} from '../../test/create-test-app'

function setCookies(response: request.Response): string[] {
  return (response.headers['set-cookie'] as unknown as string[] | undefined) ?? []
}

function cookieValue(cookies: string[], name: string): string | undefined {
  const line = cookies.find((cookie) => cookie.startsWith(`${name}=`))
  return line?.split(';')[0]?.slice(name.length + 1)
}

describe('auth', () => {
  let testApp: TestApp
  let app: INestApplication

  beforeAll(async () => {
    testApp = await createTestApp()
    app = testApp.app
  })
  afterAll(() => app.close())
  beforeEach(async () => {
    await truncateAll(testApp.prisma)
    testApp.github.failing = false
  })

  async function startLogin() {
    const response = await request(app.getHttpServer()).get('/api/auth/github').expect(302)
    const cookies = setCookies(response)
    const state = cookieValue(cookies, 'oauth_state')
    return { response, cookies, state }
  }

  describe('GET /api/auth/github', () => {
    it('redirects to GitHub with the state that is stored in an httpOnly cookie', async () => {
      const { response, cookies, state } = await startLogin()
      const location = new URL(response.headers.location as string)

      expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize')
      expect(location.searchParams.get('client_id')).toBe('test-client-id')
      expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/auth/github/callback')
      expect(location.searchParams.get('scope')).toBe('')
      expect(state).toHaveLength(64)
      expect(location.searchParams.get('state')).toBe(state)
      const stateCookie = cookies.find((cookie) => cookie.startsWith('oauth_state='))
      expect(stateCookie).toMatch(/HttpOnly/i)
      expect(stateCookie).toMatch(/Path=\/api\/auth/)
    })
  })

  describe('GET /api/auth/github/callback', () => {
    it('creates the user and sets an httpOnly session cookie, then redirects to the web app', async () => {
      const { state } = await startLogin()

      const response = await request(app.getHttpServer())
        .get('/api/auth/github/callback')
        .query({ code: 'abc', state })
        .set('Cookie', `oauth_state=${state}`)
        .expect(302)

      expect(response.headers.location).toBe('http://localhost:5173')
      const sessionCookie = setCookies(response).find((cookie) => cookie.startsWith('session='))
      expect(sessionCookie).toMatch(/HttpOnly/i)
      expect(sessionCookie).toMatch(/SameSite=Lax/i)
      expect(sessionCookie).toMatch(/Path=\/api/)
      const user = await testApp.prisma.user.findUniqueOrThrow({ where: { githubId: FAKE_GITHUB_USER.id } })
      expect(user.login).toBe('octocat')
      expect(user.settings).toEqual({
        newPerDay: 10,
        maxCards: 20,
        animation: true,
        generateAiCards: true,
        source: null,
      })
    })

    it('updates login and avatar on a repeat sign-in without duplicating the user', async () => {
      const { state } = await startLogin()
      const signIn = () =>
        request(app.getHttpServer())
          .get('/api/auth/github/callback')
          .query({ code: 'abc', state })
          .set('Cookie', `oauth_state=${state}`)
          .expect(302)
      await signIn()
      testApp.github.user = { ...FAKE_GITHUB_USER, login: 'renamed' }
      await signIn()

      const users = await testApp.prisma.user.findMany()
      expect(users).toHaveLength(1)
      expect(users[0]?.login).toBe('renamed')
      testApp.github.user = FAKE_GITHUB_USER
    })

    it('rejects a state that differs from the cookie with 400 and clears the cookie', async () => {
      const { state } = await startLogin()

      const response = await request(app.getHttpServer())
        .get('/api/auth/github/callback')
        .query({ code: 'abc', state: 'forged' })
        .set('Cookie', `oauth_state=${state}`)
        .expect(400)

      expect(setCookies(response).join(';')).toMatch(/oauth_state=;/)
      expect(await testApp.prisma.user.count()).toBe(0)
    })

    it('rejects a callback without the state cookie with 400', async () => {
      await request(app.getHttpServer()).get('/api/auth/github/callback').query({ code: 'abc', state: 'x' }).expect(400)
    })

    it('redirects to the web app with authError when GitHub fails', async () => {
      const { state } = await startLogin()
      testApp.github.failing = true

      const response = await request(app.getHttpServer())
        .get('/api/auth/github/callback')
        .query({ code: 'abc', state })
        .set('Cookie', `oauth_state=${state}`)
        .expect(302)

      expect(response.headers.location).toBe('http://localhost:5173/?authError=1')
      expect(setCookies(response).some((cookie) => cookie.startsWith('session='))).toBe(false)
    })

    it('never exposes the GitHub access token in headers, cookies or body', async () => {
      const { state } = await startLogin()

      const response = await request(app.getHttpServer())
        .get('/api/auth/github/callback')
        .query({ code: 'abc', state })
        .set('Cookie', `oauth_state=${state}`)

      const everything = JSON.stringify({ headers: response.headers, body: response.text })
      expect(everything).not.toContain(FAKE_GITHUB_ACCESS_TOKEN)
    })
  })

  describe('POST /api/auth/logout', () => {
    it('clears the session cookie', async () => {
      const response = await request(app.getHttpServer()).post('/api/auth/logout').expect(204)

      expect(setCookies(response).join(';')).toMatch(/session=;/)
    })
  })
})
