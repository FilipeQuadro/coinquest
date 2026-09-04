import Phaser from 'phaser'
import type { FinancialHealth } from '../../finance/health/financialHealth'
import { spriteKeys } from '../assets/assetManifest'
import { getTextureKey } from '../assets/spriteLoader'
import {
  isProgrammerReactionState,
  ProgrammerStateMachine,
  type ProgrammerBaseState,
  type ProgrammerReactionState,
  type ProgrammerState,
} from './programmerStateMachine'

export class Programmer {
  readonly container: Phaser.GameObjects.Container

  private head: Phaser.GameObjects.Rectangle
  private body: Phaser.GameObjects.Rectangle
  private leftArm: Phaser.GameObjects.Rectangle
  private rightArm: Phaser.GameObjects.Rectangle
  private leftHand: Phaser.GameObjects.Rectangle
  private rightHand: Phaser.GameObjects.Rectangle
  private visor: Phaser.GameObjects.Rectangle
  private mouth: Phaser.GameObjects.Rectangle
  private sprite?: Phaser.GameObjects.Sprite
  private baseBodyColor = 0x27315f
  private readonly proceduralScale = 1.28
  private readonly realSpriteScale = 1.72
  private baseScale = this.proceduralScale
  private readonly states = new ProgrammerStateMachine()
  private homeX = 0
  private homeY = 0
  private resetTimer?: Phaser.Time.TimerEvent

