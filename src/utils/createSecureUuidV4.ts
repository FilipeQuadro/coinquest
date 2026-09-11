type UuidCrypto = {
  randomUUID?: () => string
  getRandomValues?: (array: Uint8Array) => Uint8Array
}

const uuidBytesToHex = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, '0'))

export function createSecureUuidV4(cryptoSource: UuidCrypto = globalThis.crypto as unknown as UuidCrypto): string {
  if (typeof cryptoSource.randomUUID === 'function') return cryptoSource.randomUUID()
  if (typeof cryptoSource.getRandomValues !== 'function') {
    throw new Error('Secure UUID generation requires crypto.randomUUID() or crypto.getRandomValues().')
  }

  const bytes = cryptoSource.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  return [
    uuidBytesToHex[bytes[0]],
    uuidBytesToHex[bytes[1]],
    uuidBytesToHex[bytes[2]],
    uuidBytesToHex[bytes[3]],
    '-',
    uuidBytesToHex[bytes[4]],
    uuidBytesToHex[bytes[5]],
    '-',
    uuidBytesToHex[bytes[6]],
    uuidBytesToHex[bytes[7]],
    '-',
    uuidBytesToHex[bytes[8]],
    uuidBytesToHex[bytes[9]],
    '-',
    uuidBytesToHex[bytes[10]],
    uuidBytesToHex[bytes[11]],
    uuidBytesToHex[bytes[12]],
    uuidBytesToHex[bytes[13]],
    uuidBytesToHex[bytes[14]],
    uuidBytesToHex[bytes[15]],
  ].join('')
}
