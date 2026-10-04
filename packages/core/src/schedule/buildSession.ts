import type { Card } from '../cards/types'
import type { CardState } from './types'

type SessionOptions = {
  now: Date
  newLeftToday: number
  maxCards: number
  random: () => number
}

type DueCard = { card: Card; errorRate: number; dueTime: number }

function errorRate(state: CardState): number {
  const answers = state.correct + state.wrong
  return answers === 0 ? 0 : state.wrong / answers
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const picked = result[j] as T
    result[j] = result[i] as T
    result[i] = picked
  }
  return result
}

function selectDue(cards: readonly Card[], states: ReadonlyMap<string, CardState>, nowTime: number): Card[] {
  const due: DueCard[] = []
  for (const card of cards) {
    const state = states.get(card.id)
    if (!state || state.hidden) continue
    const dueTime = Date.parse(state.dueAt)
    if (dueTime <= nowTime) due.push({ card, errorRate: errorRate(state), dueTime })
  }
  due.sort((a, b) => b.errorRate - a.errorRate || a.dueTime - b.dueTime)
  return due.map((entry) => entry.card)
}

function selectNew(cards: readonly Card[], states: ReadonlyMap<string, CardState>, random: () => number): Card[] {
  return shuffled(
    cards.filter((card) => !states.has(card.id)),
    random,
  )
}

function countByNote(cards: readonly Card[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const card of cards) counts.set(card.notePath, (counts.get(card.notePath) ?? 0) + 1)
  return counts
}

// A note holding more than half of the remaining cards must be placed now,
// otherwise its cards can no longer be kept apart.
function findCriticalNote(counts: ReadonlyMap<string, number>, remaining: number): string | undefined {
  for (const [notePath, count] of counts) {
    if (count * 2 > remaining) return notePath
  }
  return undefined
}

// Keeps the incoming priority order, only moving cards to avoid same-note neighbours.
function separateNotes(prioritized: readonly Card[]): Card[] {
  const rest = [...prioritized]
  const counts = countByNote(rest)
  const result: Card[] = []

  while (rest.length > 0) {
    const lastNote = result[result.length - 1]?.notePath
    const critical = findCriticalNote(counts, rest.length)
    const wanted = critical !== undefined && critical !== lastNote ? critical : undefined

    let index = rest.findIndex((card) => (wanted ? card.notePath === wanted : card.notePath !== lastNote))
    if (index === -1) index = 0

    const [card] = rest.splice(index, 1) as [Card]
    counts.set(card.notePath, (counts.get(card.notePath) ?? 1) - 1)
    result.push(card)
  }
  return result
}

export function buildSession(
  cards: Card[],
  states: ReadonlyMap<string, CardState>,
  opts: SessionOptions,
): Card[] {
  const visible = cards.filter((card) => !states.get(card.id)?.hidden)
  const newLimit = Math.max(0, opts.newLeftToday)
  const due = selectDue(visible, states, opts.now.getTime())
  const fresh = selectNew(visible, states, opts.random).slice(0, newLimit)
  const selected = [...due, ...fresh].slice(0, Math.max(0, opts.maxCards))

  return separateNotes(selected)
}