  constructor(private readonly scene: Phaser.Scene, x: number, y: number) {
    this.container = scene.add.container(x, y)
    this.homeX = x
    this.homeY = y
    const useRealSprite = scene.textures.exists(spriteKeys.programmer)
    this.baseScale = useRealSprite ? this.realSpriteScale : this.proceduralScale

    const shadow = scene.add.ellipse(1, 43, 68, 15, 0x050711, 0.4)
    const leftShoe = scene.add.rectangle(-15, 43, 22, 8, 0x4ec7ff).setStrokeStyle(2, 0x07101d)
    const rightShoe = scene.add.rectangle(15, 43, 22, 8, 0x7d68d8).setStrokeStyle(2, 0x07101d)
    const leftLeg = scene.add.rectangle(-12, 26, 13, 30, 0x171b2e).setStrokeStyle(2, 0x080a12)
    const rightLeg = scene.add.rectangle(12, 26, 13, 30, 0x171b2e).setStrokeStyle(2, 0x080a12)
    this.body = scene.add.rectangle(0, -3, 48, 48, 0x27315f).setStrokeStyle(3, 0x0b0f22)
    const jacketGlow = scene.add.rectangle(0, -14, 52, 10, 0x42d9f4, 0.16)
    const zipper = scene.add.rectangle(0, -2, 4, 41, 0x42d9f4, 0.75)
    const pocketLeft = scene.add.rectangle(-11, 9, 12, 7, 0x1a2244)
    const pocketRight = scene.add.rectangle(11, 9, 12, 7, 0x1a2244)
    const hood = scene.add.rectangle(0, -28, 43, 29, 0x1d254b).setStrokeStyle(3, 0x0b0f22)
    const cordLeft = scene.add.rectangle(-7, -14, 3, 16, 0x68ffda)
    const cordRight = scene.add.rectangle(7, -14, 3, 16, 0x7f67d8)
    this.head = scene.add.rectangle(0, -36, 31, 29, 0xd79c73).setStrokeStyle(2, 0x422b27)
    const earLeft = scene.add.rectangle(-19, -35, 5, 12, 0xd79c73).setStrokeStyle(1, 0x422b27)
    const earRight = scene.add.rectangle(19, -35, 5, 12, 0xd79c73).setStrokeStyle(1, 0x422b27)
    const hairCap = scene.add.rectangle(0, -51, 36, 10, 0x16121c)
    const hairSide = scene.add.rectangle(14, -43, 8, 16, 0x16121c)
    const hairLock = scene.add.rectangle(-10, -45, 15, 8, 0x21192a)
    const hairHighlight = scene.add.rectangle(-2, -54, 18, 3, 0x3a284e)
    const headsetBand = scene.add.rectangle(0, -52, 40, 4, 0x42d9f4)
    const headset = scene.add.rectangle(21, -34, 6, 20, 0x42d9f4)
    const mic = scene.add.rectangle(26, -24, 13, 3, 0x72f6ff)
    this.visor = scene.add.rectangle(-1, -37, 24, 7, 0x72f6ff, 0.75)
    this.mouth = scene.add.rectangle(0, -25, 10, 2, 0x5c2d31)
    this.leftArm = scene.add.rectangle(-30, 0, 11, 35, 0x27315f).setStrokeStyle(2, 0x0b0f22)
    this.rightArm = scene.add.rectangle(30, 0, 11, 35, 0x27315f).setStrokeStyle(2, 0x0b0f22)
    const leftCuff = scene.add.rectangle(-30, 17, 13, 6, 0x42d9f4, 0.8).setStrokeStyle(1, 0x07101d)
    const rightCuff = scene.add.rectangle(30, 17, 13, 6, 0x7f67d8, 0.8).setStrokeStyle(1, 0x07101d)
    this.leftHand = scene.add.rectangle(-30, 24, 10, 9, 0xd79c73).setStrokeStyle(1, 0x422b27)
    this.rightHand = scene.add.rectangle(30, 24, 10, 9, 0xd79c73).setStrokeStyle(1, 0x422b27)
    const spriteMold = scene.add.image(0, 1, getTextureKey(scene, 'programmer')).setAlpha(0)
    const badge = scene.add.image(14, -9, getTextureKey(scene, 'programmerBadge')).setScale(0.45)
    this.sprite = useRealSprite ? scene.add.sprite(0, -5, spriteKeys.programmer, 0) : undefined
    this.createSpriteAnimations()

    const proceduralParts = [
      leftLeg,
      rightLeg,
      leftShoe,
      rightShoe,
      this.leftArm,
      this.rightArm,
      this.leftHand,
      this.rightHand,
      leftCuff,
      rightCuff,
      this.body,
      jacketGlow,
      zipper,
      pocketLeft,
      pocketRight,
      hood,
      cordLeft,
      cordRight,
      earLeft,
      earRight,
      this.head,
      hairCap,
      hairSide,
      hairLock,
      hairHighlight,
      headsetBand,
      headset,
      mic,
      this.visor,
      this.mouth,
      badge,
    ]

    if (useRealSprite) {
      proceduralParts.forEach((part) => part.setAlpha(0))
    }

    this.container.add([
      spriteMold,
      shadow,
      ...(this.sprite ? [this.sprite] : []),
      leftLeg,
      rightLeg,
      leftShoe,
      rightShoe,
      this.leftArm,
      this.rightArm,
      this.leftHand,
      this.rightHand,
      leftCuff,
      rightCuff,
      this.body,
      jacketGlow,
      zipper,
      pocketLeft,
      pocketRight,
      hood,
      cordLeft,
      cordRight,
      earLeft,
      earRight,
      this.head,
      hairCap,
      hairSide,
      hairLock,
      hairHighlight,
      headsetBand,
      headset,
      mic,
      this.visor,
      this.mouth,
      badge,
    ])
    this.container.setScale(this.baseScale)
    this.playIdle()

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.resetTimer?.remove())
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.resetTimer?.remove())
  }

  playIdle() {
    if (!this.states.setBaseState('idle').accepted) return
    this.renderBaseState('idle')
  }

  playTyping() {
    if (!this.states.setBaseState('typing').accepted) return
    this.renderBaseState('typing')
  }

  celebrate() {
    const transition = this.states.startReaction('income')
    if (transition.queued) return
    this.renderReactionState('income')
  }

  reactExpense() {
    const transition = this.states.startReaction('expense')
    if (transition.queued) return
    this.renderReactionState('expense')
  }

  prepareWalk() {
    if (!this.states.setBaseState('walking').accepted) return
    this.renderBaseState('walking')
  }

  walkTo(x: number, y = this.homeY, duration = 650, returnTo: Extract<ProgrammerBaseState, 'idle' | 'typing'> = 'idle') {
    if (!this.states.setBaseState('walking').accepted) return false

    this.renderBaseState('walking')
    this.sprite?.setFlipX(x < this.homeX)
    this.scene.tweens.add({
      targets: this.container,
      x,
      y,
      duration,
      ease: 'Sine.inOut',
      onComplete: () => {
        this.homeX = x
        this.homeY = y
        this.sprite?.setFlipX(false)
        returnTo === 'typing' ? this.playTyping() : this.playIdle()
      },
    })

    return true
  }

  setFinancialHealth(health: FinancialHealth) {
    const colorByLevel: Record<FinancialHealth['level'], number> = {
      unknown: 0x27315f,
      excellent: 0x31427c,
      healthy: 0x27315f,
      attention: 0x2f335b,
      tight: 0x232c50,
      critical: 0x3f2946,
    }

    this.baseBodyColor = colorByLevel[health.level]
    if (!isProgrammerReactionState(this.states.state)) {
      this.body.setFillStyle(this.baseBodyColor)
    }
  }

  private renderBaseState(state: ProgrammerBaseState) {
    this.applyVisualState(state)

    if (state === 'typing') {
      this.scene.tweens.add({
        targets: [this.leftArm, this.rightArm, this.leftHand, this.rightHand],
        angle: { from: -7, to: 7 },
        duration: 120,
        yoyo: true,
        repeat: -1,
        ease: 'Stepped',
      })
      this.sprite?.setPosition(3, -3)
      this.sprite?.play('programmer-typing')
      return
    }

    if (state === 'walking') {
      this.scene.tweens.add({
        targets: [this.leftArm, this.rightArm, this.leftHand, this.rightHand],
        angle: { from: -12, to: 12 },
        duration: 240,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      })
      this.sprite?.setPosition(0, -5)
      this.sprite?.play('programmer-walk-right')
      return
    }

    this.scene.tweens.add({
      targets: this.container,
      y: this.container.y - 4,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })
    this.scene.tweens.add({
      targets: this.visor,
      alpha: 0.35,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })
    this.sprite?.play('programmer-idle')
  }

  private renderReactionState(state: ProgrammerReactionState) {
    this.applyVisualState(state)

    if (state === 'income') {
      this.leftArm.setAngle(-55)
      this.rightArm.setAngle(55)
      this.leftHand.setAngle(-55)
      this.rightHand.setAngle(55)
      this.body.setFillStyle(0x31427c)
      this.mouth.setFillStyle(0x69e697)
      this.sprite?.play('programmer-income')

      this.scene.tweens.add({
        targets: this.container,
        y: this.homeY - 10,
        scaleX: this.baseScale * 1.06,
        scaleY: this.baseScale * 1.06,
        duration: 180,
        yoyo: true,
        repeat: 1,
        ease: 'Quad.out',
      })

      this.scheduleReactionFinish(680)
      return
    }

    this.leftArm.setAngle(18)
    this.rightArm.setAngle(-18)
    this.leftHand.setAngle(18)
    this.rightHand.setAngle(-18)
    this.body.setFillStyle(0x3f2946)
    this.mouth.setFillStyle(0xff786f)
    this.sprite?.play('programmer-expense')

    this.scene.tweens.add({
      targets: this.container,
      x: this.homeX - 4,
      duration: 70,
      yoyo: true,
      repeat: 4,
      ease: 'Sine.inOut',
    })

    this.scheduleReactionFinish(520)
  }

  private scheduleReactionFinish(delay: number) {
    this.resetTimer?.remove()
    this.resetTimer = this.scene.time.delayedCall(delay, () => this.completeReaction())
  }

  private completeReaction() {
    const transition = this.states.finishReaction()
    if (transition.nextReaction) {
      this.renderReactionState(transition.nextReaction)
      return
    }

    if (!isProgrammerReactionState(transition.state)) {
      this.renderBaseState(transition.state)
    }
  }

  private applyVisualState(state: ProgrammerState) {
    this.resetTimer?.remove()
    this.scene.game.canvas.dataset.programmerState = state
    this.scene.tweens.killTweensOf([this.container, this.leftArm, this.rightArm, this.leftHand, this.rightHand, this.body, this.visor])
    this.container.setPosition(this.homeX, this.homeY)
    this.container.setScale(this.baseScale)
    this.container.setAngle(0)
    this.leftArm.setAngle(0)
    this.rightArm.setAngle(0)
    this.leftHand.setAngle(0)
    this.rightHand.setAngle(0)
    this.body.setFillStyle(this.baseBodyColor)
    this.mouth.setFillStyle(0x5c2d31)
    this.sprite?.setPosition(0, -5)
  }

  private createSpriteAnimations() {
    if (!this.sprite) return

    if (!this.scene.anims.exists('programmer-idle')) {
      this.scene.anims.create({
        key: 'programmer-idle',
        frames: this.scene.anims.generateFrameNumbers(spriteKeys.programmer, { start: 0, end: 3 }),
        frameRate: 4,
        repeat: -1,
      })
    }

    if (!this.scene.anims.exists('programmer-typing')) {
      this.scene.anims.create({
        key: 'programmer-typing',
        frames: this.scene.anims.generateFrameNumbers(spriteKeys.programmer, { start: 4, end: 9 }),
        frameRate: 9,
        repeat: -1,
      })
    }

    if (!this.scene.anims.exists('programmer-income')) {
      this.scene.anims.create({
        key: 'programmer-income',
        frames: this.scene.anims.generateFrameNumbers(spriteKeys.programmer, { start: 10, end: 15 }),
        frameRate: 9,
        repeat: 0,
      })
    }

    if (!this.scene.anims.exists('programmer-expense')) {
      this.scene.anims.create({
        key: 'programmer-expense',
        frames: this.scene.anims.generateFrameNumbers(spriteKeys.programmer, { start: 16, end: 19 }),
        frameRate: 8,
        repeat: 0,
      })
    }

    if (!this.scene.anims.exists('programmer-walk-right')) {
      this.scene.anims.create({
        key: 'programmer-walk-right',
        frames: this.scene.anims.generateFrameNumbers(spriteKeys.programmer, { start: 20, end: 27 }),
        frameRate: 9,
        repeat: -1,
      })
    }
  }

  getState() {
    return this.states.state
  }
}
