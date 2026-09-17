import Phaser from 'phaser'
import type { BudgetProgress } from '../../finance/budget/budget'
import type { FinancialHealth } from '../../finance/health/financialHealth'
import type { MonthlyOutlook } from '../../finance/recurring/recurring'
import type { MonthlySummary } from '../../finance/transactions'
import type { WorldProgressionState, WorldProgressionTier } from '../../finance/world/worldProgression'

const levelColors: Record<FinancialHealth['level'], number> = {
  unknown: 0x7f8aa8,
  excellent: 0xf3cf64,
  healthy: 0x69e697,
  attention: 0xffd36f,
  tight: 0x7fb2ff,
  critical: 0xff786f,
}

export class FinanceMonitor {
  readonly container: Phaser.GameObjects.Container

  private readonly bars: Phaser.GameObjects.Rectangle[]
  private readonly trend: Phaser.GameObjects.Rectangle[]
  private readonly statusPixel: Phaser.GameObjects.Rectangle
  private readonly budgetRail: Phaser.GameObjects.Rectangle
  private readonly budgetFill: Phaser.GameObjects.Rectangle
  private readonly worldText: Phaser.GameObjects.Text
  private readonly missionText: Phaser.GameObjects.Text
  private missionTimer?: Phaser.Time.TimerEvent

  constructor(private readonly scene: Phaser.Scene, x: number, y: number, isNight: boolean) {
    this.container = scene.add.container(x, y)

    const glow = scene.add.rectangle(0, -10, 130, 78, 0x42d9f4, isNight ? 0.2 : 0.1)
    const screen = scene.add.rectangle(0, -10, 112, 64, 0x07101f).setStrokeStyle(4, 0x4f638e)
    const stand = scene.add.rectangle(0, 32, 16, 26, 0x35405f)
    const base = scene.add.rectangle(0, 49, 72, 9, 0x263453).setStrokeStyle(2, 0x0b1020)
    const cursor = scene.add.rectangle(40, -28, 4, 10, 0xffffff)
    this.statusPixel = scene.add.rectangle(-46, -31, 8, 8, 0x7f8aa8)
    this.budgetRail = scene.add.rectangle(0, 23, 78, 5, 0x263656, 0.72)
    this.budgetFill = scene.add.rectangle(-39, 23, 0, 5, 0x42d9f4, 0.82).setOrigin(0, 0.5)
    this.worldText = scene.add.text(0, -30, 'Base\ninicial', {
      align: 'center',
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#c7f7ff',
      stroke: '#07101f',
      strokeThickness: 2,
    }).setOrigin(0.5)
    this.missionText = scene.add.text(0, -10, 'MISSAO\nCONCLUIDA', {
      align: 'center',
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#fff5c7',
      stroke: '#07101f',
      strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0)

    this.bars = [-27, -13, 1, 15, 29].map((barX, index) =>
      scene.add.rectangle(barX, 10, 7, 18 + index * 2, 0x42d9f4, 0.75).setOrigin(0.5, 1),
    )

    this.trend = [
      scene.add.rectangle(-39, -12, 20, 4, 0x69e697),
      scene.add.rectangle(-16, -17, 20, 4, 0xf3cf64),
      scene.add.rectangle(7, -9, 20, 4, 0xff786f),
    ]

    this.container.add([glow, screen, stand, base, this.statusPixel, ...this.bars, ...this.trend, this.budgetRail, this.budgetFill, cursor, this.worldText, this.missionText])

    scene.tweens.add({
      targets: cursor,
      alpha: 0.2,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Stepped',
    })

    scene.tweens.add({
      targets: glow,
      alpha: isNight ? 0.34 : 0.16,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.missionTimer?.remove())
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.missionTimer?.remove())
  }

  setFinancialState(health: FinancialHealth, summary: MonthlySummary, budgetProgress?: BudgetProgress, monthlyOutlook?: MonthlyOutlook) {
    const color = levelColors[health.level]
    const ratio = health.expenseRatio ?? (summary.expenses > 0 ? 1 : 0)
    const normalizedRatio = Phaser.Math.Clamp(ratio, 0, 1.2)
    const safeIncome = Math.max(summary.income, 1)
    const balanceRatio = Phaser.Math.Clamp((summary.balance + safeIncome) / (safeIncome * 2), 0.1, 1)

    this.statusPixel.setFillStyle(color)
    const hasPlannedSignal = Boolean(monthlyOutlook && (
      monthlyOutlook.pendingCount + monthlyOutlook.overdueCount > 0 ||
      monthlyOutlook.committedCardExpense > 0
    ))
    this.budgetRail.setAlpha(hasPlannedSignal ? 1 : 0.72)

    this.bars.forEach((bar, index) => {
      const wave = Math.sin(index * 1.7 + normalizedRatio * 3)
      const height = Phaser.Math.Clamp(12 + balanceRatio * 32 + wave * 7 - index * normalizedRatio * 5, 8, 44)
      bar.setDisplaySize(7, height)
      bar.setFillStyle(index / this.bars.length < balanceRatio ? color : 0x2c3a5f, 0.78)
    })

    this.trend.forEach((line, index) => {
      line.setFillStyle(index === 0 ? 0x69e697 : index === 1 ? color : 0xff786f, index === 2 && health.level !== 'critical' ? 0.28 : 0.75)
      line.setAngle((balanceRatio - 0.5) * 26 + index * 4)
    })

    if (!budgetProgress?.hasBudget || budgetProgress.percentageUsed === null) {
      this.budgetFill.setDisplaySize(14, 5)
      this.budgetFill.setFillStyle(0x7f8aa8, 0.45)
      return
    }

    const usage = Number.isFinite(budgetProgress.percentageUsed) ? budgetProgress.percentageUsed : 1
    const width = Phaser.Math.Clamp(usage, 0, 1) * 78
    this.budgetFill.setDisplaySize(Math.max(4, width), 5)
    this.budgetFill.setFillStyle(budgetProgress.isOverLimit ? 0xff786f : color, 0.86)
  }

  showGoalCompleted(goalName: string) {
    const safeName = goalName.length > 14 ? `${goalName.slice(0, 13)}...` : goalName
    this.missionTimer?.remove()
    this.scene.tweens.killTweensOf(this.missionText)
    this.missionText.setText(`MISSAO\nCONCLUIDA\n${safeName.toUpperCase()}`)
    this.missionText.setAlpha(1)

    this.scene.tweens.add({
      targets: this.missionText,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 180,
      yoyo: true,
      repeat: 1,
      ease: 'Quad.out',
    })

    this.missionTimer = this.scene.time.delayedCall(2200, () => {
      this.scene.tweens.add({
        targets: this.missionText,
        alpha: 0,
        duration: 260,
        ease: 'Sine.in',
      })
    })
  }

  setWorldProgression(progression: Pick<WorldProgressionState, 'tier' | 'title'>) {
    const style = this.getWorldTierStyle(progression.tier)
    this.worldText.setText(progression.title.replace(' ', '\n'))
    this.worldText.setColor(style.color)
    this.worldText.setAlpha(style.alpha)
  }

  private getWorldTierStyle(tier: WorldProgressionTier) {
    const styles = {
      starter: { color: '#c8d2ea', alpha: 0.72 },
      stable: { color: '#8ee8ff', alpha: 0.82 },
      focused: { color: '#c7b7ff', alpha: 0.9 },
      thriving: { color: '#fff0a8', alpha: 1 },
    } satisfies Record<WorldProgressionTier, { color: string; alpha: number }>

    return styles[tier]
  }
}
