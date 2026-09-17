import Phaser from 'phaser'
import type { FinancialHealth } from '../../finance/health/financialHealth'
import type { WorldProgressionState, WorldProgressionTier } from '../../finance/world/worldProgression'
import { getTextureKey } from '../assets/spriteLoader'

export class DigitalVault {
  readonly container: Phaser.GameObjects.Container

  private core: Phaser.GameObjects.Rectangle
  private worldAura: Phaser.GameObjects.Ellipse
  private glow: Phaser.GameObjects.Ellipse
  private bars: Phaser.GameObjects.Rectangle[]
  private ring: Phaser.GameObjects.Arc
  private statusLight: Phaser.GameObjects.Rectangle
  private readonly baseScale = 1.14
  private currentLevel: FinancialHealth['level'] = 'unknown'

  constructor(private readonly scene: Phaser.Scene, x: number, y: number) {
    this.container = scene.add.container(x, y)

    const shadow = scene.add.ellipse(0, 53, 128, 18, 0x050711, 0.42)
    this.worldAura = scene.add.ellipse(0, -8, 160, 136, 0x42d9f4, 0.05)
    this.glow = scene.add.ellipse(0, -8, 138, 122, 0x35d8ff, 0.12)
    const glowDisk = scene.add.image(0, -10, getTextureKey(scene, 'softGlow')).setScale(2.5, 2.2).setAlpha(0.55)
    const shell = scene.add.image(0, 0, getTextureKey(scene, 'digitalVaultShell'))
    this.ring = scene.add.circle(0, -7, 38, 0x0a1425, 0).setStrokeStyle(6, 0x35d8ff, 0.72)
    this.core = scene.add.rectangle(0, -7, 54, 40, 0x07101f).setStrokeStyle(3, 0x62f1ff)
    const display = scene.add.rectangle(0, 29, 38, 10, 0x0a1020).setStrokeStyle(2, 0x42557f)
    const displayPixelA = scene.add.rectangle(-11, 29, 8, 4, 0x68ff9a)
    const displayPixelB = scene.add.rectangle(4, 29, 8, 4, 0x42d9f4)
    const displayPixelC = scene.add.rectangle(17, 29, 5, 4, 0xf3cf64)
    this.statusLight = scene.add.rectangle(0, -67, 20, 8, 0x68ff9a)

    this.bars = [-17, 0, 17].map((xOffset, index) =>
      scene.add.rectangle(xOffset, -6 + index * 8, 22, 4, index === 1 ? 0x68ff9a : 0x35d8ff),
    )

    this.container.add([
      shadow,
      this.worldAura,
      this.glow,
      glowDisk,
      shell,
      this.ring,
      this.core,
      display,
      displayPixelA,
      displayPixelB,
      displayPixelC,
      this.statusLight,
      ...this.bars,
    ])
    this.container.setScale(this.baseScale)

    scene.tweens.add({
      targets: this.glow,
      alpha: 0.32,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })

    scene.tweens.add({
      targets: [this.statusLight, displayPixelA, displayPixelB, displayPixelC],
      alpha: 0.35,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Stepped',
    })

    this.applyFinancialHealthLevel('unknown')
  }

  reactIncome() {
    this.core.setStrokeStyle(3, 0x9dffb6)
    this.ring.setStrokeStyle(5, 0xf3cf64, 0.9)
    this.statusLight.setFillStyle(0xf3cf64)
    this.flashBars(0xf3cf64)

    this.scene.tweens.add({
      targets: this.container,
      scaleX: this.baseScale * 1.14,
      scaleY: this.baseScale * 1.14,
      duration: 120,
      yoyo: true,
      repeat: 2,
      ease: 'Quad.out',
      onComplete: () => {
        this.container.setScale(this.baseScale)
        this.applyFinancialHealthLevel(this.currentLevel)
      },
    })
  }

  reactExpense() {
    this.core.setStrokeStyle(3, 0xff756f)
    this.ring.setStrokeStyle(5, 0xff786f, 0.85)
    this.statusLight.setFillStyle(0xffa45b)
    this.flashBars(0xff756f)

    this.scene.tweens.add({
      targets: this.container,
      x: this.container.x + 4,
      angle: -2,
      duration: 90,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.inOut',
      onComplete: () => {
        this.container.setAngle(0)
        this.container.setScale(this.baseScale)
        this.applyFinancialHealthLevel(this.currentLevel)
      },
    })
  }

