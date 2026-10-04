import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, truncateAll, type TestApp } from '../../test/create-test-app'

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

let reviewCounter = 0

function review(overrides: Partial<{ id: string; cardId: string; known: boolean; answeredAt: string; firstInSession: boolean }> = {}) {
  reviewCounter += 1
  return {
    id: `00000000-0000-4000-8000-${String(reviewCounter).padStart(12, '0')}`,
    cardId: 'card-a',
    known: true,
    answeredAt: new Date(Date.now() - DAY_MS).toISOString(),
    firstInSession: true,
    ...overrides,
  }
}

describe('progress', () => {
  let testApp: TestApp
  let app: INestApplication

  beforeAll(async () => {
    testApp = await createTestApp()
    app = testApp.app
  })
  afterAll(() => app.close())
  beforeEach(() => truncateAll(testApp.prisma))

  async function signIn(githubId = 4242, login = 'octocat'): Promise<string> {
    testApp.github.user = { id: githubId, login, avatarUrl: `https://avatars.test/${login}.png` }
    const start = await request(app.getHttpServer()).get('/api/auth/github')
    const state = (start.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!.slice('oauth_state='.length)
    const callback = await request(app.getHttpServer())
      .get('/api/auth/github/callback')
      .query({ code: 'abc', state })
      .set('Cookie', `oauth_state=${state}`)
    const cookies = callback.headers['set-cookie'] as unknown as string[]
    return cookies.find((cookie) => cookie.startsWith('session='))!.split(';')[0]!
  }

  const postReviews = (session: string, reviews: unknown[]) =>
    request(app.getHttpServer()).post('/api/reviews').set('Cookie', session).send({ reviews })
  const getProgress = (session: string, tz = 'UTC') =>
    request(app.getHttpServer()).get('/api/progress').query({ tz }).set('Cookie', session)

  it('requires a session on every endpoint', async () => {
    const http = request(app.getHttpServer())
    await http.post('/api/reviews').send({ reviews: [] }).expect(401)
    await http.get('/api/progress').query({ tz: 'UTC' }).expect(401)
    await http.patch('/api/cards/card-a').send({ hidden: true }).expect(401)
    await http.get('/api/export').expect(401)
  })

  describe('POST /api/reviews', () => {
    it('accepts new reviews and builds the card state', async () => {
      const session = await signIn()

      const response = await postReviews(session, [
        review({ answeredAt: new Date(Date.now() - 2 * DAY_MS).toISOString() }),
        review({ answeredAt: new Date(Date.now() - DAY_MS).toISOString() }),
      ]).expect(200)
      const progress = await getProgress(session).expect(200)

      expect(response.body).toEqual({ accepted: 2 })
      expect(progress.body.states).toEqual([
        expect.objectContaining({ cardId: 'card-a', stage: 1, intervalDays: 3, correct: 2, wrong: 0, hidden: false }),
      ])
    })

    it('is idempotent: a repeated batch changes nothing', async () => {
      const session = await signIn()
      const batch = [review(), review({ known: false })]
      await postReviews(session, batch).expect(200)
      const before = await getProgress(session)

      const repeat = await postReviews(session, batch).expect(200)
      const after = await getProgress(session)

      expect(repeat.body).toEqual({ accepted: 0 })
      expect(after.body).toEqual(before.body)
    })

    it('applies out-of-order answers by answeredAt', async () => {
      const session = await signIn()
      const first = review({ known: false, answeredAt: new Date(Date.now() - 3 * DAY_MS).toISOString() })
      const second = review({ known: true, answeredAt: new Date(Date.now() - 2 * DAY_MS).toISOString() })

      await postReviews(session, [second]).expect(200)
      await postReviews(session, [first]).expect(200)
      const progress = await getProgress(session)

      expect(progress.body.states[0]).toEqual(
        expect.objectContaining({ stage: 1, intervalDays: 3, correct: 1, wrong: 1, introducedAt: first.answeredAt }),
      )
    })

    it('stores firstInSession=false reviews without changing stage, totals or activity', async () => {
      const session = await signIn()
      await postReviews(session, [review({ known: true })]).expect(200)
      const before = await getProgress(session)

      const response = await postReviews(session, [review({ known: false, firstInSession: false })]).expect(200)
      const after = await getProgress(session)

      expect(response.body).toEqual({ accepted: 1 })
      expect(after.body).toEqual(before.body)
      expect(after.body.totals).toEqual({ answers: 1, correctRate: 1 })
    })

    it('does not create a state for a card that only has firstInSession=false reviews', async () => {
      const session = await signIn()
      await postReviews(session, [review({ firstInSession: false })]).expect(200)

      const progress = await getProgress(session)

      expect(progress.body.states).toEqual([])
    })

    it('keeps the hidden flag when later reviews arrive', async () => {
      const session = await signIn()
      await postReviews(session, [review()]).expect(200)
      await request(app.getHttpServer()).patch('/api/cards/card-a').set('Cookie', session).send({ hidden: true }).expect(200)

      await postReviews(session, [review({ known: false, answeredAt: new Date().toISOString() })]).expect(200)
      const progress = await getProgress(session)

      expect(progress.body.states[0]).toEqual(expect.objectContaining({ hidden: true, wrong: 1, correct: 1 }))
    })

    it('does not leak or overwrite another user data when a review id collides', async () => {
      const alice = await signIn(1, 'alice')
      const bob = await signIn(2, 'bob')
      const shared = review({ known: true })
      await postReviews(alice, [shared]).expect(200)

      const response = await postReviews(bob, [{ ...shared, known: false }]).expect(200)
      const aliceProgress = await getProgress(alice)
      const bobProgress = await getProgress(bob)

      expect(response.body).toEqual({ accepted: 0 })
      expect(aliceProgress.body.states[0]).toEqual(expect.objectContaining({ correct: 1, wrong: 0 }))
      expect(bobProgress.body.states).toEqual([])
      expect(bobProgress.body.totals).toEqual({ answers: 0, correctRate: 0 })
    })

    it('rejects invalid batches with 400', async () => {
      const session = await signIn()
      const tooMany = Array.from({ length: 501 }, () => review())
      const future = new Date(Date.now() + 10 * MINUTE_MS).toISOString()

      await postReviews(session, []).expect(400)
      await postReviews(session, tooMany).expect(400)
      await postReviews(session, [review({ id: 'not-a-uuid' })]).expect(400)
      await postReviews(session, [review({ cardId: '' })]).expect(400)
      await postReviews(session, [review({ cardId: 'x'.repeat(129) })]).expect(400)
      await postReviews(session, [review({ answeredAt: 'yesterday' })]).expect(400)
      await postReviews(session, [review({ answeredAt: future })]).expect(400)
    })

    it('accepts a batch of exactly 500', async () => {
      const session = await signIn()
      const batch = Array.from({ length: 500 }, (_, index) => review({ cardId: `card-${index % 7}` }))

      const response = await postReviews(session, batch).expect(200)

      expect(response.body).toEqual({ accepted: 500 })
    })
  })

  describe('large batches', () => {
    it('handles 500 reviews for 500 distinct cards in one batch', async () => {
      const session = await signIn()
      const batch = Array.from({ length: 500 }, (_, index) => review({ cardId: `card-${index}` }))

      await postReviews(session, batch).expect(200)
      const progress = await getProgress(session)

      expect(progress.body.states).toHaveLength(500)
      expect(progress.body.totals).toEqual({ answers: 500, correctRate: 1 })
    })
  })

  describe('GET /api/progress', () => {
    it('returns 400 for a missing or invalid tz', async () => {
      const session = await signIn()

      await request(app.getHttpServer()).get('/api/progress').set('Cookie', session).expect(400)
      await getProgress(session, 'Mars/Olympus').expect(400)
    })

    it('computes totals over firstInSession reviews', async () => {
      const session = await signIn()
      await postReviews(session, [
        review({ cardId: 'a', known: true }),
        review({ cardId: 'b', known: false }),
        review({ cardId: 'c', known: true }),
        review({ cardId: 'd', known: true }),
      ]).expect(200)

      const progress = await getProgress(session)

      expect(progress.body.totals).toEqual({ answers: 4, correctRate: 0.75 })
    })

    it('returns empty progress for a new user', async () => {
      const session = await signIn()

      const progress = await getProgress(session)

      expect(progress.body).toEqual({ states: [], activity: [], totals: { answers: 0, correctRate: 0 } })
    })

    it('groups activity by local date: 21:30 UTC is the next day in Europe/Moscow', async () => {
      const session = await signIn()
      const answeredAt = new Date(Date.now() - 5 * DAY_MS)
      answeredAt.setUTCHours(21, 30, 0, 0)
      const utcDate = answeredAt.toISOString().slice(0, 10)
      const moscowDate = new Date(answeredAt.getTime() + DAY_MS).toISOString().slice(0, 10)
      await postReviews(session, [
        review({ cardId: 'a', answeredAt: answeredAt.toISOString() }),
        review({ cardId: 'b', answeredAt: answeredAt.toISOString() }),
      ]).expect(200)

      const utc = await getProgress(session, 'UTC')
      const moscow = await getProgress(session, 'Europe/Moscow')

      expect(utc.body.activity).toEqual([{ date: utcDate, count: 2 }])
      expect(moscow.body.activity).toEqual([{ date: moscowDate, count: 2 }])
    })

    it('lists activity ascending and ignores firstInSession=false and answers older than 366 days', async () => {
      const session = await signIn()
      const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString()
      await postReviews(session, [
        review({ cardId: 'a', answeredAt: daysAgo(2) }),
        review({ cardId: 'b', answeredAt: daysAgo(4) }),
        review({ cardId: 'c', answeredAt: daysAgo(3), firstInSession: false }),
        review({ cardId: 'd', answeredAt: daysAgo(400) }),
      ]).expect(200)

      const progress = await getProgress(session)

      expect(progress.body.activity.map((day: { date: string }) => day.date)).toEqual([
        daysAgo(4).slice(0, 10),
        daysAgo(2).slice(0, 10),
      ])
    })
  })

  describe('PATCH /api/cards/:cardId', () => {
    it('creates a fresh hidden state when none exists', async () => {
      const session = await signIn()

      const response = await request(app.getHttpServer())
        .patch('/api/cards/card-x')
        .set('Cookie', session)
        .send({ hidden: true })
        .expect(200)

      expect(response.body).toEqual({
        cardId: 'card-x',
        stage: 0,
        intervalDays: 1,
        dueAt: expect.any(String),
        correct: 0,
        wrong: 0,
        hidden: true,
        introducedAt: expect.any(String),
      })
    })

    it('updates only hidden on an existing state, and rejects a non-boolean', async () => {
      const session = await signIn()
      await postReviews(session, [review()]).expect(200)

      const response = await request(app.getHttpServer())
        .patch('/api/cards/card-a')
        .set('Cookie', session)
        .send({ hidden: true })
        .expect(200)
      await request(app.getHttpServer()).patch('/api/cards/card-a').set('Cookie', session).send({ hidden: 'yes' }).expect(400)

      expect(response.body).toEqual(expect.objectContaining({ stage: 0, correct: 1, hidden: true }))
    })

    it('rejects an invalid cardId with 400', async () => {
      const session = await signIn()

      await request(app.getHttpServer()).patch(`/api/cards/${'x'.repeat(129)}`).set('Cookie', session).send({ hidden: true }).expect(400)
      await request(app.getHttpServer()).patch(`/api/cards/${'x'.repeat(128)}`).set('Cookie', session).send({ hidden: true }).expect(200)
    })

    it('does not touch another user state', async () => {
      const alice = await signIn(1, 'alice')
      const bob = await signIn(2, 'bob')
      await postReviews(alice, [review()]).expect(200)

      await request(app.getHttpServer()).patch('/api/cards/card-a').set('Cookie', bob).send({ hidden: true }).expect(200)
      const aliceProgress = await getProgress(alice)

      expect(aliceProgress.body.states[0].hidden).toBe(false)
    })
  })

  describe('GET /api/export', () => {
    it('returns the user data as an attachment without secrets', async () => {
      const session = await signIn()
      await postReviews(session, [review()]).expect(200)
      const user = await testApp.prisma.user.findFirstOrThrow()
      await testApp.prisma.aiKey.create({
        data: { userId: user.id, provider: 'gemini', model: 'm', ciphertext: 'SECRET_CIPHER', iv: 'iv', authTag: 'SECRET_TAG' },
      })
      await testApp.prisma.aiCard.create({
        data: { userId: user.id, notePath: 'n.md', contentHash: 'h', cards: [{ q: 'Q', a: 'A' }] },
      })

      const response = await request(app.getHttpServer()).get('/api/export').set('Cookie', session).expect(200)

      expect(response.headers['content-disposition']).toBe('attachment; filename="notes-cards-export.json"')
      expect(response.body).toEqual({
        exportedAt: expect.any(String),
        user: { login: 'octocat', settings: expect.objectContaining({ newPerDay: 10 }) },
        states: [expect.objectContaining({ cardId: 'card-a' })],
        reviews: [expect.objectContaining({ cardId: 'card-a', known: true, firstInSession: true })],
        aiCards: [expect.objectContaining({ notePath: 'n.md', cards: [{ q: 'Q', a: 'A' }] })],
      })
      expect(response.text).not.toMatch(/ciphertext|authTag|SECRET/)
    })

    it('contains only the caller data', async () => {
      const alice = await signIn(1, 'alice')
      const bob = await signIn(2, 'bob')
      await postReviews(alice, [review()]).expect(200)

      const response = await request(app.getHttpServer()).get('/api/export').set('Cookie', bob).expect(200)

      expect(response.body.states).toEqual([])
      expect(response.body.reviews).toEqual([])
    })
  })
})
