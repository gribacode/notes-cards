import { Injectable, UnauthorizedException } from '@nestjs/common'
import { applyAnswer, type CardState } from '@notes-cards/core'
import type { CardState as CardStateRow } from '../prisma/generated/client'
import { PrismaService } from '../prisma/prisma.service'
import { Clock } from './clock'
import type { ReviewDto } from './dto/submit-reviews.dto'

const ACTIVITY_WINDOW_DAYS = 366
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 }

type Transaction = Parameters<Parameters<PrismaService['$transaction']>[0]>[0]

function toCoreState(row: CardStateRow): CardState {
  return {
    cardId: row.cardId,
    stage: row.stage,
    intervalDays: row.intervalDays,
    dueAt: row.dueAt.toISOString(),
    correct: row.correct,
    wrong: row.wrong,
    hidden: row.hidden,
    introducedAt: row.introducedAt.toISOString(),
  }
}

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async submitReviews(userId: string, reviews: ReviewDto[]): Promise<{ accepted: number }> {
    const touchedCardIds = [...new Set(reviews.map((review) => review.cardId))]

    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId)
      const { count } = await tx.review.createMany({
        data: reviews.map((review) => ({ ...review, userId, answeredAt: new Date(review.answeredAt) })),
        skipDuplicates: true,
      })
      await this.recomputeStates(tx, userId, touchedCardIds)
      return { accepted: count }
    }, TRANSACTION_OPTIONS)
  }

  async getProgress(userId: string, tz: string) {
    const [states, activity, totals] = await Promise.all([
      this.prisma.cardState.findMany({ where: { userId }, orderBy: { cardId: 'asc' } }),
      this.loadActivity(userId, tz),
      this.loadTotals(userId),
    ])
    return { states: states.map(toCoreState), activity, totals }
  }

  async setHidden(userId: string, cardId: string, hidden: boolean): Promise<CardState> {
    const now = this.clock.now()
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId)
      return tx.cardState.upsert({
        where: { userId_cardId: { userId, cardId } },
        update: { hidden },
        create: { userId, cardId, hidden, stage: 0, intervalDays: 1, dueAt: now, introducedAt: now, correct: 0, wrong: 0 },
      })
    }, TRANSACTION_OPTIONS)
    return toCoreState(row)
  }

  async exportData(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException()

    const [states, reviews, aiCards] = await Promise.all([
      this.prisma.cardState.findMany({ where: { userId }, orderBy: { cardId: 'asc' } }),
      this.prisma.review.findMany({ where: { userId }, orderBy: [{ answeredAt: 'asc' }, { id: 'asc' }] }),
      this.prisma.aiCard.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    ])
    return {
      exportedAt: this.clock.now().toISOString(),
      user: { login: user.login, settings: user.settings },
      states: states.map(toCoreState),
      reviews: reviews.map(({ id, cardId, known, answeredAt, firstInSession }) => ({
        id,
        cardId,
        known,
        answeredAt: answeredAt.toISOString(),
        firstInSession,
      })),
      aiCards: aiCards.map(({ id, notePath, contentHash, cards, createdAt }) => ({
        id,
        notePath,
        contentHash,
        cards,
        createdAt: createdAt.toISOString(),
      })),
    }
  }

  private lockUser(tx: Transaction, userId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
  }

  private async recomputeStates(tx: Transaction, userId: string, cardIds: string[]) {
    const scheduled = await tx.review.findMany({
      where: { userId, cardId: { in: cardIds }, firstInSession: true },
      orderBy: [{ answeredAt: 'asc' }, { id: 'asc' }],
    })
    const replayedByCard = new Map<string, CardState>()
    for (const { cardId, known, answeredAt } of scheduled) {
      replayedByCard.set(cardId, applyAnswer(replayedByCard.get(cardId), cardId, known, answeredAt))
    }
    if (replayedByCard.size === 0) return

    const states = [...replayedByCard.values()]
    await tx.$executeRaw`
      INSERT INTO "CardState" ("userId", "cardId", "stage", "intervalDays", "dueAt", "correct", "wrong", "hidden", "introducedAt")
      SELECT ${userId}, t.card_id, t.stage, t.interval_days, t.due_at::timestamp, t.correct, t.wrong, false, t.introduced_at::timestamp
      FROM unnest(
        ${states.map((state) => state.cardId)}::text[],
        ${states.map((state) => state.stage)}::int[],
        ${states.map((state) => state.intervalDays)}::int[],
        ${states.map((state) => state.dueAt)}::text[],
        ${states.map((state) => state.correct)}::int[],
        ${states.map((state) => state.wrong)}::int[],
        ${states.map((state) => state.introducedAt)}::text[]
      ) AS t(card_id, stage, interval_days, due_at, correct, wrong, introduced_at)
      ON CONFLICT ("userId", "cardId") DO UPDATE SET
        "stage" = EXCLUDED."stage",
        "intervalDays" = EXCLUDED."intervalDays",
        "dueAt" = EXCLUDED."dueAt",
        "correct" = EXCLUDED."correct",
        "wrong" = EXCLUDED."wrong",
        "introducedAt" = EXCLUDED."introducedAt"`
  }

  private async loadActivity(userId: string, tz: string): Promise<{ date: string; count: number }[]> {
    const since = new Date(this.clock.now().getTime() - ACTIVITY_WINDOW_DAYS * MILLISECONDS_PER_DAY)
    return this.prisma.$queryRaw<{ date: string; count: number }[]>`
      SELECT to_char(("answeredAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS count
      FROM "Review"
      WHERE "userId" = ${userId} AND "firstInSession" = true AND "answeredAt" >= ${since}
      GROUP BY date
      ORDER BY date ASC`
  }

  private async loadTotals(userId: string): Promise<{ answers: number; correctRate: number }> {
    const where = { userId, firstInSession: true }
    const [answers, correct] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.count({ where: { ...where, known: true } }),
    ])
    return { answers, correctRate: answers === 0 ? 0 : correct / answers }
  }
}
