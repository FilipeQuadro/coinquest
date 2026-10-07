import Phaser from 'phaser'
import type { Transaction } from '../../db/types'
import type { WorldProgressionState, WorldProgressionTier } from '../../finance/world/worldProgression'
import { ensureSpriteFallbacks, getTextureKey, preloadCoinQuestSprites } from '../assets/spriteLoader'
import { DigitalVault } from '../entities/DigitalVault'
import { FinanceMonitor } from '../entities/FinanceMonitor'
import { Programmer } from '../entities/Programmer'
import { FinancialEffects } from '../effects/FinancialEffects'
import { financeBus, type FinancialHealthUpdate, type GoalCompletedPresentation } from '../events'
import {
  atmosphereMotion,
  atmospherePalette,
  prefersReducedMotion,
  resolveTimeOfDay,
  type AtmosphereMotion,
  type AtmospherePalette,
} from '../systems/atmosphere'
import { ParallaxBackdrop } from '../systems/ParallaxBackdrop'
import { getInitialRoomSetupState } from '../systems/setupTier'

const SCENE_WIDTH = 960
const SCENE_HEIGHT = 540

export class MainRoomScene extends Phaser.Scene {
  private backdrop?: ParallaxBackdrop
  private programmer?: Programmer
  private vault?: DigitalVault
  private financeMonitor?: FinanceMonitor
  private effects?: FinancialEffects
  private statusText?: Phaser.GameObjects.Text
  private moodOverlay?: Phaser.GameObjects.Rectangle
  private healthLights: Phaser.GameObjects.Rectangle[] = []
  private palette: AtmospherePalette = atmospherePalette('day')
  private motion: AtmosphereMotion = atmosphereMotion(false)
  private activeMotes = 0
  private transactionHandler?: EventListener
  private healthHandler?: EventListener
  private goalCompletedHandler?: EventListener
  private worldProgressionHandler?: EventListener
  private readonly handleResize = () => this.configureCamera()

  constructor() {
    super('main-room')
  }

  preload() {
    preloadCoinQuestSprites(this)
  }

  create() {
    this.palette = atmospherePalette(resolveTimeOfDay(window.location.search, new Date().getHours()))
    this.motion = atmosphereMotion(prefersReducedMotion())
    const isNight = this.palette.usesNightTextures
    const setupState = getInitialRoomSetupState()
    ensureSpriteFallbacks(this)
    this.game.canvas.dataset.setupTier = setupState.tier
    this.game.canvas.dataset.timeOfDay = this.palette.timeOfDay
    this.game.canvas.dataset.reducedMotion = String(this.motion.reduced)

    this.cameras.main.setBackgroundColor(this.palette.cameraBackground)
    this.cameras.main.setBounds(0, 0, SCENE_WIDTH, SCENE_HEIGHT)
    this.cameras.main.roundPixels = true
    this.configureCamera()
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.backdrop = new ParallaxBackdrop(this, this.palette, this.motion, SCENE_WIDTH, SCENE_HEIGHT)
    this.drawRoomShell(isNight)
    this.drawAmbientLight(isNight)
    this.drawDeskStation(isNight)
    this.drawTechDecorations(isNight)
    this.drawCozyProps()

    this.financeMonitor = new FinanceMonitor(this, 407, 313, isNight)
    this.financeMonitor.container.setDepth(6)
    this.programmer = new Programmer(this, 385, 392)
    this.programmer.container.setDepth(8)
    this.programmer.playTyping()
    this.vault = new DigitalVault(this, 735, 386)
    this.vault.container.setDepth(7)
    this.effects = new FinancialEffects(this)

    this.addTitle()
    this.bindFinanceEvents()
    this.createAmbientParticles()
  }

  update(time: number) {
    this.backdrop?.update(time)
  }

