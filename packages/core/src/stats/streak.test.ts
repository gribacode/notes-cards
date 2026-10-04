import { describe, expect, it } from 'vitest'
import { streak } from './streak'

describe('streak', () => {
  it('is zero without activity', () => {
    expect(streak([], '2026-03-10')).toEqual({ current: 0, best: 0 })
  })

  it('counts a run ending today', () => {
    expect(streak(['2026-03-08', '2026-03-09', '2026-03-10'], '2026-03-10')).toEqual({ current: 3, best: 3 })
  })

  it('does not break the streak while today is still inactive', () => {
    expect(streak(['2026-03-08', '2026-03-09'], '2026-03-10')).toEqual({ current: 2, best: 2 })
  })

  it('is zero when the last active day is older than yesterday', () => {
    expect(streak(['2026-03-05', '2026-03-06'], '2026-03-10')).toEqual({ current: 0, best: 2 })
  })

  it('finds best run anywhere', () => {
    const days = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-09', '2026-03-10']
    expect(streak(days, '2026-03-10')).toEqual({ current: 2, best: 3 })
  })

  it('handles unsorted input with duplicates', () => {
    const days = ['2026-03-10', '2026-03-08', '2026-03-09', '2026-03-10', '2026-03-08']
    expect(streak(days, '2026-03-10')).toEqual({ current: 3, best: 3 })
  })

  it('crosses month and year boundaries', () => {
    const days = ['2025-12-30', '2025-12-31', '2026-01-01', '2026-02-28', '2026-03-01']
    expect(streak(days, '2026-01-01')).toEqual({ current: 3, best: 3 })
    expect(streak(['2026-02-28', '2026-03-01'], '2026-03-01').best).toBe(2)
    expect(streak(['2028-02-28', '2028-03-01'], '2028-03-01').best).toBe(1)
    expect(streak(['2028-02-28', '2028-02-29', '2028-03-01'], '2028-03-01')).toEqual({ current: 3, best: 3 })
  })
})
