import type { CardState } from './types'

const DAY_MS = 24 * 60 * 60 * 1000
const LADDER_DAYS = [1, 3, 7, 21, 60] as const
const LAST_STAGE = LADDER_DAYS.length - 1
const FIRST_INTERVAL_DAYS = 1

function nextStep(prev: CardState): { stage: number; intervalDays: number } {
  const pastLadder = prev.stage >= LAST_STAGE
  if (pastLadder) return { stage: LAST_STAGE, intervalDays: prev.intervalDays * 2 }

  const stage = prev.stage + 1
  return { stage, intervalDays: LADDER_DAYS[stage] ?? prev.intervalDays * 2 }
}

export function applyAnswer(prev: CardState | undefined, cardId: string, known: boolean, now: Date): CardState {
  const step = prev && known ? nextStep(prev) : { stage: 0, intervalDays: FIRST_INTERVAL_DAYS }

  return {
    cardId,
    stage: step.stage,
    intervalDays: step.intervalDays,
    dueAt: new Date(now.getTime() + step.intervalDays * DAY_MS).toISOString(),
    correct: (prev?.correct ?? 0) + (known ? 1 : 0),
    wrong: (prev?.wrong ?? 0) + (known ? 0 : 1),
    hidden: prev?.hidden ?? false,
    introducedAt: prev?.introducedAt ?? now.toISOString(),
  }
}