  private drawRoomShell(isNight: boolean) {
    const { glassColor, glassAlpha } = this.palette

    const wall = this.add.image(480, 210, getTextureKey(this, 'wall'))
    const floor = this.add.image(480, 462, getTextureKey(this, 'floor'))
    const windowFrame = this.add.image(520, 220, getTextureKey(this, 'windowFrame'))
    const glass = this.add.rectangle(520, 220, 474, 208, glassColor, glassAlpha)
    const windowLight = this.add.rectangle(520, 320, 472, 72, this.palette.windowLight, this.palette.windowLightAlpha)
    const contactShadow = this.add.rectangle(520, 446, 540, 18, isNight ? 0x42d9f4 : 0xffe7a0, isNight ? 0.06 : 0.05)
    this.moodOverlay = this.add.rectangle(480, 270, SCENE_WIDTH, SCENE_HEIGHT, 0x42d9f4, 0)

    const wallPanelCyan = this.add.rectangle(116, 192, 94, 8, 0x35d8ff, isNight ? 0.65 : 0.38)
    const wallPanelGreen = this.add.rectangle(116, 232, 82, 8, 0x68ff9a, isNight ? 0.7 : 0.42)
    const wallPanelGold = this.add.rectangle(116, 272, 106, 8, 0xf3cf64, isNight ? 0.65 : 0.35)
    const roomConsoleCyan = this.add.rectangle(92, 326, 30, 5, 0x42d9f4, 0.65)
    const roomConsolePurple = this.add.rectangle(124, 340, 54, 5, 0x7f67d8, 0.6)
    this.healthLights.push(wallPanelCyan, wallPanelGreen, wallPanelGold)

    this.addAmbientTween({
      targets: glass,
      alpha: isNight ? 0.28 : 0.1,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })

    wall.setDepth(1)
    windowFrame.setDepth(2)
    glass.setDepth(2.1)
    windowLight.setDepth(2.2)
    floor.setDepth(2.5)
    contactShadow.setDepth(3.5)
    this.moodOverlay.setDepth(12)
    wallPanelCyan.setDepth(3)
    wallPanelGreen.setDepth(3)
    wallPanelGold.setDepth(3)
    roomConsoleCyan.setDepth(3)
    roomConsolePurple.setDepth(3)
  }

  private drawDeskStation(isNight: boolean) {
    const station = this.add.image(425, 382, getTextureKey(this, 'workstationBase')).setScale(1.05)
    const monitorGlow = this.add.rectangle(407, 313, 144, 88, 0x35d8ff, isNight ? 0.2 : 0.1)
    const deskGlow = this.add.rectangle(442, 433, 310, 6, 0x42d9f4, isNight ? 0.28 : 0.16)
    const deskFront = this.add.rectangle(442, 431, 286, 16, 0x252f52, 0.96).setStrokeStyle(2, 0x07090f, 0.85)
    const deskFrontHighlight = this.add.rectangle(442, 423, 286, 3, 0x536184, 0.72)
    const deskFrontLed = this.add.rectangle(515, 430, 78, 3, 0x42d9f4, isNight ? 0.45 : 0.26)
    const cable = this.add.graphics()
    const towerFanA = this.add.rectangle(660, 350, 28, 4, 0x42d9f4, 0.65)
    const towerFanB = this.add.rectangle(660, 350, 4, 28, 0x42d9f4, 0.65)
    const terminalLabel = this.add.text(357, 290, 'npm run dev', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#a9ffcb',
      backgroundColor: '#00000044',
      padding: { x: 4, y: 2 },
    })

    cable.lineStyle(3, 0x202846, 0.7)
    cable.beginPath()
    cable.moveTo(512, 426)
    cable.lineTo(558, 438)
    cable.lineTo(668, 417)
    cable.strokePath()

    this.addAmbientTween({
      targets: [towerFanA, towerFanB],
      angle: 180,
      alpha: 0.28,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Stepped',
    })

    this.addAmbientTween({
      targets: [monitorGlow, deskGlow, deskFrontLed],
      alpha: isNight ? 0.4 : 0.2,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })

    this.addAmbientTween({
      targets: terminalLabel,
      alpha: 0.45,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Stepped',
    })

