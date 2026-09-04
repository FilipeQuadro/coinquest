export const ASSET_BASE_PATH = '/assets'

export const assetFolders = {
  characters: `${ASSET_BASE_PATH}/characters`,
  furniture: `${ASSET_BASE_PATH}/furniture`,
  tech: `${ASSET_BASE_PATH}/tech`,
  environment: `${ASSET_BASE_PATH}/environment`,
  effects: `${ASSET_BASE_PATH}/effects`,
  uiWorld: `${ASSET_BASE_PATH}/ui-world`,
} as const

export type AssetCategory = keyof typeof assetFolders
export type AssetKind = 'image' | 'spritesheet' | 'atlas'

export const spriteKeys = {
  programmer: 'cq-character-programmer',
  workstationBase: 'cq-furniture-workstation-base',
  digitalVaultShell: 'cq-tech-digital-vault-shell',
  skyDay: 'cq-environment-sky-day',
  skyNight: 'cq-environment-sky-night',
  cityFarDay: 'cq-environment-city-far-day',
  cityFarNight: 'cq-environment-city-far-night',
  cityMidDay: 'cq-environment-city-mid-day',
  cityMidNight: 'cq-environment-city-mid-night',
  cityNearDay: 'cq-environment-city-near-day',
  cityNearNight: 'cq-environment-city-near-night',
  windowFrame: 'cq-environment-window-frame',
  wall: 'cq-environment-wall',
  floor: 'cq-environment-floor',
  softGlow: 'cq-effect-soft-glow',
  programmerBadge: 'cq-ui-world-programmer-badge',
} as const

export const fallbackSpriteKeys = {
  programmer: 'cq-fallback-character-programmer',
  workstationBase: 'cq-fallback-furniture-workstation-base',
  digitalVaultShell: 'cq-fallback-tech-digital-vault-shell',
  skyDay: 'cq-fallback-environment-sky-day',
  skyNight: 'cq-fallback-environment-sky-night',
  cityFarDay: 'cq-fallback-environment-city-far-day',
  cityFarNight: 'cq-fallback-environment-city-far-night',
  cityMidDay: 'cq-fallback-environment-city-mid-day',
  cityMidNight: 'cq-fallback-environment-city-mid-night',
  cityNearDay: 'cq-fallback-environment-city-near-day',
  cityNearNight: 'cq-fallback-environment-city-near-night',
  windowFrame: 'cq-fallback-environment-window-frame',
  wall: 'cq-fallback-environment-wall',
  floor: 'cq-fallback-environment-floor',
  softGlow: 'cq-fallback-effect-soft-glow',
  programmerBadge: 'cq-fallback-ui-world-programmer-badge',
} as const

export type SpriteId = keyof typeof spriteKeys

interface BaseAssetDefinition {
  id: SpriteId
  key: string
  fallbackKey: string
  category: AssetCategory
  kind: AssetKind
  src: string | null
}

export interface ImageAssetDefinition extends BaseAssetDefinition {
  kind: 'image'
}

export interface SpriteSheetAssetDefinition extends BaseAssetDefinition {
  kind: 'spritesheet'
  frameWidth: number
  frameHeight: number
}

export interface AtlasAssetDefinition extends BaseAssetDefinition {
  kind: 'atlas'
  atlasJson: string | null
}

export type AssetDefinition = ImageAssetDefinition | SpriteSheetAssetDefinition | AtlasAssetDefinition

