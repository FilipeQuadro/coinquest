import { describe, expect, it } from 'vitest'
import { ProgrammerStateMachine } from './programmerStateMachine'

describe('ProgrammerStateMachine', () => {
  it('starts idle', () => {
    const states = new ProgrammerStateMachine()

    expect(states.state).toBe('idle')
    expect(states.baseState).toBe('idle')
  })

  it('returns to typing after an income reaction that interrupted typing', () => {
    const states = new ProgrammerStateMachine()

    states.setBaseState('typing')
    expect(states.startReaction('income')).toEqual({ state: 'income', queued: false })

    expect(states.finishReaction()).toEqual({ state: 'typing' })
    expect(states.state).toBe('typing')
  })

  it('returns to idle after an expense reaction that interrupted idle', () => {
    const states = new ProgrammerStateMachine()

    expect(states.startReaction('expense')).toEqual({ state: 'expense', queued: false })

    expect(states.finishReaction()).toEqual({ state: 'idle' })
  })

  it('queues one rapid reaction while another reaction is active', () => {
    const states = new ProgrammerStateMachine()

    states.setBaseState('typing')
    expect(states.startReaction('income')).toEqual({ state: 'income', queued: false })
    expect(states.startReaction('expense')).toEqual({ state: 'income', queued: true })

    expect(states.finishReaction()).toEqual({ state: 'expense', nextReaction: 'expense' })
    expect(states.finishReaction()).toEqual({ state: 'typing' })
  })

  it('does not start walking during an active reaction', () => {
    const states = new ProgrammerStateMachine()

    states.setBaseState('typing')
    states.startReaction('income')

    expect(states.setBaseState('walking')).toEqual({ state: 'income', accepted: false })
    expect(states.finishReaction()).toEqual({ state: 'typing' })
  })
})
