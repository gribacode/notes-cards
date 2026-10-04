import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, truncateAll, type TestApp } from '../../test/create-test-app'

const defaultSettings = { newPerDay: 10, maxCards: 20, animation: true, generateAiCards: true, source: null }

describe('users', () => {
  let testApp: TestApp
  let app: INestApplication

  beforeAll(async () => {
    testApp = await createTestApp()
    app = testApp.app
  })
  afterAll(() => app.close())
  beforeEach(() => truncateAll(testApp.prisma))

  async function signIn(): Promise<string> {
    const start = await request(app.getHttpServer()).get('/api/auth/github')
    const state = (start.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!.slice('oauth_state='.length)
    const callback = await request(app.getHttpServer())
      .get('/api/auth/github/callback')
      .query({ code: 'abc', state })
      .set('Cookie', `oauth_state=${state}`)
    const cookies = callback.headers['set-cookie'] as unknown as string[]
    return cookies.find((cookie) => cookie.startsWith('session='))!.split(';')[0]!
  }

  it('GET /api/me without a cookie is 401', async () => {
    await request(app.getHttpServer()).get('/api/me').expect(401)
  })

  it('GET /api/me with a forged cookie is 401', async () => {
    await request(app.getHttpServer()).get('/api/me').set('Cookie', 'session=garbage').expect(401)
  })

  it('GET /api/me returns the profile with default settings', async () => {
    const session = await signIn()

    const response = await request(app.getHttpServer()).get('/api/me').set('Cookie', session).expect(200)

    expect(response.body).toEqual({
      id: expect.any(String),
      login: 'octocat',
      avatarUrl: 'https://avatars.test/octocat.png',
      settings: defaultSettings,
    })
  })

  describe('PUT /api/me/settings', () => {
    it('merges a partial payload into the stored settings and returns the full settings', async () => {
      const session = await signIn()
      await request(app.getHttpServer()).put('/api/me/settings').set('Cookie', session).send({ newPerDay: 5 }).expect(200)

      const response = await request(app.getHttpServer())
        .put('/api/me/settings')
        .set('Cookie', session)
        .send({ source: { kind: 'github', url: 'https://github.com/o/r' } })
        .expect(200)

      expect(response.body).toEqual({
        ...defaultSettings,
        newPerDay: 5,
        source: { kind: 'github', url: 'https://github.com/o/r' },
      })
    })

    it.each([
      ['newPerDay out of range', { newPerDay: 0 }],
      ['maxCards out of range', { maxCards: 101 }],
      ['animation not boolean', { animation: 'yes' }],
      ['unknown field', { admin: true }],
      ['unknown source kind', { source: { kind: 'ftp', url: 'x' } }],
      ['local source without label', { source: { kind: 'local' } }],
    ])('rejects an invalid payload with 400: %s', async (_name, payload) => {
      const session = await signIn()

      await request(app.getHttpServer()).put('/api/me/settings').set('Cookie', session).send(payload).expect(400)
    })

    it('accepts null source to clear it', async () => {
      const session = await signIn()
      await request(app.getHttpServer())
        .put('/api/me/settings')
        .set('Cookie', session)
        .send({ source: { kind: 'local', label: 'vault' } })
        .expect(200)

      const response = await request(app.getHttpServer())
        .put('/api/me/settings')
        .set('Cookie', session)
        .send({ source: null })
        .expect(200)

      expect(response.body.source).toBeNull()
    })

    it('requires a session', async () => {
      await request(app.getHttpServer()).put('/api/me/settings').send({ newPerDay: 5 }).expect(401)
    })
  })

  it('GET /api/me with a still-valid cookie of a deleted user is 401', async () => {
    const session = await signIn()
    await request(app.getHttpServer()).delete('/api/me').set('Cookie', session).expect(204)

    await request(app.getHttpServer()).get('/api/me').set('Cookie', session).expect(401)
  })

  describe('DELETE /api/me', () => {
    it('removes the user and every row that belongs to them, and clears the cookie', async () => {
      const session = await signIn()
      const user = await testApp.prisma.user.findFirstOrThrow()
      const now = new Date()
      await testApp.prisma.cardState.create({
        data: { userId: user.id, cardId: 'c1', stage: 1, intervalDays: 1, dueAt: now, correct: 1, wrong: 0, introducedAt: now },
      })
      await testApp.prisma.review.create({
        data: { id: 'r1', userId: user.id, cardId: 'c1', known: true, answeredAt: now, firstInSession: true },
      })
      await testApp.prisma.aiKey.create({
        data: { userId: user.id, provider: 'gemini', model: 'm', ciphertext: 'c', iv: 'i', authTag: 't' },
      })
      await testApp.prisma.aiCard.create({ data: { userId: user.id, notePath: 'a.md', contentHash: 'h', cards: [] } })

      const response = await request(app.getHttpServer()).delete('/api/me').set('Cookie', session).expect(204)

      expect((response.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/session=;/)
      expect(await testApp.prisma.user.count()).toBe(0)
      expect(await testApp.prisma.cardState.count()).toBe(0)
      expect(await testApp.prisma.review.count()).toBe(0)
      expect(await testApp.prisma.aiKey.count()).toBe(0)
      expect(await testApp.prisma.aiCard.count()).toBe(0)
    })
  })
})
