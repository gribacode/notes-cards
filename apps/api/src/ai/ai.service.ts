import { HttpException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { cardId, type Card } from '@notes-cards/core'
import type { Prisma } from '../prisma/generated/client'
import { PrismaService } from '../prisma/prisma.service'
import { aiHttpError, UNREADABLE_KEY_MESSAGE } from './ai-errors'
import { decryptKey, encryptKey, type EncryptedKey } from './crypto'
import type { Env } from '../config/env.validation'
import type { AdviceDto } from './dto/advice.dto'
import type { AskDto } from './dto/ask.dto'
import type { GenerateCardsDto } from './dto/generate-cards.dto'
import type { SaveKeyDto } from './dto/save-key.dto'
import { MAX_ANSWER_LENGTH, MAX_QUESTION_LENGTH } from './dto/card-context.dto'
import { advicePrompt, askSystemPrompt, CARDS_SYSTEM_PROMPT } from './prompts'
import { AiProviderError, type AiProvider, type AiProviderName } from './providers/ai-provider'
import { AiProviderFactory } from './providers/provider-factory'

const LAST_DIGITS = 4
/** Showing 4 digits of a shorter key would reveal too much of it. */
const MIN_KEY_LENGTH_FOR_LAST4 = 8
const MAX_GENERATED_CARDS = 7

export interface KeySummary {
  provider: AiProviderName
  model: string
  last4: string
}

interface ConfiguredProvider {
  provider: AiProvider
  model: string
}

interface RawCard {
  question: string
  answer: string
}

function noteTitleOf(notePath: string): string {
  const fileName = notePath.normalize('NFC').split('/').pop() ?? ''
  return fileName.replace(/\.md$/i, '')
}

function last4Of(key: string): string {
  return key.length < MIN_KEY_LENGTH_FOR_LAST4 ? '' : key.slice(-LAST_DIGITS)
}

function isRawCard(value: unknown): value is RawCard {
  if (typeof value !== 'object' || value === null) return false
  const { question, answer } = value as Record<string, unknown>
  if (typeof question !== 'string' || typeof answer !== 'string') return false
  const [trimmedQuestion, trimmedAnswer] = [question.trim(), answer.trim()]
  return (
    trimmedQuestion !== '' &&
    trimmedAnswer !== '' &&
    trimmedQuestion.length <= MAX_QUESTION_LENGTH &&
    trimmedAnswer.length <= MAX_ANSWER_LENGTH
  )
}

function withoutDuplicateQuestions(cards: RawCard[]): RawCard[] {
  const seen = new Set<string>()
  return cards.filter(({ question }) => {
    if (seen.has(question)) return false
    seen.add(question)
    return true
  })
}

function parseGeneratedCards(text: string): RawCard[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new AiProviderError('provider_error')
  }
  const items = (parsed as { cards?: unknown } | null)?.cards
  const valid = Array.isArray(items)
    ? items.filter(isRawCard).map(({ question, answer }) => ({ question: question.trim(), answer: answer.trim() }))
    : []
  const cards = withoutDuplicateQuestions(valid).slice(0, MAX_GENERATED_CARDS)
  if (cards.length === 0) throw new AiProviderError('provider_error')
  return cards
}

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly providers: AiProviderFactory,
  ) {}

  async saveKey(userId: string, { provider, key, model }: SaveKeyDto): Promise<KeySummary> {
    await this.guarded(() => this.providers.create(provider, key).listModels())
    const encrypted = encryptKey(key, this.secret())
    await this.prisma.aiKey.upsert({
      where: { userId },
      create: { userId, provider, model, ...encrypted },
      update: { provider, model, ...encrypted },
    })
    return { provider, model, last4: last4Of(key) }
  }

  async getKey(userId: string): Promise<KeySummary | null> {
    const record = await this.prisma.aiKey.findUnique({ where: { userId } })
    if (!record) return null
    return { provider: record.provider as AiProviderName, model: record.model, last4: this.last4OfStored(record) }
  }

  async deleteKey(userId: string): Promise<void> {
    await this.prisma.aiKey.deleteMany({ where: { userId } })
  }

  async listModels(userId: string): Promise<string[]> {
    const { provider } = await this.configuredProvider(userId)
    return this.guarded(() => provider.listModels())
  }

  async ask(userId: string, { card, messages }: AskDto): Promise<{ text: string }> {
    const { provider, model } = await this.configuredProvider(userId)
    const text = await this.guarded(() => provider.complete({ model, system: askSystemPrompt(card), messages }))
    return { text }
  }

  async advice(userId: string, { mistakes }: AdviceDto): Promise<{ text: string }> {
    const { provider, model } = await this.configuredProvider(userId)
    const { system, user } = advicePrompt(mistakes)
    const text = await this.guarded(() => provider.complete({ model, system, messages: [{ role: 'user', content: user }] }))
    return { text }
  }

  async generateCards(userId: string, { notePath: rawNotePath, contentHash, markdown }: GenerateCardsDto): Promise<Card[]> {
    const notePath = rawNotePath.normalize('NFC')
    const cached = await this.prisma.aiCard.findUnique({
      where: { userId_notePath_contentHash: { userId, notePath, contentHash } },
    })
    if (cached) return cached.cards as unknown as Card[]

    const { provider, model } = await this.configuredProvider(userId)
    const text = await this.guarded(() =>
      provider.complete({ model, system: CARDS_SYSTEM_PROMPT, messages: [{ role: 'user', content: markdown }], json: true }),
    )
    const raw = await this.guarded(async () => parseGeneratedCards(text))
    const noteTitle = noteTitleOf(notePath)
    const cards: Card[] = await Promise.all(
      raw.map(async ({ question, answer }) => ({
        id: await cardId(notePath, question),
        question,
        answer,
        notePath,
        noteTitle,
        origin: 'ai' as const,
      })),
    )
    return this.storeCards(userId, notePath, contentHash, cards)
  }

  async listCards(userId: string): Promise<Card[]> {
    const rows = await this.prisma.aiCard.findMany({ where: { userId }, orderBy: [{ notePath: 'asc' }, { createdAt: 'asc' }] })
    return rows.flatMap((row) => row.cards as unknown as Card[])
  }

  /** Returns the cards actually stored: a concurrent identical request may have won the race. */
  private async storeCards(userId: string, notePath: string, contentHash: string, cards: Card[]): Promise<Card[]> {
    const json = cards as unknown as Prisma.InputJsonValue
    const [stored] = await this.prisma.$transaction([
      this.prisma.aiCard.upsert({
        where: { userId_notePath_contentHash: { userId, notePath, contentHash } },
        create: { userId, notePath, contentHash, cards: json },
        update: {},
      }),
      this.prisma.aiCard.deleteMany({ where: { userId, notePath, contentHash: { not: contentHash } } }),
    ])
    return stored.cards as unknown as Card[]
  }

  private async configuredProvider(userId: string): Promise<ConfiguredProvider> {
    const record = await this.prisma.aiKey.findUnique({ where: { userId } })
    if (!record) throw aiHttpError('no_key')
    const provider = this.providers.create(record.provider as AiProviderName, this.decrypt(record))
    return { provider, model: record.model }
  }

  private decrypt(record: EncryptedKey): string {
    try {
      return decryptKey(record, this.secret())
    } catch {
      // A rotated secret or a tampered row: the error text is deliberately dropped.
      throw aiHttpError('invalid_key', UNREADABLE_KEY_MESSAGE)
    }
  }

  private last4OfStored(record: EncryptedKey): string {
    try {
      return last4Of(this.decrypt(record))
    } catch {
      return ''
    }
  }

  private secret(): string {
    return this.config.get('AI_KEY_SECRET', { infer: true })
  }

  private async guarded<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call()
    } catch (error) {
      if (error instanceof HttpException) throw error
      throw aiHttpError(error instanceof AiProviderError ? error.code : 'provider_error')
    }
  }
}
