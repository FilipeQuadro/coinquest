import { describe, expect, it, vi } from 'vitest'
import { createSecureUuidV4 } from './createSecureUuidV4'

const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function deterministicGetRandomValues(array: Uint8Array): Uint8Array {
  for (let index = 0; index < array.length; index += 1) {
    array[index] = index
  }
  return array
}

describe('createSecureUuidV4', () => {
  it('uses native crypto.randomUUID when available', () => {
    const randomUUID = vi.fn(() => '11111111-1111-4111-8111-111111111111')

    expect(createSecureUuidV4({
      randomUUID,
      getRandomValues: deterministicGetRandomValues,
    })).toBe('11111111-1111-4111-8111-111111111111')
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  it('falls back to crypto.getRandomValues and generates a valid UUID v4', () => {
    const uuid = createSecureUuidV4({ getRandomValues: deterministicGetRandomValues })

    expect(uuid).toMatch(uuidV4Pattern)
    expect(uuid[14]).toBe('4')
    expect(['8', '9', 'a', 'b']).toContain(uuid[19])
  })

  it('fails explicitly when no secure UUID API is available', () => {
    expect(() => createSecureUuidV4({})).toThrow('Secure UUID generation requires')
  })
})
