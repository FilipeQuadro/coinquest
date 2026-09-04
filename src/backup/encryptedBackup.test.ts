import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { backupFormat, exportBackup, inspectBackup } from './backup'
import {
  decryptBackupPayload,
  encryptedBackupAlgorithm,
  encryptedBackupFormat,
  encryptedBackupKdf,
  encryptBackupPayload,
  isEncryptedBackupJson,
  protectedBackupFilename,
  type EncryptedBackupEnvelope,
} from './encryptedBackup'

const password = 'senha-forte-local'
const testIterations = 1_000

describe('encrypted backup envelope', () => {
  it('round-trips a backup payload with AES-GCM envelope metadata', async () => {
    const payload = await exportBackup()
    const encrypted = await encryptBackupPayload(payload, password, { iterations: testIterations })
    const envelope = JSON.parse(encrypted) as EncryptedBackupEnvelope

    expect(envelope).toMatchObject({
      format: encryptedBackupFormat,
      version: 1,
      encryption: {
        algorithm: encryptedBackupAlgorithm,
        kdf: encryptedBackupKdf,
        iterations: testIterations,
      },
      ciphertext: expect.any(String),
    })
    expect(isEncryptedBackupJson(encrypted)).toBe(true)
    expect(await decryptBackupPayload(encrypted, password)).toBe(payload)
  })

  it('rejects a wrong password without returning plaintext', async () => {
    const encrypted = await encryptBackupPayload(await exportBackup(), password, { iterations: testIterations })

    await expect(decryptBackupPayload(encrypted, 'senha-errada-local')).rejects.toThrow('Nao foi possivel abrir')
  })

  it('rejects tampered ciphertext', async () => {
    const encrypted = await encryptBackupPayload(await exportBackup(), password, { iterations: testIterations })
    const envelope = JSON.parse(encrypted) as EncryptedBackupEnvelope
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -4)}AAAA`

    await expect(decryptBackupPayload(JSON.stringify(envelope), password)).rejects.toThrow('Nao foi possivel abrir')
  })

  it('creates different ciphertext, salt and iv for the same payload and password', async () => {
    const payload = await exportBackup()
    const first = JSON.parse(await encryptBackupPayload(payload, password, { iterations: testIterations })) as EncryptedBackupEnvelope
    const second = JSON.parse(await encryptBackupPayload(payload, password, { iterations: testIterations })) as EncryptedBackupEnvelope

    expect(first.encryption.salt).not.toBe(second.encryption.salt)
    expect(first.encryption.iv).not.toBe(second.encryption.iv)
    expect(first.ciphertext).not.toBe(second.ciphertext)
  })

  it('does not expose password or financial plaintext in the envelope', async () => {
    const payload = JSON.stringify({
      format: backupFormat,
      appData: {
        transactions: [{ description: 'Salario secreto' }],
      },
    })
    const encrypted = await encryptBackupPayload(payload, password, { iterations: testIterations })

    expect(encrypted).not.toContain(password)
    expect(encrypted).not.toContain('Salario secreto')
    expect(encrypted).not.toContain(backupFormat)
  })

  it('decrypts to a payload that still passes backup inspection', async () => {
    const payload = await exportBackup()
    const encrypted = await encryptBackupPayload(payload, password, { iterations: testIterations })
    const decrypted = await decryptBackupPayload(encrypted, password)
    const inspection = await inspectBackup(decrypted)

    expect(inspection).toMatchObject({
      valid: true,
      formatVersion: 2,
      integrityStatus: 'verified',
    })
  })

  it('creates a distinct protected backup filename', () => {
    expect(protectedBackupFilename(new Date(2026, 8, 4, 12))).toBe('coinquest-backup-protected-2026-09-04.json')
  })
})