export const coinQuestAssets = {
  programmer: {
    id: 'programmer',
    key: spriteKeys.programmer,
    fallbackKey: fallbackSpriteKeys.programmer,
    category: 'characters',
    kind: 'spritesheet',
    src: `${assetFolders.characters}/programmer.png`,
    frameWidth: 48,
    frameHeight: 64,
  },
  workstationBase: {
    id: 'workstationBase',
    key: spriteKeys.workstationBase,
    fallbackKey: fallbackSpriteKeys.workstationBase,
    category: 'furniture',
    kind: 'image',
    src: `${assetFolders.furniture}/workstation-base.png`,
  },
  digitalVaultShell: {
    id: 'digitalVaultShell',
    key: spriteKeys.digitalVaultShell,
    fallbackKey: fallbackSpriteKeys.digitalVaultShell,
    category: 'tech',
    kind: 'image',
    src: `${assetFolders.tech}/digital-vault-shell.png`,
  },
  skyDay: {
    id: 'skyDay',
    key: spriteKeys.skyDay,
    fallbackKey: fallbackSpriteKeys.skyDay,
    category: 'environment',
    kind: 'image',
    src: `${assetFolders.environment}/sky-day.png`,
  },
  skyNight: {
    id: 'skyNight',
    key: spriteKeys.skyNight,
    fallbackKey: fallbackSpriteKeys.skyNight,
    category: 'environment',
    kind: 'image',
    src: `${assetFolders.environment}/sky-night.png`,
  },
  cityFarDay: {
    id: 'cityFarDay',
    key: spriteKeys.cityFarDay,
    fallbackKey: fallbackSpriteKeys.cityFarDay,
    category: 'environment',
    kind: 'image',
    src: `${assetFolders.environment}/city-far-day.png`,
  },
  cityFarNight: {
    id: 'cityFarNight',
    key: spriteKeys.cityFarNight,
    fallbackKey: fallbackSpriteKeys.cityFarNight,
    category: 'environment',
    kind: 'image',
    src: `${assetFolders.environment}/city-far-night.png`,
  },
  cityMidDay: {
    id: 'cityMidDay',
    key: spriteKeys.cityMidDay,
    fallbackKey: fallbackSpriteKeys.cityMidDay,
    category: 'environment',
    kind: 'image',
    src: `${assetFolders.environment}/city-mid-day.png`,
  },
  cityMidNight: {
    id: 'cityMidNight',
    key: spriteKeys.cityMidNight,
    fallbackKey: fallbackSpriteKeys.cityMidNight,
    category: 'environment',
    kind: 'image',
    src: `${assetFolders.environment}/city-mid-night.png`,
  },
  cityNearDay: {
    id: 'cityNearDay',
    key: spriteKeys.cityNearDay,
    fallbackKey: fallbackSpriteKeys.cityNearDay,
    category: 'environment',
    kind: 'image',
    src: `${assetFolders.environment}/city-near-day.png`,
  },
  cityNearNight: {
    id: 'cityNearNight',
    key: spriteKeys.cityNearNight,
    fallbackKey: fallbackSpriteKeys.cityNearNight,
    category: 'environment',
    kind: 'image',
    src: `${assetFolders.environment}/city-near-night.png`,
  },
  windowFrame: {
    id: 'windowFrame',
    key: spriteKeys.windowFrame,
    fallbackKey: fallbackSpriteKeys.windowFrame,
    category: 'environment',
    kind: 'image',
    src: `${assetFolders.environment}/window-frame.png`,
  },
  wall: {
    id: 'wall',
    key: spriteKeys.wall,
    fallbackKey: fallbackSpriteKeys.wall,
    category: 'environment',
    kind: 'image',
    src: `${assetFolders.environment}/wall.png`,
  },
  floor: {
    id: 'floor',
    key: spriteKeys.floor,
    fallbackKey: fallbackSpriteKeys.floor,
    category: 'environment',
    kind: 'image',
    src: `${assetFolders.environment}/floor.png`,
  },
  softGlow: {
    id: 'softGlow',
    key: spriteKeys.softGlow,
    fallbackKey: fallbackSpriteKeys.softGlow,
    category: 'effects',
    kind: 'image',
    src: null,
  },
  programmerBadge: {
    id: 'programmerBadge',
    key: spriteKeys.programmerBadge,
    fallbackKey: fallbackSpriteKeys.programmerBadge,
    category: 'uiWorld',
    kind: 'image',
    src: null,
  },
} as const satisfies Record<string, AssetDefinition>

export function getAssetDefinition(id: SpriteId) {
  return coinQuestAssets[id]
}

export function getLoadableAssets() {
  return (Object.values(coinQuestAssets) as AssetDefinition[]).filter((asset) => asset.src)
}

export function resolveTextureKey(hasTexture: (key: string) => boolean, id: SpriteId) {
  const asset = getAssetDefinition(id)
  return hasTexture(asset.key) ? asset.key : asset.fallbackKey
}
