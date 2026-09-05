import { useEffect } from 'react'
import { startSyncLifecycle } from '../sync/syncLifecycle'

export function SyncLifecycle() {
  useEffect(() => startSyncLifecycle(), [])
  return null
}
