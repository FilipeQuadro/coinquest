import Phaser from 'phaser'
import { getTextureKey } from '../assets/spriteLoader'

export class ParallaxBackdrop {
  private sky: Phaser.GameObjects.Container
  private clouds: Phaser.GameObjects.Container
  private distantCity: Phaser.GameObjects.Container
  private midCity: Phaser.GameObjects.Container
  private nearCity: Phaser.GameObjects.Container

  constructor(private readonly scene: Phaser.Scene, private readonly isNight: boolean, width: number, height: number) {
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
  }

  update(time: number) {
    this.clouds.x = Math.sin(time * 0.00012) * 14
    this.distantCity.x = Math.sin(time * 0.00016) * 4
    this.midCity.x = Math.sin(time * 0.0002) * 7
    this.nearCity.x = Math.sin(time * 0.00025) * 10
  }

  private drawSky(width: number, height: number) {
    const sky = this.scene.add.image(width / 2, height / 2, getTextureKey(this.scene, this.isNight ? 'skyNight' : 'skyDay'))
    this.sky.add(sky)

    if (this.isNight) {
      for (let i = 0; i < 18; i++) {
        const star = this.scene.add.rectangle(
          Phaser.Math.Between(24, width - 24),
          Phaser.Math.Between(16, 165),
          i % 5 === 0 ? 2 : 1,
          i % 5 === 0 ? 2 : 1,
          i % 3 === 0 ? 0xfff0a8 : 0xcbd8ff,
          0.45,
        )
        this.sky.add(star)
        if (i % 3 === 0) {
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
  }

  private drawClouds() {
    if (this.isNight) return

    this.addCloud(120, 96, 0.2)
    this.addCloud(350, 138, 0.14)
    this.addCloud(690, 120, 0.13)
  }

  private addCloud(x: number, y: number, alpha: number) {
    const cloud = this.scene.add.container(x, y)
    cloud.add([
      this.scene.add.rectangle(0, 8, 90, 18, 0xffffff, alpha),
      this.scene.add.rectangle(22, 0, 48, 22, 0xffffff, alpha),
      this.scene.add.rectangle(-22, 2, 40, 20, 0xffffff, alpha),
      this.scene.add.rectangle(52, 11, 34, 14, 0xffffff, alpha * 0.8),
    ])
    this.clouds.add(cloud)

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

    if (!this.isNight) return

    const animatedLights = [
      [this.midCity, 338, 220, 0xf3cf64],
      [this.midCity, 612, 188, 0x42d9f4],
      [this.nearCity, 235, 210, 0x42d9f4],
      [this.nearCity, 782, 238, 0xf3cf64],
      [this.nearCity, 962, 170, 0x42d9f4],
    ] as const

    animatedLights.forEach(([layer, x, y, color], index) => {
      const light = this.scene.add.rectangle(x, y, 7, 9, color, 0.75)
      layer.add(light)
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
