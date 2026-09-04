import Phaser from 'phaser'
import { formatBRL } from '../../lib/money'
import type { Transaction } from '../../db/types'

export class FinancialEffects {
  private readonly spawned = new Set<Phaser.GameObjects.GameObject>()

  constructor(private readonly scene: Phaser.Scene) {
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyAll())
  }

  showTransaction(transaction: Transaction, x: number, y: number) {
    const income = transaction.type === 'income'
    this.floatValue(income ? '+' : '-', transaction.amount, x, y, income)
    income ? this.coinBurst(x, y) : this.expenseBits(x, y)
  }

  showGoalCompleted(goalName: string, x: number, y: number) {
    const title = this.scene.add.text(x, y, 'MISSAO CONCLUIDA', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#fff5c7',
      stroke: '#080a14',
      strokeThickness: 5,
    }).setOrigin(0.5)
    const subtitle = this.scene.add.text(x, y + 24, goalName, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#d9f7ff',
      stroke: '#080a14',
      strokeThickness: 4,
    }).setOrigin(0.5)

    title.setDepth(12)
    subtitle.setDepth(12)
    this.track(title)
    this.track(subtitle)

    this.scene.tweens.add({
      targets: [title, subtitle],
      y: '-=42',
      alpha: 0,
      duration: 1700,
      ease: 'Cubic.out',
      onComplete: () => {
        this.destroy(title)
        this.destroy(subtitle)
      },
    })

    this.missionSparkles(x, y + 8)
  }

  private floatValue(prefix: string, amount: number, x: number, y: number, income: boolean) {
    let popup: Phaser.GameObjects.Text

    try {
      popup = this.scene.add.text(x, y, `${prefix} ${formatBRL(amount)}`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: income ? '#ffe88a' : '#ff9a9a',
        stroke: '#080a14',
        strokeThickness: 5,
      }).setOrigin(0.5)
      popup.setDepth(12)
    } catch {
      this.scene.game.canvas.dataset.lastFloatingValue = `${prefix} ${formatBRL(amount)}`
      return
    }

    this.track(popup)

    this.scene.tweens.add({
      targets: popup,
      y: y - 54,
      alpha: 0,
      duration: 1250,
      ease: 'Cubic.out',
      onComplete: () => this.destroy(popup),
    })
  }

  private coinBurst(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      const coin = this.scene.add.rectangle(x + Phaser.Math.Between(-18, 18), y - 26, 9, 9, 0xf6d65d)
      coin.setStrokeStyle(2, 0xb67a22)
      coin.setDepth(12)
      this.track(coin)
      this.scene.tweens.add({
        targets: coin,
        x: coin.x + Phaser.Math.Between(-62, 62),
        y: coin.y - Phaser.Math.Between(42, 96),
        alpha: 0,
        angle: Phaser.Math.Between(-180, 180),
        duration: Phaser.Math.Between(650, 1050),
        delay: i * 30,
        ease: 'Quad.out',
        onComplete: () => this.destroy(coin),
      })
    }
  }

  private expenseBits(x: number, y: number) {
    for (let i = 0; i < 7; i++) {
      const bit = this.scene.add.rectangle(x + Phaser.Math.Between(-16, 16), y - 18, 7, 7, i % 2 === 0 ? 0xff756f : 0xffa45b)
      bit.setDepth(12)
      this.track(bit)
      this.scene.tweens.add({
        targets: bit,
        x: bit.x + Phaser.Math.Between(-50, 50),
        y: bit.y + Phaser.Math.Between(22, 56),
        alpha: 0,
        duration: Phaser.Math.Between(520, 880),
        delay: i * 28,
        ease: 'Quad.in',
        onComplete: () => this.destroy(bit),
      })
    }
  }

  private missionSparkles(x: number, y: number) {
    for (let i = 0; i < 12; i++) {
      const sparkle = this.scene.add.rectangle(
        x + Phaser.Math.Between(-20, 20),
        y + Phaser.Math.Between(-16, 16),
        i % 3 === 0 ? 8 : 5,
        i % 3 === 0 ? 8 : 5,
        i % 2 === 0 ? 0xf3cf64 : 0x42d9f4,
        0.9,
      )
      sparkle.setDepth(12)
      this.track(sparkle)
      this.scene.tweens.add({
        targets: sparkle,
        x: sparkle.x + Phaser.Math.Between(-76, 76),
        y: sparkle.y - Phaser.Math.Between(38, 94),
        alpha: 0,
        angle: Phaser.Math.Between(-90, 90),
        duration: Phaser.Math.Between(740, 1250),
        delay: i * 24,
        ease: 'Quad.out',
        onComplete: () => this.destroy(sparkle),
      })
    }
  }

  private track(gameObject: Phaser.GameObjects.GameObject) {
    this.spawned.add(gameObject)
  }

  private destroy(gameObject: Phaser.GameObjects.GameObject) {
    this.spawned.delete(gameObject)
    gameObject.destroy()
  }

  private destroyAll() {
    this.spawned.forEach((gameObject) => gameObject.destroy())
    this.spawned.clear()
  }
}
