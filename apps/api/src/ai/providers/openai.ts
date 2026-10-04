import { type AiProvider, type CompletionRequest } from './ai-provider'
import { fetchProviderJson, nonEmptyText } from './provider-fetch'

const BASE_URL = 'https://api.openai.com/v1'
const CHAT_MODEL_ID = /^(gpt-|o)/

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[]
}

interface ModelsResponse {
  data?: { id: string }[]
}

export class OpenAiProvider implements AiProvider {
  constructor(private readonly apiKey: string) {}

  async complete({ model, system, messages, json }: CompletionRequest): Promise<string> {
    const body = {
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }
    const response = (await fetchProviderJson(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    })) as ChatResponse
    return nonEmptyText(response.choices?.[0]?.message?.content ?? undefined)
  }

  async listModels(): Promise<string[]> {
    const response = (await fetchProviderJson(`${BASE_URL}/models`, { headers: this.headers() })) as ModelsResponse
    return (response.data ?? []).map((model) => model.id).filter((id) => CHAT_MODEL_ID.test(id))
  }

  private headers() {
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }
  }
}
