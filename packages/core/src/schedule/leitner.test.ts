import { describe, expect, it } from 'vitest'
import { applyAnswer } from './leitner'
import type { CardState } from './types'

const DAY_MS = 24 * 60 * 60 * 1000
const start = new Date('2026-01-01T10:00:00.000Z')

function answerKnownTimes(times: number): CardState {
  let state: CardState | undefined
  for (let i = 0; i < times; i++) {
    state = applyAnswer(state, 'c1', true, new Date(start.getTime() + i * DAY_MS))
  }
  if (!state) throw new Error('times must be positive')
  return state
}

describe('applyAnswer', () => {
  it('first known answer gives stage 0, 1 day, due in a day', () => {
    const state = applyAnswer(undefined, 'c1', true, start)
    expect(state).toEqual({
      cardId: 'c1',
      stage: 0,
      intervalDays: 1,
      dueAt: new Date(start.getTime() + DAY_MS).toISOString(),
      correct: 1,
      wrong: 0,
      hidden: false,
      introducedAt: start.toISOString(),
    })
  })

  it('first unknown answer gives stage 0, 1 day', () => {
    const state = applyAnswer(undefined, 'c1', false, start)
    expect(state).toMatchObject({ stage: 0, intervalDays: 1, correct: 0, wrong: 1 })
  })

  it('climbs 1 -> 3 -> 7 -> 21 -> 60 -> 120 -> 240', () => {
    const intervals = [1, 2, 3, 4, 5, 6, 7].map((n) => answerKnownTimes(n).intervalDays)
    expect(intervals).toEqual([1, 3, 7, 21, 60, 120, 240])
  })

  it('stage is the ladder index and stays 4 past the ladder', () => {
    const stages = [1, 2, 3, 4, 5, 6, 7].map((n) => answerKnownTimes(n).stage)
    expect(stages).toEqual([0, 1, 2, 3, 4, 4, 4])
  })

  it('sets dueAt from the interval', () => {
    const state = answerKnownTimes(3)
    const answeredAt = start.getTime() + 2 * DAY_MS
    expect(state.dueAt).toBe(new Date(answeredAt + 7 * DAY_MS).toISOString())
  })

  it('unknown resets to stage 0 and 1 day', () => {
    const state = applyAnswer(answerKnownTimes(4), 'c1', false, start)
    expect(state).toMatchObject({ stage: 0, intervalDays: 1, correct: 4, wrong: 1 })
  })

  it('unknown after 120 days resets to 1', () => {
    const state = applyAnswer(answerKnownTimes(6), 'c1', false, start)
    expect(state.intervalDays).toBe(1)
    expect(state.stage).toBe(0)
  })

  it('keeps introducedAt from the first answer', () => {
    const first = applyAnswer(undefined, 'c1', true, start)
    const later = applyAnswer(first, 'c1', true, new Date(start.getTime() + 5 * DAY_MS))
    expect(later.introducedAt).toBe(start.toISOString())
  })

  it('preserves hidden from prev', () => {
    const prev = { ...applyAnswer(undefined, 'c1', true, start), hidden: true }
    expect(applyAnswer(prev, 'c1', true, start).hidden).toBe(true)
  })
})
