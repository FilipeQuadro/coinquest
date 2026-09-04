import type { Goal } from '../../db/types'

export type GoalStatusSnapshot = Record<string, Goal['status']>

export function snapshotGoalStatuses(goals: Goal[]): GoalStatusSnapshot {
  return Object.fromEntries(goals.map((goal) => [goal.id, goal.status]))
}

export function detectNewGoalCompletions(previous: GoalStatusSnapshot, currentGoals: Goal[]) {
  return currentGoals.filter((goal) => previous[goal.id] === 'active' && goal.status === 'completed')
}
