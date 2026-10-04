import type { INestApplication } from '@nestjs/common'
import { cardId } from '@notes-cards/core'
import request from 'supertest'
import { createTestApp, truncateAll, type TestApp } from '../../test/create-test-app'
import { decryptKey } from './crypto'
import { AiProviderError, type AiProvider, type AiProviderName, type CompletionRequest } from './providers/ai-provider'

const SECRET_KEY = 'AIzaSy-very-secret-key-1234'
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

class FakeProvider implements AiProvider {
  completions: CompletionRequest[] = []
  reply = 'fake reply'
  failWith: AiProviderError | undefined
  models = ['model-one', 'model-two']

  async complete(req: CompletionRequest): Promise<string> {
    this.completions.push(req)
    if (this.failWith) throw this.failWith
    return this.reply
  }

  async listModels(): Promise<string[]> {
    if (this.failWith) throw this.failWith
    return this.models
  }
}

const generated = (cards: unknown) => JSON.stringify({ cards })

describe('ai', () => {
  let testApp: TestApp
  let app: INestApplication
  const provider = new FakeProvider()
  const created: { provider: AiProviderName; key: string }[] = []

  beforeAll(async () => {
    testApp = await createTestApp({
      aiProviders: { create: (name: AiProviderName, key: string) => (created.push({ provider: name, key }), provider) },
    })
    app = testApp.app
  })
  afterAll(() => app.close())
  beforeEach(async () => {
    await truncateAll(testApp.prisma)
    provider.completions = []
    provider.reply = 'fake reply'
    provider.failWith = undefined
    created.length = 0
  })

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

  const http = () => request(app.getHttpServer())
  const putKey = (session: string, body: object = { provider: 'gemini', key: SECRET_KEY, model: 'gemini-2.0-flash' }) =>
    http().put('/api/ai/key').set('Cookie', session).send(body)
  const generate = (session: string, body: Partial<{ notePath: string; contentHash: string; markdown: string }> = {}) =>
    http()
      .post('/api/ai/cards')
      .set('Cookie', session)
      .send({ notePath: 'Frontend/Closures.md', contentHash: HASH_A, markdown: '# Closures', ...body })
  const card = { question: 'Почему?', answer: 'Потому что.', noteTitle: 'Closures' }

  it('requires a session on every endpoint', async () => {
    await http().put('/api/ai/key').send({}).expect(401)
    await http().get('/api/ai/key').expect(401)
    await http().delete('/api/ai/key').expect(401)
    await http().get('/api/ai/models').expect(401)
    await http().post('/api/ai/ask').send({}).expect(401)
    await http().post('/api/ai/advice').send({}).expect(401)
    await http().post('/api/ai/cards').send({}).expect(401)
    await http().get('/api/ai/cards').expect(401)
  })

  describe('key storage', () => {
    it('stores the key encrypted, returns only last4 and never the key', async () => {
      const session = await signIn()

      const saved = await putKey(session).expect(200)
      const shown = await http().get('/api/ai/key').set('Cookie', session).expect(200)

      expect(saved.body).toEqual({ provider: 'gemini', model: 'gemini-2.0-flash', last4: '1234' })
      expect(shown.body).toEqual(saved.body)
      expect(JSON.stringify([saved.body, shown.body])).not.toContain(SECRET_KEY)
      const row = await testApp.prisma.aiKey.findFirstOrThrow()
      expect(row.ciphertext).not.toBe(SECRET_KEY)
      expect(JSON.stringify(row)).not.toContain(SECRET_KEY)
      expect(decryptKey(row, process.env.AI_KEY_SECRET!)).toBe(SECRET_KEY)
    })

    it('replaces the stored key on a second PUT', async () => {
      const session = await signIn()
      await putKey(session)

      await putKey(session, { provider: 'openai', key: 'sk-other-9999', model: 'gpt-4o' }).expect(200)

      expect((await http().get('/api/ai/key').set('Cookie', session)).body).toEqual({ provider: 'openai', model: 'gpt-4o', last4: '9999' })
      expect(await testApp.prisma.aiKey.count()).toBe(1)
    })

    it('verifies the key before storing: invalid key gives 422 and stores nothing', async () => {
      const session = await signIn()
      provider.failWith = new AiProviderError('invalid_key')

      const response = await putKey(session).expect(422)

      expect(response.body).toEqual({ code: 'invalid_key', message: expect.any(String) })
      expect(await testApp.prisma.aiKey.count()).toBe(0)
    })

    it.each([
      [{ provider: 'claude', key: 'k', model: 'm' }],
      [{ provider: 'gemini', key: '', model: 'm' }],
      [{ provider: 'gemini', key: 'k'.repeat(301), model: 'm' }],
      [{ provider: 'gemini', key: 'k', model: 'bad model!' }],
      [{ provider: 'gemini', key: 'k', model: 'm'.repeat(101) }],
    ])('rejects an invalid body %j', async (body) => {
      const session = await signIn()
      await putKey(session, body).expect(400)
      expect(created).toEqual([])
    })

    it('trims whitespace around the key before verifying and storing it', async () => {
      const session = await signIn()

      const response = await putKey(session, { provider: 'gemini', key: `  ${SECRET_KEY}\n`, model: 'm' }).expect(200)

      expect(created).toEqual([{ provider: 'gemini', key: SECRET_KEY }])
      expect(response.body.last4).toBe('1234')
    })

    it('hides last4 for keys shorter than 8 chars', async () => {
      const session = await signIn()
      const response = await putKey(session, { provider: 'gemini', key: 'abcdefg', model: 'm' }).expect(200)
      expect(response.body.last4).toBe('')
    })

    describe('when the stored key cannot be decrypted (rotated secret or tampered row)', () => {
      async function tamper(session: string) {
        await putKey(session)
        await testApp.prisma.aiKey.updateMany({ data: { authTag: Buffer.alloc(16).toString('base64') } })
      }

      it('GET /api/ai/key still returns provider and model with an empty last4', async () => {
        const session = await signIn()
        await tamper(session)

        const response = await http().get('/api/ai/key').set('Cookie', session).expect(200)

        expect(response.body).toEqual({ provider: 'gemini', model: 'gemini-2.0-flash', last4: '' })
      })

      it('maps provider calls to 422 invalid_key asking to re-enter the key', async () => {
        const session = await signIn()
        await tamper(session)

        const response = await http().post('/api/ai/ask').set('Cookie', session).send({ card, messages: [{ role: 'user', content: 'x' }] }).expect(422)

        expect(response.body).toEqual({ code: 'invalid_key', message: expect.stringContaining('заново') })
      })
    })

    it('returns null without a key and deletes the key with 204', async () => {
      const session = await signIn()
      expect((await http().get('/api/ai/key').set('Cookie', session).expect(200)).body).toBeNull()
      await putKey(session)

      await http().delete('/api/ai/key').set('Cookie', session).expect(204)

      expect((await http().get('/api/ai/key').set('Cookie', session)).body).toBeNull()
    })

    it('does not share keys between users', async () => {
      const alice = await signIn(1, 'alice')
      const bob = await signIn(2, 'bob')
      await putKey(alice)

      expect((await http().get('/api/ai/key').set('Cookie', bob)).body).toBeNull()
      await http().post('/api/ai/ask').set('Cookie', bob).send({ card, messages: [{ role: 'user', content: 'hi' }] }).expect(400)
    })

    it('lists models with the stored key', async () => {
      const session = await signIn()
      await putKey(session)
      created.length = 0

      const response = await http().get('/api/ai/models').set('Cookie', session).expect(200)

      expect(response.body).toEqual(['model-one', 'model-two'])
      expect(created).toEqual([{ provider: 'gemini', key: SECRET_KEY }])
    })

    it('answers 400 no_key for models without a key', async () => {
      const session = await signIn()
      const response = await http().get('/api/ai/models').set('Cookie', session).expect(400)
      expect(response.body.code).toBe('no_key')
    })
  })

  describe('POST /api/ai/ask', () => {
    it('answers 400 no_key without a key', async () => {
      const session = await signIn()
      const response = await http().post('/api/ai/ask').set('Cookie', session).send({ card, messages: [{ role: 'user', content: 'hi' }] }).expect(400)
      expect(response.body).toEqual({ code: 'no_key', message: expect.any(String) })
    })

    it('sends card context and the conversation to the provider', async () => {
      const session = await signIn()
      await putKey(session)
      provider.reply = 'объяснение'
      const messages = [
        { role: 'user', content: 'a' },
        { role: 'assistant', content: 'b' },
        { role: 'user', content: 'c' },
      ]

      const response = await http().post('/api/ai/ask').set('Cookie', session).send({ card, messages }).expect(200)

      expect(response.body).toEqual({ text: 'объяснение' })
      const sent = provider.completions[0]!
      expect(sent.model).toBe('gemini-2.0-flash')
      expect(sent.messages).toEqual(messages)
      expect(sent.system).toContain(card.question)
      expect(sent.system).toContain(card.answer)
      expect(sent.system).toContain(card.noteTitle)
    })

    it.each([
      ['no messages', { card, messages: [] }],
      ['last message from assistant', { card, messages: [{ role: 'assistant', content: 'x' }] }],
      ['too many messages', { card, messages: Array.from({ length: 21 }, () => ({ role: 'user', content: 'x' })) }],
      ['too long content', { card, messages: [{ role: 'user', content: 'x'.repeat(4001) }] }],
      ['too long answer', { card: { ...card, answer: 'x'.repeat(8001) }, messages: [{ role: 'user', content: 'x' }] }],
    ])('rejects %s', async (_name, body) => {
      const session = await signIn()
      await putKey(session)
      await http().post('/api/ai/ask').set('Cookie', session).send(body).expect(400)
      expect(provider.completions).toEqual([])
    })

    it.each([
      ['rate_limited', 429],
      ['invalid_key', 422],
      ['provider_error', 502],
    ] as const)('maps provider %s to HTTP %i with a short message', async (code, status) => {
      const session = await signIn()
      await putKey(session)
      provider.failWith = new AiProviderError(code)

      const response = await http().post('/api/ai/ask').set('Cookie', session).send({ card, messages: [{ role: 'user', content: 'x' }] }).expect(status)

      expect(response.body).toEqual({ code, message: expect.any(String) })
      expect(JSON.stringify(response.body)).not.toContain(SECRET_KEY)
    })

    it('maps an unexpected provider crash to provider_error', async () => {
      const session = await signIn()
      await putKey(session)
      jest.spyOn(provider, 'complete').mockRejectedValueOnce(new Error(`boom ${SECRET_KEY}`))

      const response = await http().post('/api/ai/ask').set('Cookie', session).send({ card, messages: [{ role: 'user', content: 'x' }] }).expect(502)

      expect(JSON.stringify(response.body)).not.toContain(SECRET_KEY)
    })
  })

  describe('POST /api/ai/advice', () => {
    it('lists the missed cards in the prompt', async () => {
      const session = await signIn()
      await putKey(session)
      provider.reply = '- Повторить замыкания'

      const response = await http().post('/api/ai/advice').set('Cookie', session).send({ mistakes: [card] }).expect(200)

      expect(response.body).toEqual({ text: '- Повторить замыкания' })
      expect(provider.completions[0]!.messages[0]!.content).toContain('Closures')
    })

    it('rejects an empty list and more than 50 mistakes', async () => {
      const session = await signIn()
      await putKey(session)
      await http().post('/api/ai/advice').set('Cookie', session).send({ mistakes: [] }).expect(400)
      await http().post('/api/ai/advice').set('Cookie', session).send({ mistakes: Array.from({ length: 51 }, () => card) }).expect(400)
    })
  })

  describe('AI cards', () => {
    const twoCards = generated([
      { question: 'Почему замыкание помнит scope?', answer: 'Потому что хранит ссылку на окружение.' },
      { question: 'Чем let отличается от var?', answer: 'Область видимости блока.' },
    ])

    it('generates cards in JSON mode and stores them', async () => {
      const session = await signIn()
      await putKey(session)
      provider.reply = twoCards

      const response = await generate(session, { notePath: 'Frontend/Closures.md' }).expect(200)

      expect(provider.completions[0]).toMatchObject({ json: true, messages: [{ role: 'user', content: '# Closures' }] })
      expect(response.body).toEqual([
        {
          id: await cardId('Frontend/Closures.md', 'Почему замыкание помнит scope?'),
          question: 'Почему замыкание помнит scope?',
          answer: 'Потому что хранит ссылку на окружение.',
          notePath: 'Frontend/Closures.md',
          noteTitle: 'Closures',
          origin: 'ai',
        },
        expect.objectContaining({ question: 'Чем let отличается от var?', origin: 'ai' }),
      ])
      expect((await http().get('/api/ai/cards').set('Cookie', session)).body).toEqual(response.body)
    })

    it('uses the NFC basename without .md as the note title', async () => {
      const session = await signIn()
      await putKey(session)
      provider.reply = twoCards
      const decomposed = 'Папка/Йод.md'.normalize('NFD')

      const response = await generate(session, { notePath: decomposed }).expect(200)

      expect(response.body[0].noteTitle).toBe('Йод'.normalize('NFC'))
      expect(response.body[0].notePath).toBe('Папка/Йод.md'.normalize('NFC'))
    })

    it('treats NFD and NFC spellings of one path as the same note', async () => {
      const session = await signIn()
      await putKey(session)
      provider.reply = twoCards
      const path = 'Папка/Йод.md'

      const first = await generate(session, { notePath: path.normalize('NFD') }).expect(200)
      const second = await generate(session, { notePath: path.normalize('NFC') }).expect(200)

      expect(second.body).toEqual(first.body)
      expect(provider.completions).toHaveLength(1)
      expect(await testApp.prisma.aiCard.count()).toBe(1)
      expect((await testApp.prisma.aiCard.findFirstOrThrow()).notePath).toBe(path.normalize('NFC'))
    })

    it('returns the stored cards when a concurrent request stored them first', async () => {
      const session = await signIn()
      await putKey(session)
      provider.reply = twoCards
      const stored = [{ id: 'stored-id', question: 'Q', answer: 'A', notePath: 'Frontend/Closures.md', noteTitle: 'Closures', origin: 'ai' }]
      const complete = provider.complete.bind(provider)
      jest.spyOn(provider, 'complete').mockImplementationOnce(async (req) => {
        await testApp.prisma.aiCard.create({
          data: { userId: (await testApp.prisma.user.findFirstOrThrow()).id, notePath: 'Frontend/Closures.md', contentHash: HASH_A, cards: stored },
        })
        return complete(req)
      })

      const response = await generate(session).expect(200)

      expect(response.body).toEqual(stored)
      expect((await http().get('/api/ai/cards').set('Cookie', session)).body).toEqual(stored)
    })

    it('drops over-long and duplicate generated items', async () => {
      const session = await signIn()
      await putKey(session)
      provider.reply = generated([
        { question: 'q'.repeat(2001), answer: 'a' },
        { question: 'long answer?', answer: 'a'.repeat(8001) },
        { question: 'Почему?', answer: 'one' },
        { question: ' Почему? ', answer: 'two' },
        { question: 'Что будет?', answer: 'three' },
      ])

      const response = await generate(session).expect(200)

      expect(response.body.map((c: { question: string; answer: string }) => [c.question, c.answer])).toEqual([
        ['Почему?', 'one'],
        ['Что будет?', 'three'],
      ])
    })

    it('does not call the provider for the same hash again', async () => {
      const session = await signIn()
      await putKey(session)
      provider.reply = twoCards
      const first = await generate(session).expect(200)

      const second = await generate(session).expect(200)

      expect(second.body).toEqual(first.body)
      expect(provider.completions).toHaveLength(1)
    })

    it('replaces the old version when the hash changes, keeping other notes', async () => {
      const session = await signIn()
      await putKey(session)
      provider.reply = twoCards
      await generate(session, { contentHash: HASH_A })
      await generate(session, { notePath: 'Other.md', contentHash: HASH_A })
      provider.reply = generated([{ question: 'Почему новое?', answer: 'Потому что.' }])

      await generate(session, { contentHash: HASH_B }).expect(200)

      const all = (await http().get('/api/ai/cards').set('Cookie', session)).body as { notePath: string; question: string }[]
      expect(all.map((c) => c.question).sort()).toEqual(['Почему замыкание помнит scope?', 'Почему новое?', 'Чем let отличается от var?'].sort())
      expect(await testApp.prisma.aiCard.count({ where: { notePath: 'Frontend/Closures.md' } })).toBe(1)
      expect(await testApp.prisma.aiCard.count({ where: { notePath: 'Other.md' } })).toBe(1)
    })

    it('drops invalid items and keeps at most 7 cards', async () => {
      const session = await signIn()
      await putKey(session)
      const valid = Array.from({ length: 9 }, (_, i) => ({ question: `Почему ${i}?`, answer: 'Потому.' }))
      provider.reply = generated([{ question: '', answer: 'x' }, { question: 'q' }, 'junk', null, ...valid])

      const response = await generate(session).expect(200)

      expect(response.body).toHaveLength(7)
      expect(response.body[0].question).toBe('Почему 0?')
    })

    it.each([['not json at all'], [generated([])], [generated([{ question: '', answer: '' }])], [JSON.stringify({ other: 1 })]])(
      'answers 502 provider_error for unusable output %s and stores nothing',
      async (reply) => {
        const session = await signIn()
        await putKey(session)
        provider.reply = reply

        const response = await generate(session).expect(502)

        expect(response.body.code).toBe('provider_error')
        expect(await testApp.prisma.aiCard.count()).toBe(0)
      },
    )

    it('answers 400 no_key without a key and rejects bad input', async () => {
      const session = await signIn()
      expect((await generate(session).expect(400)).body.code).toBe('no_key')
      await generate(session, { contentHash: 'XYZ' }).expect(400)
      await generate(session, { markdown: 'x'.repeat(30_001) }).expect(400)
      await generate(session, { notePath: 'x'.repeat(501) }).expect(400)
    })

    it('isolates cached cards between users', async () => {
      const alice = await signIn(1, 'alice')
      const bob = await signIn(2, 'bob')
      await putKey(alice)
      await putKey(bob)
      provider.reply = twoCards
      await generate(alice).expect(200)

      expect((await http().get('/api/ai/cards').set('Cookie', bob)).body).toEqual([])
      await generate(bob).expect(200)

      expect(provider.completions).toHaveLength(2)
    })
  })

  it('never exposes the key in GET /api/export', async () => {
    const session = await signIn()
    await putKey(session)
    provider.reply = generated([{ question: 'Почему?', answer: 'Потому.' }])
    await generate(session)
    const row = await testApp.prisma.aiKey.findFirstOrThrow()

    const exported = await http().get('/api/export').set('Cookie', session).expect(200)

    const text = JSON.stringify(exported.body)
    expect(text).not.toContain(SECRET_KEY)
    expect(text).not.toContain(row.ciphertext)
    expect(text).not.toContain('last4')
  })
})
