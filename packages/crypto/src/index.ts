import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16  // 128-bit auth tag

export interface EncryptResult {
  ciphertext: string  // hex-encoded
  iv: string          // hex-encoded
  tag: string         // hex-encoded
}

/**
 * Encrypts an arbitrary JSON-serialisable value with AES-256-GCM.
 * @param value  The plaintext value (will be JSON-stringified)
 * @param keyHex 32-byte key as a hex string (64 hex chars)
 */
export function encrypt(value: unknown, keyHex: string): EncryptResult {
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes (64 hex chars)')

  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })

  const plaintext = JSON.stringify(value)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    ciphertext: ciphertext.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  }
}

/**
 * Decrypts a value encrypted with `encrypt`.
 * @param ciphertext Hex-encoded ciphertext
 * @param iv         Hex-encoded IV
 * @param tag        Hex-encoded auth tag
 * @param keyHex     32-byte key as a hex string
 */
export function decrypt<T = unknown>(
  ciphertext: string,
  iv: string,
  tag: string,
  keyHex: string,
): T {
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes (64 hex chars)')

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'), {
    authTagLength: TAG_LENGTH,
  })
  decipher.setAuthTag(Buffer.from(tag, 'hex'))

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ])

  return JSON.parse(plaintext.toString('utf8')) as T
}
