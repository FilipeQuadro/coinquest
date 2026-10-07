export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night'

export interface AtmospherePalette {
  timeOfDay: TimeOfDay
  /** Night textures and night-tuned entity glows. */
  usesNightTextures: boolean
  cameraBackground: string
  skyTint: number
  skyTintAlpha: number
  glassColor: number
  glassAlpha: number
  windowLight: number
  windowLightAlpha: number
  lightShaftColor: number
  lightShaftAlpha: number
  roomShade: number
  roomShadeAlpha: number
  moteColor: number
  moteAlpha: number
  showStars: boolean
}

export interface AtmosphereMotion {
  reduced: boolean
  /** Multiplier for ambient parallax sway and pointer parallax. */
  parallaxStrength: number
  /** Milliseconds between ambient motes; null disables them. */
  moteInterval: number | null
  maxMotes: number
}

const timeOfDayValues: readonly TimeOfDay[] = ['dawn', 'day', 'dusk', 'night']

export function timeOfDayForHour(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 7) return 'dawn'
  if (hour >= 7 && hour < 17) return 'day'
  if (hour >= 17 && hour < 19) return 'dusk'
  return 'night'
}

/** `?timeOfDay=` keeps a deterministic phase for screenshots and E2E. */
export function resolveTimeOfDay(search: string, hour: number): TimeOfDay {
  const forced = new URLSearchParams(search).get('timeOfDay')
  if (forced && (timeOfDayValues as readonly string[]).includes(forced)) return forced as TimeOfDay
  return timeOfDayForHour(hour)
}

const palettes: Record<TimeOfDay, Omit<AtmospherePalette, 'timeOfDay'>> = {
  dawn: {
    usesNightTextures: false,
    cameraBackground: '#c9a7c4',
    skyTint: 0xffa7b5,
    skyTintAlpha: 0.22,
    glassColor: 0xffe1d6,
    glassAlpha: 0.12,
    windowLight: 0xffc9a0,
    windowLightAlpha: 0.1,
    lightShaftColor: 0xffd2a8,
    lightShaftAlpha: 0.07,
    roomShade: 0x2a1f3d,
    roomShadeAlpha: 0.08,
    moteColor: 0xfff0d8,
    moteAlpha: 0.22,
    showStars: false,
  },
  day: {
    usesNightTextures: false,
    cameraBackground: '#78b9d8',
    skyTint: 0xffffff,
    skyTintAlpha: 0,
    glassColor: 0xd7f2ff,
    glassAlpha: 0.14,
    windowLight: 0xfff0b0,
    windowLightAlpha: 0.1,
    lightShaftColor: 0xfff3c4,
    lightShaftAlpha: 0.06,
    roomShade: 0x0b1020,
    roomShadeAlpha: 0,
    moteColor: 0xffffff,
    moteAlpha: 0.18,
    showStars: false,
  },
  dusk: {
    usesNightTextures: false,
    cameraBackground: '#b9786a',
    skyTint: 0xff8a4c,
    skyTintAlpha: 0.3,
    glassColor: 0xffc69c,
    glassAlpha: 0.14,
    windowLight: 0xffa66b,
    windowLightAlpha: 0.12,
    lightShaftColor: 0xffb27a,
    lightShaftAlpha: 0.08,
    roomShade: 0x24163a,
    roomShadeAlpha: 0.14,
    moteColor: 0xffd9a8,
    moteAlpha: 0.24,
    showStars: true,
  },
  night: {
    usesNightTextures: true,
    cameraBackground: '#091125',
    skyTint: 0x0b1020,
    skyTintAlpha: 0,
    glassColor: 0x14294a,
    glassAlpha: 0.18,
    windowLight: 0x42d9f4,
    windowLightAlpha: 0.04,
    lightShaftColor: 0x6fa8ff,
    lightShaftAlpha: 0.035,
    roomShade: 0x050814,
    roomShadeAlpha: 0.1,
    moteColor: 0x68ffda,
    moteAlpha: 0.35,
    showStars: true,
  },
}

export function atmospherePalette(timeOfDay: TimeOfDay): AtmospherePalette {
  return { timeOfDay, ...palettes[timeOfDay] }
}

export function atmosphereMotion(reduced: boolean): AtmosphereMotion {
  if (reduced) return { reduced: true, parallaxStrength: 0, moteInterval: null, maxMotes: 0 }
  return { reduced: false, parallaxStrength: 1, moteInterval: 700, maxMotes: 14 }
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
