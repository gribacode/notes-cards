import { describe, expect, it } from 'vitest'
import { CORE_NAME } from './index'

describe('core', () => {
  it('exports its package name', () => {
    expect(CORE_NAME).toBe('@notes-cards/core')
  })
})
