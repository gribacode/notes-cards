import { GeminiProvider } from './gemini'
import { OpenAiProvider } from './openai'
import type { AiProvider } from './ai-provider'

const KEY = 'sk-super-secret-key'
const REQUEST = {
  model: 'm-1',
  system: 'be brief',
  messages: [
    { role: 'user' as const, content: 'hi' },
    { role: 'assistant' as const, content: 'hello' },
    { role: 'user' as const, content: 'why?' },
  ],
}

function stubFetch(status: number, body: unknown) {
  const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

function lastCall(fetchMock: jest.Mock) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return { url, init, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body ?? 'null')) }
}

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
})

function sharedErrorMapping(make: () => AiProvider) {
  it.each([
    [401, 'invalid_key'],
    [403, 'invalid_key'],
    [429, 'rate_limited'],
    [500, 'provider_error'],
    [404, 'provider_error'],
  ])('maps HTTP %i to %s without leaking the key', async (status, code) => {
    stubFetch(status, { error: { message: `boom ${KEY}` } })

    const failure = await make().complete(REQUEST).catch((error: unknown) => error)

    expect(failure).toMatchObject({ code })
    expect(String(failure)).not.toContain(KEY)
  })

  it('maps network failure and timeout to provider_error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError(`fetch failed ${KEY}`)) as unknown as typeof fetch

    const failure = await make().complete(REQUEST).catch((error: unknown) => error)

    expect(failure).toMatchObject({ code: 'provider_error' })
    expect(String(failure)).not.toContain(KEY)
  })

  it('applies a timeout signal to every request', async () => {
    const fetchMock = stubFetch(200, {})
    await make().listModels().catch(() => undefined)
    expect(lastCall(fetchMock).init.signal).toBeInstanceOf(AbortSignal)
  })
}

describe('GeminiProvider', () => {
  const make = () => new GeminiProvider(KEY)
  sharedErrorMapping(make)

  it('posts to generateContent with the key in a header only', async () => {
    const fetchMock = stubFetch(200, { candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] })

    const text = await make().complete(REQUEST)
    const { url, headers, body } = lastCall(fetchMock)

    expect(text).toBe('ab')
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/m-1:generateContent')
    expect(url).not.toContain(KEY)
    expect(headers['x-goog-api-key']).toBe(KEY)
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'be brief' }] })
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user'])
    expect(body.generationConfig).toBeUndefined()
  })

  it('requests JSON mode when asked', async () => {
    const fetchMock = stubFetch(200, { candidates: [{ content: { parts: [{ text: '{}' }] } }] })
    await make().complete({ ...REQUEST, json: true })
    expect(lastCall(fetchMock).body.generationConfig).toEqual({ responseMimeType: 'application/json' })
  })

  it('maps "API key not valid" to invalid_key', async () => {
    stubFetch(400, { error: { message: 'API key not valid. Please pass a valid API key.' } })
    await expect(make().complete(REQUEST)).rejects.toMatchObject({ code: 'invalid_key' })
  })

  it('treats an empty completion as provider_error', async () => {
    stubFetch(200, { candidates: [] })
    await expect(make().complete(REQUEST)).rejects.toMatchObject({ code: 'provider_error' })
  })

  it('lists only generateContent models without the models/ prefix', async () => {
    const fetchMock = stubFetch(200, {
      models: [
        { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
      ],
    })

    expect(await make().listModels()).toEqual(['gemini-2.0-flash'])
    const { url, headers } = lastCall(fetchMock)
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models')
    expect(headers['x-goog-api-key']).toBe(KEY)
  })
})

describe('OpenAiProvider', () => {
  const make = () => new OpenAiProvider(KEY)
  sharedErrorMapping(make)

  it('posts chat completions with a bearer header and the system message first', async () => {
    const fetchMock = stubFetch(200, { choices: [{ message: { content: 'answer' } }] })

    const text = await make().complete(REQUEST)
    const { url, headers, body } = lastCall(fetchMock)

    expect(text).toBe('answer')
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect(headers.Authorization).toBe(`Bearer ${KEY}`)
    expect(body.model).toBe('m-1')
    expect(body.messages[0]).toEqual({ role: 'system', content: 'be brief' })
    expect(body.messages.slice(1)).toEqual(REQUEST.messages)
    expect(body.response_format).toBeUndefined()
  })

  it('requests JSON mode when asked', async () => {
    const fetchMock = stubFetch(200, { choices: [{ message: { content: '{}' } }] })
    await make().complete({ ...REQUEST, json: true })
    expect(lastCall(fetchMock).body.response_format).toEqual({ type: 'json_object' })
  })

  it('treats an empty completion as provider_error', async () => {
    stubFetch(200, { choices: [] })
    await expect(make().complete(REQUEST)).rejects.toMatchObject({ code: 'provider_error' })
  })

  it('lists gpt- and o* models', async () => {
    const fetchMock = stubFetch(200, { data: [{ id: 'gpt-4o' }, { id: 'o3-mini' }, { id: 'whisper-1' }, { id: 'dall-e-3' }] })

    expect(await make().listModels()).toEqual(['gpt-4o', 'o3-mini'])
    expect(lastCall(fetchMock).url).toBe('https://api.openai.com/v1/models')
  })
})
