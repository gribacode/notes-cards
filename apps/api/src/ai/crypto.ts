import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const SECRET_BYTES = 32
const IV_BYTES = 12

export interface EncryptedKey {
  ciphertext: string
  iv: string
  authTag: string
}

function secretBuffer(secret: string): Buffer {
  const buffer = Buffer.from(secret, 'base64')
  if (buffer.length !== SECRET_BYTES) throw new Error(`AI_KEY_SECRET must decode to ${SECRET_BYTES} bytes`)
  return buffer
}

export function encryptKey(plain: string, secret: string): EncryptedKey {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, secretBuffer(secret), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  }
}

export function decryptKey(record: EncryptedKey, secret: string): string {
  const decipher = createDecipheriv(ALGORITHM, secretBuffer(secret), Buffer.from(record.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(record.authTag, 'base64'))
  const plain = Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64')), decipher.final()])
  return plain.toString('utf8')
}
