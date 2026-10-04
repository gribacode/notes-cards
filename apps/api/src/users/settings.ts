export type SettingsSource = { kind: 'github'; url: string } | { kind: 'local'; label: string } | null

export interface Settings {
  newPerDay: number
  maxCards: number
  animation: boolean
  generateAiCards: boolean
  source: SettingsSource
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 10,
  maxCards: 20,
  animation: true,
  generateAiCards: true,
  source: null,
}
