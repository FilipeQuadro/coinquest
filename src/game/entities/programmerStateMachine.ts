export type ProgrammerBaseState = 'idle' | 'typing' | 'walking'
export type ProgrammerReactionState = 'income' | 'expense'
export type ProgrammerState = ProgrammerBaseState | ProgrammerReactionState

export interface ReactionTransition {
  state: ProgrammerState
  queued: boolean
}

export interface ReactionFinish {
  state: ProgrammerState
  nextReaction?: ProgrammerReactionState
}

export class ProgrammerStateMachine {
  private currentState: ProgrammerState = 'idle'
  private returnState: ProgrammerBaseState = 'idle'
  private queuedReaction?: ProgrammerReactionState

  get state() {
    return this.currentState
  }

  get baseState() {
    return this.returnState
  }

  setBaseState(state: ProgrammerBaseState) {
    if (isProgrammerReactionState(this.currentState)) {
      if (state !== 'walking') {
        this.returnState = state
      }

      return { state: this.currentState, accepted: false }
    }

    this.currentState = state
    this.returnState = state
    this.queuedReaction = undefined
    return { state: this.currentState, accepted: true }
  }

  startReaction(state: ProgrammerReactionState): ReactionTransition {
    if (isProgrammerReactionState(this.currentState)) {
      this.queuedReaction = state
      return { state: this.currentState, queued: true }
    }

    this.returnState = this.currentState
    this.currentState = state
    return { state: this.currentState, queued: false }
  }

  finishReaction(): ReactionFinish {
    if (!isProgrammerReactionState(this.currentState)) {
      return { state: this.currentState }
    }

    if (this.queuedReaction) {
      const nextReaction = this.queuedReaction
      this.queuedReaction = undefined
      this.currentState = nextReaction
      return { state: this.currentState, nextReaction }
    }

    this.currentState = this.returnState
    return { state: this.currentState }
  }
}

export function isProgrammerReactionState(state: ProgrammerState): state is ProgrammerReactionState {
  return state === 'income' || state === 'expense'
}
