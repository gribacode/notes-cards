export type CardState = {
  cardId: string
  stage: number
  intervalDays: number
  dueAt: string
  correct: number
  wrong: number
  hidden: boolean
  introducedAt: string
}

export type Review = {
  id: string
  cardId: string
  known: boolean
  answeredAt: string
  firstInSession: boolean
}