  reactGoalCompleted() {
    this.core.setStrokeStyle(3, 0xf3cf64)
    this.ring.setStrokeStyle(6, 0x35d8ff, 0.95)
    this.statusLight.setFillStyle(0xf3cf64)
    this.flashBars(0xf3cf64)

    this.scene.tweens.add({
      targets: this.container,
      scaleX: this.baseScale * 1.2,
      scaleY: this.baseScale * 1.2,
      angle: 2,
      duration: 150,
      yoyo: true,
      repeat: 2,
      ease: 'Quad.out',
      onComplete: () => {
        this.container.setAngle(0)
        this.container.setScale(this.baseScale)
        this.applyFinancialHealthLevel(this.currentLevel)
      },
    })
  }

  setFinancialHealth(health: FinancialHealth) {
    this.currentLevel = health.level
    this.applyFinancialHealthLevel(health.level)
  }

  setWorldProgression(progression: Pick<WorldProgressionState, 'tier'>) {
    const style = this.getWorldTierStyle(progression.tier)
    this.worldAura.setFillStyle(style.color, style.alpha)
    this.worldAura.setScale(style.scale)
  }

  private applyFinancialHealthLevel(level: FinancialHealth['level']) {
    const style = this.getLevelStyle(level)
    this.core.setStrokeStyle(3, style.core)
    this.ring.setStrokeStyle(5, style.ring, style.ringAlpha)
    this.statusLight.setFillStyle(style.status)
    this.glow.setFillStyle(style.glow, style.glowAlpha)
    this.bars.forEach((bar, index) => {
      const active = index < style.activeBars
      bar.setFillStyle(active ? style.status : 0x263656, active ? 0.9 : 0.5)
      bar.setScale(1, active ? 1 : 0.65)
    })
  }

  private getLevelStyle(level: FinancialHealth['level']) {
    const styles = {
      unknown: { core: 0x7f8aa8, ring: 0x7f8aa8, status: 0x7f8aa8, glow: 0x42d9f4, ringAlpha: 0.42, glowAlpha: 0.1, activeBars: 1 },
      excellent: { core: 0xf3cf64, ring: 0xf3cf64, status: 0x69e697, glow: 0xf3cf64, ringAlpha: 0.9, glowAlpha: 0.2, activeBars: 3 },
      healthy: { core: 0x69e697, ring: 0x35d8ff, status: 0x69e697, glow: 0x35d8ff, ringAlpha: 0.78, glowAlpha: 0.16, activeBars: 3 },
      attention: { core: 0xffd36f, ring: 0xffd36f, status: 0xffd36f, glow: 0xffd36f, ringAlpha: 0.68, glowAlpha: 0.13, activeBars: 2 },
      tight: { core: 0x7fb2ff, ring: 0x7fb2ff, status: 0xffd36f, glow: 0x7fb2ff, ringAlpha: 0.52, glowAlpha: 0.1, activeBars: 1 },
      critical: { core: 0xff786f, ring: 0xff786f, status: 0xffa45b, glow: 0xff786f, ringAlpha: 0.6, glowAlpha: 0.12, activeBars: 1 },
    } satisfies Record<FinancialHealth['level'], {
      core: number
      ring: number
      status: number
      glow: number
      ringAlpha: number
      glowAlpha: number
      activeBars: number
    }>

    return styles[level]
  }

  private getWorldTierStyle(tier: WorldProgressionTier) {
    const styles = {
      starter: { color: 0x7f8aa8, alpha: 0.04, scale: 0.92 },
      stable: { color: 0x42d9f4, alpha: 0.08, scale: 1 },
      focused: { color: 0x7f67d8, alpha: 0.12, scale: 1.05 },
      thriving: { color: 0xf3cf64, alpha: 0.16, scale: 1.12 },
    } satisfies Record<WorldProgressionTier, { color: number; alpha: number; scale: number }>

    return styles[tier]
  }

  private flashBars(color: number) {
    this.bars.forEach((bar) => bar.setFillStyle(color))
    this.scene.time.delayedCall(520, () => {
      this.bars.forEach((bar, index) => bar.setFillStyle(index === 1 ? 0x68ff9a : 0x35d8ff))
    })
  }
}
