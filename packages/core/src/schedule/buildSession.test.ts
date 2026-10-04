import { describe, expect, it } from 'vitest'
import type { Card } from '../cards/types'
import { buildSession } from './buildSession'
import type { CardState } from './types'

const now = new Date('2026-05-10T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

function card(id: string, notePath = `${id}.md`): Card {
  return { id, question: id, answer: id, notePath, noteTitle: notePath, origin: 'callout' }
}

function state(cardId: string, overrides: Partial<CardState> = {}): CardState {
  return {
    cardId,
    stage: 0,
    intervalDays: 1,
    dueAt: new Date(now.getTime() - DAY_MS).toISOString(),
    correct: 1,
    wrong: 0,
    hidden: false,
    introducedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  }
}

function statesOf(...list: CardState[]): ReadonlyMap<string, CardState> {
  return new Map(list.map((s) => [s.cardId, s]))
}

function lcg(seed: number): () => number {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

const opts = { now, newLeftToday: 10, maxCards: 100, random: lcg(1) }
const ids = (cards: Card[]) => cards.map((c) => c.id)

describe('buildSession', () => {
  it('excludes hidden cards', () => {
    const cards = [card('a'), card('b')]
    const result = buildSession(cards, statesOf(state('a', { hidden: true })), opts)
    expect(ids(result)).toEqual(['b'])
  })

  it('excludes cards that are not due yet', () => {
    const future = new Date(now.getTime() + DAY_MS).toISOString()
    const result = buildSession([card('a')], statesOf(state('a', { dueAt: future })), opts)
    expect(result).toEqual([])
  })

  it('includes cards due exactly now', () => {
    const result = buildSession([card('a')], statesOf(state('a', { dueAt: now.toISOString() })), opts)
    expect(ids(result)).toEqual(['a'])
  })

  it('puts due cards before new ones', () => {
    const cards = [card('new1'), card('due1'), card('new2')]
    const result = buildSession(cards, statesOf(state('due1')), opts)
    expect(ids(result)[0]).toBe('due1')
    expect(ids(result).sort()).toEqual(['due1', 'new1', 'new2'])
  })

  it('orders due cards by error rate, then by overdue time', () => {
    const cards = [card('low'), card('high'), card('olderTie'), card('newerTie')]
    const states = statesOf(
      state('low', { correct: 9, wrong: 1 }),
      state('high', { correct: 1, wrong: 1 }),
      state('olderTie', { correct: 3, wrong: 0, dueAt: new Date(now.getTime() - 5 * DAY_MS).toISOString() }),
      state('newerTie', { correct: 3, wrong: 0, dueAt: new Date(now.getTime() - 2 * DAY_MS).toISOString() }),
    )
    expect(ids(buildSession(cards, states, opts))).toEqual(['high', 'low', 'olderTie', 'newerTie'])
  })

  it('limits new cards by newLeftToday', () => {
    const cards = [card('n1'), card('n2'), card('n3')]
    expect(buildSession(cards, new Map(), { ...opts, newLeftToday: 2 })).toHaveLength(2)
  })

  it('adds no new cards when newLeftToday is 0 or negative', () => {
    const cards = [card('n1'), card('d1')]
    const states = statesOf(state('d1'))
    expect(ids(buildSession(cards, states, { ...opts, newLeftToday: 0 }))).toEqual(['d1'])
    expect(ids(buildSession(cards, states, { ...opts, newLeftToday: -3 }))).toEqual(['d1'])
  })

  it('caps total at maxCards, keeping due first', () => {
    const cards = [card('n1'), card('d1'), card('d2'), card('n2')]
    const states = statesOf(state('d1'), state('d2'))
    const result = buildSession(cards, states, { ...opts, maxCards: 3 })
    expect(result).toHaveLength(3)
    expect(ids(result)).toEqual(expect.arrayContaining(['d1', 'd2']))
  })

  it('is deterministic for a deterministic random', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'].map((id) => card(id))
    const first = buildSession(cards, new Map(), { ...opts, random: lcg(7) })
    const second = buildSession(cards, new Map(), { ...opts, random: lcg(7) })
    expect(ids(first)).toEqual(ids(second))
  })

  it('does not mutate input', () => {
    const cards = [card('a'), card('b'), card('c')]
    const copy = [...cards]
    buildSession(cards, new Map(), opts)
    expect(cards).toEqual(copy)
  })

  it('avoids consecutive cards from the same note when possible', () => {
    const cards = [card('a1', 'A'), card('a2', 'A'), card('a3', 'A'), card('b1', 'B'), card('b2', 'B'), card('c1', 'C')]
    for (let seed = 1; seed <= 20; seed++) {
      const paths = buildSession(cards, new Map(), { ...opts, random: lcg(seed) }).map((c) => c.notePath)
      for (let i = 1; i < paths.length; i++) expect(paths[i]).not.toBe(paths[i - 1])
    }
  })

  it('finds an alternating arrangement when greedy by order would fail', () => {
    const cards = [card('a', 'A'), card('b1', 'B'), card('b2', 'B')]
    const paths = buildSession(cards, statesOf(state('a'), state('b1'), state('b2')), opts).map((c) => c.notePath)
    expect(paths).toEqual(['B', 'A', 'B'])
  })

  it('keeps due-before-new when notes differ', () => {
    const cards = [card('d1', 'A'), card('d2', 'B'), card('n1', 'C')]
    const result = buildSession(cards, statesOf(state('d1'), state('d2')), opts)
    expect(ids(result).slice(0, 2).sort()).toEqual(['d1', 'd2'])
  })

  it('falls back to same-note neighbours when only one note exists', () => {
    const cards = [card('a1', 'A'), card('a2', 'A')]
    expect(buildSession(cards, new Map(), opts)).toHaveLength(2)
  })
})
