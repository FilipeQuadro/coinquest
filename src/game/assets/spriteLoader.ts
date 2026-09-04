import Phaser from 'phaser'
import { getLoadableAssets, resolveTextureKey, type SpriteId } from './assetManifest'
import { ensureCoinQuestFallbackTextures } from './proceduralSprites'

export function preloadCoinQuestSprites(scene: Phaser.Scene) {
  getLoadableAssets().forEach((asset) => {
    if (!asset.src) return

    if (asset.kind === 'image') {
      scene.load.image(asset.key, asset.src)
      return
    }

    if (asset.kind === 'spritesheet') {
      scene.load.spritesheet(asset.key, asset.src, {
        frameWidth: asset.frameWidth,
        frameHeight: asset.frameHeight,
      })
      return
    }

    if (asset.kind === 'atlas' && asset.atlasJson) {
      scene.load.atlas(asset.key, asset.src, asset.atlasJson)
    }
  })
}

export function ensureSpriteFallbacks(scene: Phaser.Scene) {
  ensureCoinQuestFallbackTextures(scene)
}

export function getTextureKey(scene: Phaser.Scene, id: SpriteId) {
  return resolveTextureKey((key) => scene.textures.exists(key), id)
}

