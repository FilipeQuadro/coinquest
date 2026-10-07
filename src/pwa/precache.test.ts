import { describe, expect, it } from 'vitest'
import { hashedBuildAssetPattern } from './precache'

describe('PWA precache revisions', () => {
  it('treats hashed Vite build files as versioned', () => {
    for (const url of [
      'assets/index-D-ooSe23.js',
      'assets/index-CQYvMy3A.css',
      'assets/phaser-CUdU0QcG.js',
      'assets/workbox-window.prod.es5-Bd17z0YL.js',
    ]) expect(hashedBuildAssetPattern.test(url), url).toBe(true)
  })

  it('keeps revisions for stable-name game sprites so replaced art reaches installed apps', () => {
    for (const url of [
      'assets/characters/programmer.png',
      'assets/tech/digital-vault-shell.png',
      'assets/furniture/plant-pot.png',
      'assets/environment/sky-day.png',
    ]) expect(hashedBuildAssetPattern.test(url), url).toBe(false)
  })
})
