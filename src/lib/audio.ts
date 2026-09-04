class AudioEngine {
  private context: AudioContext | null = null
  private enabled = true

  setEnabled(value: boolean) {
    this.enabled = value
  }

  private getContext() {
    if (!this.context) this.context = new AudioContext()
    return this.context
  }

  private tone(frequency: number, duration = 0.09, gain = 0.055, type: OscillatorType = 'square') {
    if (!this.enabled) return

    const ctx = this.getContext()
    const oscillator = ctx.createOscillator()
    const volume = ctx.createGain()
    const now = ctx.currentTime

    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, now)
    volume.gain.setValueAtTime(gain, now)
    volume.gain.exponentialRampToValueAtTime(0.001, now + duration)

    oscillator.connect(volume)
    volume.connect(ctx.destination)
    oscillator.start(now)
    oscillator.stop(now + duration)
  }

  income() {
    this.tone(780, 0.08)
    window.setTimeout(() => this.tone(1040, 0.12), 70)
  }

  expense() {
    this.tone(310, 0.08, 0.045)
    window.setTimeout(() => this.tone(230, 0.1, 0.04), 55)
  }

  mission() {
    this.tone(620, 0.07, 0.04, 'triangle')
    window.setTimeout(() => this.tone(930, 0.08, 0.038, 'triangle'), 65)
    window.setTimeout(() => this.tone(1240, 0.12, 0.034, 'square'), 135)
  }

  click() {
    this.tone(520, 0.035, 0.025)
  }
}

export const audioEngine = new AudioEngine()
