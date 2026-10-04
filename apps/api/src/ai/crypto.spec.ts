import { randomBytes } from 'node:crypto'
import { decryptKey, encryptKey } from './crypto'

const secret = randomBytes(32).toString('base64')

describe('key crypto', () => {
  it('round-trips and does not store the plaintext', () => {
    const record = encryptKey('AIza-secret-key', secret)

    expect(JSON.stringify(record)).not.toContain('AIza-secret-key')
    expect(decryptKey(record, secret)).toBe('AIza-secret-key')
  })

  it('uses a fresh IV for every encryption', () => {
    expect(encryptKey('same', secret).iv).not.toBe(encryptKey('same', secret).iv)
  })

  it('fails on a wrong secret or a tampered ciphertext', () => {
    const record = encryptKey('key', secret)
    const tampered = { ...record, ciphertext: Buffer.from('x'.repeat(3)).toString('base64') }

    expect(() => decryptKey(record, randomBytes(32).toString('base64'))).toThrow()
    expect(() => decryptKey(tampered, secret)).toThrow()
  })

  it('rejects a secret that is not 32 bytes', () => {
    expect(() => encryptKey('key', Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/)
  })
})
