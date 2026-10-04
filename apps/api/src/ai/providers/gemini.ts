import { type AiProvider, type CompletionRequest } from './ai-provider'
import { fetchProviderJson, nonEmptyText } from './provider-fetch'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

interface ModelsResponse {
  models?: { name: string; supportedGenerationMethods?: string[] }[]
}

export class GeminiProvider implements AiProvider {
  constructor(private readonly apiKey: string) {}

  async complete({ model, system, messages, json }: CompletionRequest): Promise<string> {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map(({ role, content }) => ({
        role: role === 'assistant' ? 'model' : 'user',
        parts: [{ text: content }],
      })),
      ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
    }
    const response = (await fetchProviderJson(`${BASE_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    })) as GenerateResponse
    const parts = response.candidates?.[0]?.content?.parts ?? []
    return nonEmptyText(parts.map((part) => part.text ?? '').join(''))
  }

  async listModels(): Promise<string[]> {
    const response = (await fetchProviderJson(BASE_URL, { headers: this.headers() })) as ModelsResponse
    return (response.models ?? [])
      .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
      .map((model) => model.name.replace(/^models\//, ''))
  }

  private headers() {
    return { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' }
  }
}
