export type AiProviderName = 'gemini' | 'openai'

export type AiErrorCode = 'no_key' | 'invalid_key' | 'rate_limited' | 'provider_error'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CompletionRequest {
  model: string
  system: string
  messages: ChatMessage[]
  /** Ask the provider for a strict JSON object instead of free text. */
  json?: boolean
}

export interface AiProvider {
  complete(request: CompletionRequest): Promise<string>
  listModels(): Promise<string[]>
}

/** Carries only a code: never the key, headers or the provider's response body. */
export class AiProviderError extends Error {
  constructor(readonly code: AiErrorCode) {
    super(code)
  }
}