    station.setDepth(3)
    monitorGlow.setDepth(2)
    deskGlow.setDepth(4)
    deskFront.setDepth(9)
    deskFrontHighlight.setDepth(10)
    deskFrontLed.setDepth(10)
    cable.setDepth(2)
    terminalLabel.setDepth(5)
  }

  private drawTechDecorations(isNight: boolean) {
    const ledAlpha = isNight ? 0.85 : 0.4
    const ledStrip = this.add.rectangle(480, 122, 592, 5, 0x35d8ff, ledAlpha)
    const shelf = this.add.rectangle(782, 205, 150, 12, 0x2a3555).setStrokeStyle(2, 0x0b1020)
    const serverA = this.add.rectangle(755, 170, 34, 54, 0x101827).setStrokeStyle(2, 0x445279)
    const serverB = this.add.rectangle(800, 164, 42, 66, 0x111c2f).setStrokeStyle(2, 0x445279)
    const serverLedA = this.add.rectangle(755, 154, 14, 5, 0x68ff9a)
    const serverLedB = this.add.rectangle(800, 145, 18, 5, 0x35d8ff)
    const smallBot = this.add.container(178, 410)
    const botBody = this.add.rectangle(0, 0, 35, 27, 0x202846).setStrokeStyle(2, 0x4f638e)
    const botEye = this.add.rectangle(0, -3, 14, 5, 0x68ff9a)
    const botWheel = this.add.rectangle(0, 18, 22, 6, 0x0b1020)
    smallBot.add([botBody, botEye, botWheel])
    this.healthLights.push(ledStrip, serverLedA, serverLedB, botEye)

    this.addAmbientTween({
      targets: [ledStrip, serverLedA, serverLedB, botEye],
      alpha: 0.25,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })

    this.addAmbientTween({
      targets: smallBot,
      y: smallBot.y - 3,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })

    shelf.setDepth(3)
    serverA.setDepth(3)
    serverB.setDepth(3)
  }

  // V2.2D diorama props: decoration only, never financial data.
  private drawCozyProps() {
    this.add.image(122, 150, getTextureKey(this, 'ledgerShelf')).setScale(1.25).setDepth(3)
    this.add.image(900, 300, getTextureKey(this, 'monthBoard')).setScale(1.25).setDepth(3)
    this.add.ellipse(72, 478, 54, 10, 0x050711, 0.35).setDepth(3.9)
    this.add.image(72, 446, getTextureKey(this, 'plantPot')).setScale(1.5).setDepth(4)
    this.add.image(522, 411, getTextureKey(this, 'deskMug')).setScale(1.5).setDepth(8.5)

    if (this.motion.reduced) return
    ;[0, 1].forEach((index) => {
      const steam = this.add.rectangle(518 + index * 6, 396, 2, 4, 0xf6f3e8, 0).setDepth(8.6)
      this.tweens.add({
        targets: steam,
        y: 380,
        alpha: { from: 0.45, to: 0 },
        duration: 1800,
        delay: index * 900,
        repeat: -1,
        ease: 'Sine.out',
      })
    })
  }

  private addTitle() {
    this.add.text(30, 24, 'COINQUEST LAB', {
      fontFamily: 'monospace',
      fontSize: '27px',
      color: '#fff5c7',
      stroke: '#080a14',
      strokeThickness: 6,
    }).setDepth(13)

    this.statusText = this.add.text(30, 62, 'Bem-vindo a sua base.', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#ffffff',
      backgroundColor: '#00000066',
      padding: { x: 10, y: 7 },
    }).setDepth(13)
  }

  private bindFinanceEvents() {
    this.transactionHandler = ((event: CustomEvent<Transaction>) => {
      this.reactToTransaction(event.detail)
    }) as EventListener

    financeBus.addEventListener('transaction', this.transactionHandler)
    this.healthHandler = ((event: CustomEvent<FinancialHealthUpdate>) => {
      this.applyFinancialHealth(event.detail)
    }) as EventListener
    financeBus.addEventListener('financial-health', this.healthHandler)
    this.goalCompletedHandler = ((event: CustomEvent<GoalCompletedPresentation>) => {
      this.reactToGoalCompleted(event.detail)
    }) as EventListener
    financeBus.addEventListener('goal-completed', this.goalCompletedHandler)
    this.worldProgressionHandler = ((event: CustomEvent<WorldProgressionState>) => {
      this.applyWorldProgression(event.detail)
    }) as EventListener
    financeBus.addEventListener('world-progression', this.worldProgressionHandler)

    const cleanup = () => {
      if (this.transactionHandler) financeBus.removeEventListener('transaction', this.transactionHandler)
      if (this.healthHandler) financeBus.removeEventListener('financial-health', this.healthHandler)
      if (this.goalCompletedHandler) financeBus.removeEventListener('goal-completed', this.goalCompletedHandler)
      if (this.worldProgressionHandler) financeBus.removeEventListener('world-progression', this.worldProgressionHandler)
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup)
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup)
  }

  private reactToTransaction(transaction: Transaction) {
    if (!this.canRenderReaction()) return
    if (!this.vault || !this.programmer || !this.effects) return

    const income = transaction.type === 'income'
    const programmer = this.programmer
    const vault = this.vault
    const effects = this.effects
    this.updateStatus(income ? 'Crédito recebido. Cofre sincronizado.' : 'Despesa registrada. Sistema ajustado.')

    const canvas = this.game.canvas
    canvas.dataset.financeReaction = transaction.type
    canvas.dataset.financeReactionCount = String(Number(canvas.dataset.financeReactionCount ?? 0) + 1)

    this.time.delayedCall(70, () => {
      if (!this.canRenderReaction()) return
      income ? programmer.celebrate() : programmer.reactExpense()
    })

    this.time.delayedCall(115, () => {
      if (!this.canRenderReaction()) return
      income ? vault.reactIncome() : vault.reactExpense()
    })

    this.time.delayedCall(145, () => {
      if (!this.canRenderReaction()) return
      effects.showTransaction(transaction, vault.container.x, vault.container.y - 58)
    })
  }

  private reactToGoalCompleted(goal: GoalCompletedPresentation) {
    if (!this.canRenderReaction()) return
    if (!this.vault || !this.programmer || !this.effects || !this.financeMonitor) return

    this.updateStatus(`Missão concluída: ${goal.name}`)
    const canvas = this.game.canvas
    canvas.dataset.goalReaction = goal.goalId
    canvas.dataset.goalReactionName = goal.name
    canvas.dataset.goalReactionCount = String(Number(canvas.dataset.goalReactionCount ?? 0) + 1)

    this.time.delayedCall(60, () => {
      if (!this.canRenderReaction()) return
      this.programmer?.celebrate()
    })

    this.time.delayedCall(120, () => {
      if (!this.canRenderReaction()) return
      this.vault?.reactGoalCompleted()
    })

    this.time.delayedCall(150, () => {
      if (!this.canRenderReaction()) return
      this.financeMonitor?.showGoalCompleted(goal.name)
      this.effects?.showGoalCompleted(goal.name, 560, 264)
    })
  }

  private configureCamera() {
    const camera = this.cameras.main
    const viewportWidth = Math.max(this.scale.width, 320)
    const viewportHeight = Math.max(this.scale.height, 260)
    const coverZoom = Math.max(viewportWidth / SCENE_WIDTH, viewportHeight / SCENE_HEIGHT)

    camera.setViewport(0, 0, viewportWidth, viewportHeight)

    if (viewportWidth <= 560) {
      const preferredZoom = Math.max(viewportWidth / 450, viewportHeight / 380, coverZoom)
      const zoom = Phaser.Math.Clamp(preferredZoom, 0.9, Math.max(1.2, coverZoom))
      camera.setZoom(zoom)
      this.centerCameraWithinWorld(555, 318)
      return
    }

    if (viewportWidth <= 900) {
      const preferredZoom = Math.max(Math.min(viewportWidth / 720, viewportHeight / 430), coverZoom)
      const zoom = Phaser.Math.Clamp(preferredZoom, 0.92, Math.max(1.18, coverZoom))
      camera.setZoom(zoom)
      this.centerCameraWithinWorld(510, 304)
      return
    }

    const preferredZoom = Math.max(Math.min(viewportWidth / SCENE_WIDTH, viewportHeight / SCENE_HEIGHT), coverZoom)
    const zoom = Phaser.Math.Clamp(preferredZoom, 1, Math.max(1.52, coverZoom))
    camera.setZoom(zoom)
    this.centerCameraWithinWorld(SCENE_WIDTH / 2, SCENE_HEIGHT / 2)
  }

  private centerCameraWithinWorld(x: number, y: number) {
    const camera = this.cameras.main
    const visibleWidth = this.scale.width / camera.zoom
    const visibleHeight = this.scale.height / camera.zoom
    const centerX = visibleWidth >= SCENE_WIDTH ? SCENE_WIDTH / 2 : Phaser.Math.Clamp(x, visibleWidth / 2, SCENE_WIDTH - visibleWidth / 2)
    const centerY = visibleHeight >= SCENE_HEIGHT ? SCENE_HEIGHT / 2 : Phaser.Math.Clamp(y, visibleHeight / 2, SCENE_HEIGHT - visibleHeight / 2)

    camera.centerOn(centerX, centerY)
  }

  private applyFinancialHealth(update: FinancialHealthUpdate) {
    if (!this.canRenderReaction()) return

    this.vault?.setFinancialHealth(update.health)
    this.financeMonitor?.setFinancialState(update.health, update.summary, update.budgetProgress, update.monthlyOutlook)
    this.programmer?.setFinancialHealth(update.health)
    this.applyRoomMood(update.health.level)
    this.game.canvas.dataset.financialHealth = update.health.level
    this.game.canvas.dataset.plannedCommitments = String((update.monthlyOutlook?.pendingCount ?? 0) + (update.monthlyOutlook?.overdueCount ?? 0))
    this.game.canvas.dataset.cardCommitments = String(update.monthlyOutlook?.committedCardExpense ?? 0)
  }

  private applyWorldProgression(progression: WorldProgressionState) {
    if (!this.canRenderReaction()) return

    this.financeMonitor?.setWorldProgression(progression)
    this.vault?.setWorldProgression(progression)
    this.applyWorldProgressionMood(progression.tier)
    this.game.canvas.dataset.worldTier = progression.tier
    this.game.canvas.dataset.worldTitle = progression.title
    this.game.canvas.dataset.worldScore = String(progression.score)
  }

  private applyRoomMood(level: FinancialHealthUpdate['health']['level']) {
    const styles = {
      unknown: { color: 0x7f8aa8, alpha: 0.02, light: 0x7f8aa8 },
      excellent: { color: 0xf3cf64, alpha: 0.035, light: 0xf3cf64 },
      healthy: { color: 0x42d9f4, alpha: 0.025, light: 0x69e697 },
      attention: { color: 0xffd36f, alpha: 0.035, light: 0xffd36f },
      tight: { color: 0x3f5f9f, alpha: 0.045, light: 0x7fb2ff },
      critical: { color: 0xff786f, alpha: 0.04, light: 0xffa45b },
    } satisfies Record<FinancialHealthUpdate['health']['level'], { color: number; alpha: number; light: number }>
    const style = styles[level]

    this.moodOverlay?.setFillStyle(style.color, style.alpha)
    this.healthLights.forEach((light, index) => {
      light.setFillStyle(index % 2 === 0 ? style.light : 0x42d9f4)
      light.setAlpha(level === 'tight' || level === 'critical' ? 0.42 : 0.72)
    })
  }

  private applyWorldProgressionMood(tier: WorldProgressionTier) {
    const styles = {
      starter: { light: 0x7f8aa8, alpha: 0.38 },
      stable: { light: 0x42d9f4, alpha: 0.54 },
      focused: { light: 0x7f67d8, alpha: 0.64 },
      thriving: { light: 0xf3cf64, alpha: 0.78 },
    } satisfies Record<WorldProgressionTier, { light: number; alpha: number }>
    const style = styles[tier]

    this.healthLights.forEach((light, index) => {
      if (index % 2 === 1) return
      light.setFillStyle(style.light)
      light.setAlpha(style.alpha)
    })
  }

  private canRenderReaction() {
    return Boolean(this.sys?.displayList && this.sys?.updateList && this.game?.canvas?.isConnected)
  }

  private updateStatus(message: string) {
    try {
      this.statusText?.setText(message)
    } catch {
      this.game.canvas.dataset.sceneStatus = message
    }
  }

  /** Looping decor motion; skipped entirely when the viewer prefers reduced motion. */
  private addAmbientTween(config: Phaser.Types.Tweens.TweenBuilderConfig) {
    if (this.motion.reduced) return
    this.tweens.add(config)
  }

  private drawAmbientLight(isNight: boolean) {
    const { lightShaftColor, lightShaftAlpha, roomShade, roomShadeAlpha } = this.palette

    // Window light falls diagonally across the room; additive so it brightens without hiding detail.
    const shaft = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(3.6)
    shaft.fillStyle(lightShaftColor, lightShaftAlpha)
    shaft.fillPoints([
      new Phaser.Math.Vector2(300, 122),
      new Phaser.Math.Vector2(560, 122),
      new Phaser.Math.Vector2(880, 530),
      new Phaser.Math.Vector2(470, 530),
    ], true)
    shaft.fillStyle(lightShaftColor, lightShaftAlpha * 0.7)
    shaft.fillPoints([
      new Phaser.Math.Vector2(380, 122),
      new Phaser.Math.Vector2(480, 122),
      new Phaser.Math.Vector2(760, 530),
      new Phaser.Math.Vector2(600, 530),
    ], true)

    const monitorPool = this.add.ellipse(415, 452, 250, 34, 0x42d9f4, isNight ? 0.09 : this.palette.timeOfDay === 'dusk' ? 0.06 : 0.03)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(3.7)
    this.add.rectangle(SCENE_WIDTH / 2, SCENE_HEIGHT / 2, SCENE_WIDTH, SCENE_HEIGHT, roomShade, roomShadeAlpha).setDepth(11)

    this.addAmbientTween({
      targets: shaft,
      alpha: 0.72,
      duration: 4200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })
    this.addAmbientTween({
      targets: monitorPool,
      alpha: monitorPool.alpha * 0.6,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })
  }

  private createAmbientParticles() {
    const { moteInterval, maxMotes } = this.motion
    if (moteInterval === null) return
    const rising = this.palette.timeOfDay === 'night'

    this.time.addEvent({
      delay: moteInterval,
      loop: true,
      callback: () => {
        if (this.activeMotes >= maxMotes) return
        // Daylight dust drifts down inside the window light; at night data motes rise from the desk.
        const x = rising ? Phaser.Math.Between(250, 900) : Phaser.Math.Between(400, 760)
        const y = rising ? Phaser.Math.Between(130, 410) : Phaser.Math.Between(170, 420)
        const size = Phaser.Math.Between(0, 3) === 0 ? 3 : 2
        const particle = this.add.rectangle(x, y, size, size, this.palette.moteColor, this.palette.moteAlpha).setDepth(3.8)
        this.activeMotes += 1

        this.tweens.add({
          targets: particle,
          x: rising ? x : x + Phaser.Math.Between(10, 26),
          y: rising ? y - Phaser.Math.Between(18, 42) : y + Phaser.Math.Between(14, 34),
          alpha: 0,
          duration: rising ? Phaser.Math.Between(1400, 2200) : Phaser.Math.Between(2600, 4200),
          ease: 'Sine.out',
          onComplete: () => {
            this.activeMotes -= 1
            particle.destroy()
          },
        })
      },
    })
  }
}
