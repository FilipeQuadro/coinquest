export const encryptedBackupFormat = 'coinquest-encrypted-backup'
export const encryptedBackupVersion = 1
export const encryptedBackupAlgorithm = 'AES-GCM'
export const encryptedBackupKdf = 'PBKDF2-SHA256'
export const encryptedBackupIterations = 120_000
export const minimumBackupPasswordLength = 8

const saltBytes = 16
const ivBytes = 12

export interface EncryptedBackupEnvelope {
  format: typeof encryptedBackupFormat
  version: typeof encryptedBackupVersion
  encryption: {
    algorithm: typeof encryptedBackupAlgorithm
    kdf: typeof encryptedBackupKdf
    iterations: number
    salt: string
    iv: string
  }
  ciphertext: string
}

export interface EncryptBackupOptions {
  iterations?: number
}

function assertCryptoAvailable() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw new Error('Web Crypto nao esta disponivel neste ambiente.')
  }
}

function assertPassword(password: string) {
  if (password.length < minimumBackupPasswordLength) {
    throw new Error(`A senha deve ter pelo menos ${minimumBackupPasswordLength} caracteres.`)
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: bytesToArrayBuffer(salt),
      iterations,
    },
    material,
    { name: encryptedBackupAlgorithm, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function parseEnvelope(json: string): EncryptedBackupEnvelope {
  let parsed: unknown

  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Arquivo JSON invalido.')
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Envelope de backup protegido invalido.')
  }

  const envelope = parsed as EncryptedBackupEnvelope
  if (envelope.format !== encryptedBackupFormat) throw new Error('Formato de backup protegido invalido.')
  if (envelope.version !== encryptedBackupVersion) throw new Error('Versao de backup protegido nao suportada.')
  if (envelope.encryption?.algorithm !== encryptedBackupAlgorithm || envelope.encryption.kdf !== encryptedBackupKdf) {
    throw new Error('Criptografia do backup protegido nao suportada.')
  }
  if (!Number.isInteger(envelope.encryption.iterations) || envelope.encryption.iterations <= 0) {
    throw new Error('Parametros de criptografia invalidos.')
  }
  if (typeof envelope.encryption.salt !== 'string' || typeof envelope.encryption.iv !== 'string' || typeof envelope.ciphertext !== 'string') {
    throw new Error('Envelope de backup protegido invalido.')
  }

  return envelope
}

export function isEncryptedBackupJson(json: string) {
  try {
    const parsed = JSON.parse(json) as { format?: unknown }
    return parsed?.format === encryptedBackupFormat
  } catch {
    return false
  }
}

export async function encryptBackupPayload(payloadJson: string, password: string, options: EncryptBackupOptions = {}) {
  assertCryptoAvailable()
  assertPassword(password)

  const salt = crypto.getRandomValues(new Uint8Array(saltBytes))
  const iv = crypto.getRandomValues(new Uint8Array(ivBytes))
  const iterations = options.iterations ?? encryptedBackupIterations
  const key = await deriveKey(password, salt, iterations)
  const encrypted = await crypto.subtle.encrypt(
    { name: encryptedBackupAlgorithm, iv: bytesToArrayBuffer(iv) },
    key,
    new TextEncoder().encode(payloadJson),
  )

  const envelope: EncryptedBackupEnvelope = {
    format: encryptedBackupFormat,
    version: encryptedBackupVersion,
    encryption: {
      algorithm: encryptedBackupAlgorithm,
      kdf: encryptedBackupKdf,
      iterations,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
    },
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  }

  return JSON.stringify(envelope, null, 2)
}

export async function decryptBackupPayload(envelopeJson: string, password: string) {
  assertCryptoAvailable()
  assertPassword(password)

  try {
    const envelope = parseEnvelope(envelopeJson)
    const salt = base64ToBytes(envelope.encryption.salt)
    const iv = base64ToBytes(envelope.encryption.iv)
    const ciphertext = base64ToBytes(envelope.ciphertext)
    const key = await deriveKey(password, salt, envelope.encryption.iterations)
    const decrypted = await crypto.subtle.decrypt(
      { name: encryptedBackupAlgorithm, iv: bytesToArrayBuffer(iv) },
      key,
      ciphertext,
    )

    return new TextDecoder().decode(decrypted)
  } catch {
    throw new Error('Nao foi possivel abrir o backup. Verifique a senha ou a integridade do arquivo.')
  }
}

export function protectedBackupFilename(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `coinquest-backup-protected-${year}-${month}-${day}.json`
}
