import { Injectable } from '@nestjs/common'
import type { AiProvider, AiProviderName } from './ai-provider'
import { GeminiProvider } from './gemini'
import { OpenAiProvider } from './openai'

@Injectable()
export class AiProviderFactory {
  create(provider: AiProviderName, apiKey: string): AiProvider {
    return provider === 'gemini' ? new GeminiProvider(apiKey) : new OpenAiProvider(apiKey)
  }
}
