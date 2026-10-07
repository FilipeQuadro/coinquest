import { describe, expect, it } from 'vitest'
import { atmosphereMotion, atmospherePalette, resolveTimeOfDay, timeOfDayForHour } from './atmosphere'

describe('world atmosphere', () => {
  it('maps local hours to four phases', () => {
    expect([4, 5, 6, 7, 12, 16, 17, 18, 19, 23, 0].map(timeOfDayForHour)).toEqual([
      'night', 'dawn', 'dawn', 'day', 'day', 'day', 'dusk', 'dusk', 'night', 'night', 'night',
    ])
  })

  it('honors a valid timeOfDay override and ignores unknown values', () => {
    expect(resolveTimeOfDay('?timeOfDay=dusk', 12)).toBe('dusk')
    expect(resolveTimeOfDay('?timeOfDay=night', 12)).toBe('night')
    expect(resolveTimeOfDay('?timeOfDay=noon', 12)).toBe('day')
    expect(resolveTimeOfDay('', 2)).toBe('night')
  })

  it('only uses night textures at night', () => {
    expect(atmospherePalette('night').usesNightTextures).toBe(true)
    expect(['dawn', 'day', 'dusk'].map((phase) => atmospherePalette(phase as 'dawn').usesNightTextures)).toEqual([false, false, false])
  })

  it('keeps ambient light subtle so React UI stays readable', () => {
    for (const phase of ['dawn', 'day', 'dusk', 'night'] as const) {
      const palette = atmospherePalette(phase)
      expect(palette.timeOfDay).toBe(phase)
      expect(palette.lightShaftAlpha).toBeLessThanOrEqual(0.1)
      expect(palette.roomShadeAlpha).toBeLessThanOrEqual(0.15)
      expect(palette.skyTintAlpha).toBeLessThanOrEqual(0.35)
    }
  })

  it('disables ambient motion when reduced motion is preferred', () => {
    expect(atmosphereMotion(true)).toEqual({ reduced: true, parallaxStrength: 0, moteInterval: null, maxMotes: 0 })
    const full = atmosphereMotion(false)
    expect(full.parallaxStrength).toBeGreaterThan(0)
    expect(full.moteInterval).toBeGreaterThan(0)
    expect(full.maxMotes).toBeGreaterThan(0)
  })
})
