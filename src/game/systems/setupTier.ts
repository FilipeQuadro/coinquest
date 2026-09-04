export type SetupTier = 'starter' | 'focused' | 'advanced' | 'legendary'

export interface RoomSetupState {
  tier: SetupTier
}

export function getInitialRoomSetupState(): RoomSetupState {
  return {
    tier: 'starter',
  }
}
