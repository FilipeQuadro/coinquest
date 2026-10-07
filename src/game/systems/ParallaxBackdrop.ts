import Phaser from 'phaser'
import { getTextureKey } from '../assets/spriteLoader'
import type { AtmosphereMotion, AtmospherePalette } from './atmosphere'

// Horizontal travel per layer, from far to near; nearer layers move more to read as depth.
const layerSway = [14, 4, 7, 10] as const
const layerPointerTravel = [6, 4, 9, 16] as const

export class ParallaxBackdrop {
  private sky: Phaser.GameObjects.Container
  private clouds: Phaser.GameObjects.Container
  private distantCity: Phaser.GameObjects.Container
  private midCity: Phaser.GameObjects.Container
  private nearCity: Phaser.GameObjects.Container
  private pointerOffset = 0
  private readonly isNight: boolean

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly palette: AtmospherePalette,
    private readonly motion: AtmosphereMotion,
    width: number,
    height: number,
  ) {
    this.isNight = palette.usesNightTextures
    this.sky = scene.add.container(0, 0)
    this.clouds = scene.add.container(0, 0)
    this.distantCity = scene.add.container(0, 0)
    this.midCity = scene.add.container(0, 0)
    this.nearCity = scene.add.container(0, 0)
    this.sky.setDepth(0)
    this.clouds.setDepth(0.1)
    this.distantCity.setDepth(0.2)
    this.midCity.setDepth(0.3)
    this.nearCity.setDepth(0.4)

    this.drawSky(width, height)
    this.drawClouds()
    this.drawCity(width)
    this.drawSkyTint(width)
  }

  update(time: number) {
    const strength = this.motion.parallaxStrength
    if (strength === 0) return

    const pointer = this.scene.input.activePointer
    const width = this.scene.scale.width || 1
    // Only follow the pointer while it is over the canvas; otherwise drift back to center.
    const target = pointer && pointer.isDown === false && pointer.x > 0 && pointer.x < width ? (pointer.x / width) * 2 - 1 : 0
    this.pointerOffset = Phaser.Math.Linear(this.pointerOffset, target, 0.04)

    const layers = [this.clouds, this.distantCity, this.midCity, this.nearCity]
    const speeds = [0.00012, 0.00016, 0.0002, 0.00025]
    layers.forEach((layer, index) => {
      layer.x = (Math.sin(time * speeds[index]) * layerSway[index] - this.pointerOffset * layerPointerTravel[index]) * strength
    })
  }

  private drawSky(width: number, height: number) {
    const sky = this.scene.add.image(width / 2, height / 2, getTextureKey(this.scene, this.isNight ? 'skyNight' : 'skyDay'))
    this.sky.add(sky)

    if (!this.palette.showStars) return

    const starCount = this.isNight ? 18 : 7
    const starAlpha = this.isNight ? 0.45 : 0.3
    for (let i = 0; i < starCount; i++) {
      const star = this.scene.add.rectangle(
        Phaser.Math.Between(24, width - 24),
        Phaser.Math.Between(16, this.isNight ? 165 : 90),
        i % 5 === 0 ? 2 : 1,
        i % 5 === 0 ? 2 : 1,
        i % 3 === 0 ? 0xfff0a8 : 0xcbd8ff,
        starAlpha,
      )
      this.sky.add(star)
      if (i % 3 === 0 && !this.motion.reduced) {
        this.scene.tweens.add({
          targets: star,
          alpha: 0.12,
          duration: Phaser.Math.Between(1000, 2200),
          yoyo: true,
          repeat: -1,
          delay: Phaser.Math.Between(0, 900),
        })
      }
    }
  }

  private drawSkyTint(width: number) {
    if (this.palette.skyTintAlpha <= 0) return

    // Warm wash over sky and skyline only; the room shell above it stays untinted.
    const tint = this.scene.add.rectangle(width / 2, 190, width, 380, this.palette.skyTint, this.palette.skyTintAlpha)
    const horizon = this.scene.add.rectangle(width / 2, 300, width, 70, this.palette.lightShaftColor, this.palette.skyTintAlpha * 0.6)
    tint.setDepth(0.45)
    horizon.setDepth(0.45)
  }

  private drawClouds() {
    if (this.isNight) return

    const alpha = this.palette.timeOfDay === 'day' ? 1 : 0.8
    this.addCloud(120, 96, 0.2 * alpha)
    this.addCloud(350, 138, 0.14 * alpha)
    this.addCloud(690, 120, 0.13 * alpha)
  }

  private addCloud(x: number, y: number, alpha: number) {
    const cloud = this.scene.add.container(x, y)
    const color = this.palette.timeOfDay === 'day' ? 0xffffff : this.palette.windowLight
    cloud.add([
      this.scene.add.rectangle(0, 8, 90, 18, color, alpha),
      this.scene.add.rectangle(22, 0, 48, 22, color, alpha),
      this.scene.add.rectangle(-22, 2, 40, 20, color, alpha),
      this.scene.add.rectangle(52, 11, 34, 14, color, alpha * 0.8),
    ])
    this.clouds.add(cloud)

    if (this.motion.reduced) return
    this.scene.tweens.add({
      targets: cloud,
      x: x + 35,
      duration: Phaser.Math.Between(7000, 11000),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })
  }

  private drawCity(width: number) {
    const far = this.scene.add.image(width / 2, 334, getTextureKey(this.scene, this.isNight ? 'cityFarNight' : 'cityFarDay')).setOrigin(0.5, 1)
    const mid = this.scene.add.image(width / 2, 356, getTextureKey(this.scene, this.isNight ? 'cityMidNight' : 'cityMidDay')).setOrigin(0.5, 1)
    const near = this.scene.add.image(width / 2, 378, getTextureKey(this.scene, this.isNight ? 'cityNearNight' : 'cityNearDay')).setOrigin(0.5, 1)

    this.distantCity.add(far)
    this.midCity.add(mid)
    this.nearCity.add(near)

    // Windows start lighting up at dusk; at night the full set blinks.
    if (this.palette.timeOfDay !== 'night' && this.palette.timeOfDay !== 'dusk') return

    const animatedLights = [
      [this.midCity, 338, 220, 0xf3cf64],
      [this.midCity, 612, 188, 0x42d9f4],
      [this.nearCity, 235, 210, 0x42d9f4],
      [this.nearCity, 782, 238, 0xf3cf64],
      [this.nearCity, 962, 170, 0x42d9f4],
    ] as const
    const lights = this.palette.timeOfDay === 'dusk' ? animatedLights.filter((_, index) => index % 2 === 0) : animatedLights

    lights.forEach(([layer, x, y, color], index) => {
      const light = this.scene.add.rectangle(x, y, 7, 9, color, 0.75)
      layer.add(light)
      if (this.motion.reduced) return
      this.scene.tweens.add({
        targets: light,
        alpha: 0.22,
        duration: 1100 + index * 190,
        yoyo: true,
        repeat: -1,
        delay: index * 130,
        ease: 'Sine.inOut',
      })
    })
  }
}
