import { describe, expect, it } from 'vitest'
import type { Goal } from '../../db/types'
import { detectNewGoalCompletions, snapshotGoalStatuses } from './goalCompletionTransitions'

function goal(id: string, status: Goal['status']): Goal {
  return {
    id,
    name: id,
    targetAmount: 1000,
    status,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
  }
}

describe('goal completion transitions', () => {
  it('detects active to completed exactly once for a status snapshot', () => {
    const completions = detectNewGoalCompletions({ pc: 'active' }, [goal('pc', 'completed')])

    expect(completions.map((item) => item.id)).toEqual(['pc'])
  })

  it('does not detect completed to completed', () => {
    const completions = detectNewGoalCompletions({ pc: 'completed' }, [goal('pc', 'completed')])

    expect(completions).toEqual([])
  })

  it('does not detect completed to active', () => {
    const completions = detectNewGoalCompletions({ pc: 'completed' }, [goal('pc', 'active')])

    expect(completions).toEqual([])
  })

  it('detects a new completion after a legitimate reopen', () => {
    const activeAgain = snapshotGoalStatuses([goal('pc', 'active')])
    const completions = detectNewGoalCompletions(activeAgain, [goal('pc', 'completed')])

    expect(completions.map((item) => item.id)).toEqual(['pc'])
  })

  it('does not detect archive or restore as a completion event', () => {
    expect(detectNewGoalCompletions({ pc: 'completed' }, [goal('pc', 'archived')])).toEqual([])
    expect(detectNewGoalCompletions({ pc: 'archived' }, [goal('pc', 'completed')])).toEqual([])
  })
})
