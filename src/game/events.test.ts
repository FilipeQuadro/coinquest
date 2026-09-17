import { describe, expect, it } from 'vitest'
import type { WorldProgressionState } from '../finance/world/worldProgression'
import { emitWorldProgression, financeBus } from './events'

describe('financeBus world progression event', () => {
  it('dispatches the ready-to-render world progression state', async () => {
    const state: WorldProgressionState = {
      tier: 'focused',
      title: 'Base focada',
      description: 'Orcamento, registros e missoes indicam um mes acompanhado.',
      reasons: ['Orcamento mensal configurado.'],
      nextHint: 'Mantenha os registros, o orcamento e as missoes em dia.',
      score: 5,
    }

    const received = await new Promise<WorldProgressionState>((resolve) => {
      const handler = ((event: CustomEvent<WorldProgressionState>) => {
        financeBus.removeEventListener('world-progression', handler as EventListener)
        resolve(event.detail)
      }) as EventListener

      financeBus.addEventListener('world-progression', handler)
      emitWorldProgression(state)
    })

    expect(received).toBe(state)
  })
})
