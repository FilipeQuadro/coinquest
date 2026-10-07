import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assetFolders, coinQuestAssets, fallbackSpriteKeys, getLoadableAssets, resolveTextureKey, spriteKeys } from './assetManifest'

describe('asset manifest', () => {
  it('declares the expected sprite categories', () => {
    expect(Object.keys(assetFolders)).toEqual(['characters', 'furniture', 'tech', 'environment', 'effects', 'uiWorld'])
  })

  it('keeps the programmer sprite sheet spec aligned with the art bible', () => {
    const programmer = coinQuestAssets.programmer

    expect(programmer.kind).toBe('spritesheet')
    expect(programmer.frameWidth).toBe(48)
    expect(programmer.frameHeight).toBe(64)
  })

  it('loads character, object and environment art pack assets', () => {
    expect(getLoadableAssets().map((asset) => asset.id)).toEqual([
      'programmer',
      'workstationBase',
      'digitalVaultShell',
      'skyDay',
      'skyNight',
      'cityFarDay',
      'cityFarNight',
      'cityMidDay',
      'cityMidNight',
      'cityNearDay',
      'cityNearNight',
      'windowFrame',
      'wall',
      'floor',
      'plantPot',
      'ledgerShelf',
      'deskMug',
      'monthBoard',
    ])
  })

  it('resolves real textures when loaded and fallback textures otherwise', () => {
    expect(resolveTextureKey((key) => key === spriteKeys.workstationBase, 'workstationBase')).toBe(spriteKeys.workstationBase)
    expect(resolveTextureKey(() => false, 'workstationBase')).toBe(fallbackSpriteKeys.workstationBase)
    expect(resolveTextureKey((key) => key === spriteKeys.cityNearNight, 'cityNearNight')).toBe(spriteKeys.cityNearNight)
    expect(resolveTextureKey(() => false, 'cityNearNight')).toBe(fallbackSpriteKeys.cityNearNight)
  })

  it('ships every loadable asset as a PNG with the documented size', () => {
    const expectedSizes: Partial<Record<string, [number, number]>> = {
      programmer: [48 * 28, 64],
      digitalVaultShell: [120, 108],
      plantPot: [32, 44],
      ledgerShelf: [96, 52],
      deskMug: [14, 16],
      monthBoard: [64, 48],
    }

    for (const asset of getLoadableAssets()) {
      const file = readFileSync(`public${asset.src}`)
      expect(file.subarray(1, 4).toString('ascii'), asset.id).toBe('PNG')
      const size = [file.readUInt32BE(16), file.readUInt32BE(20)]
      const expected = expectedSizes[asset.id]
      if (expected) expect(size, asset.id).toEqual(expected)
      if (asset.kind === 'spritesheet') {
        expect(size[0] % asset.frameWidth, asset.id).toBe(0)
        expect(size[1] % asset.frameHeight, asset.id).toBe(0)
      }
    }
  })

  it('keeps texture keys unique and fallbacks distinct from real textures', () => {
    const keys = Object.values(spriteKeys)
    const fallbacks = Object.values(fallbackSpriteKeys)
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(fallbacks).size).toBe(fallbacks.length)
    expect(keys.some((key) => fallbacks.includes(key as never))).toBe(false)
    expect(Object.keys(fallbackSpriteKeys)).toEqual(Object.keys(spriteKeys))
  })
})
