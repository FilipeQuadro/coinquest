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
    ])
  })

  it('resolves real textures when loaded and fallback textures otherwise', () => {
    expect(resolveTextureKey((key) => key === spriteKeys.workstationBase, 'workstationBase')).toBe(spriteKeys.workstationBase)
    expect(resolveTextureKey(() => false, 'workstationBase')).toBe(fallbackSpriteKeys.workstationBase)
    expect(resolveTextureKey((key) => key === spriteKeys.cityNearNight, 'cityNearNight')).toBe(spriteKeys.cityNearNight)
    expect(resolveTextureKey(() => false, 'cityNearNight')).toBe(fallbackSpriteKeys.cityNearNight)
  })
})
