export type Card = {
  id: string
  question: string
  answer: string
  notePath: string
  noteTitle: string
  origin: 'callout' | 'ai'
}

export type ParsedNote = {
  path: string
  title: string
  contentHash: string
  markdown: string
  cards: Card[]
}
