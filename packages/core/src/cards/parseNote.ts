import { sha256Hex } from '../hash'
import type { Card, ParsedNote } from './types'

// Only a top-level callout counts: after the first `>` comes the marker directly,
// so `> > [!question]-` does not match and stays plain text of the enclosing block.
const QUESTION_LINE = /^>[ \t]*\[!question\][+-]?[ \t]*(.*)$/i
const QUOTE_PREFIX = /^> ?/

export function cardId(notePath: string, question: string): Promise<string> {
  return sha256Hex(`${notePath.normalize('NFC')}\n${question.trim()}`)
}

export async function parseNote(rawPath: string, markdown: string): Promise<ParsedNote> {
  const path = rawPath.normalize('NFC')
  const normalized = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const title = noteTitleFromPath(path)
  const cards = await extractCards(path, title, stripFrontmatter(normalized))

  return { path, title, contentHash: await sha256Hex(normalized), markdown: normalized, cards }
}

function noteTitleFromPath(path: string): string {
  const basename = path.split(/[\\/]/).pop() ?? path
  return basename.replace(/\.md$/i, '')
}

function stripFrontmatter(markdown: string): string {
  const lines = markdown.split('\n')
  if (lines[0]?.trimEnd() !== '---') return markdown

  const closing = lines.findIndex((line, index) => index > 0 && line.trimEnd() === '---')
  return closing === -1 ? markdown : lines.slice(closing + 1).join('\n')
}

async function extractCards(notePath: string, noteTitle: string, body: string): Promise<Card[]> {
  const cards: Card[] = []
  const seenQuestions = new Set<string>()

  for (const block of findQuestionBlocks(body.split('\n'))) {
    const question = block.question.trim()
    const answer = trimBlankLines(block.answerLines.map((line) => line.replace(QUOTE_PREFIX, '')))
    if (!question || !answer || seenQuestions.has(question)) continue

    seenQuestions.add(question)
    cards.push({
      id: await cardId(notePath, question),
      question,
      answer,
      notePath,
      noteTitle,
      origin: 'callout',
    })
  }
  return cards
}

// Drops only outer blank lines, so indentation of the first code line survives.
function trimBlankLines(lines: string[]): string {
  const isContent = (line: string) => line.trim() !== ''
  const first = lines.findIndex(isContent)
  if (first === -1) return ''
  const last = lines.length - 1 - [...lines].reverse().findIndex(isContent)
  return lines.slice(first, last + 1).join('\n').trimEnd()
}

type QuestionBlock = { question: string; answerLines: string[] }

// A block runs until the first line without `>`; a new question title also starts a new block.
function findQuestionBlocks(lines: string[]): QuestionBlock[] {
  const blocks: QuestionBlock[] = []
  let current: QuestionBlock | undefined

  for (const line of lines) {
    const title = QUESTION_LINE.exec(line)
    if (title) {
      current = { question: title[1] ?? '', answerLines: [] }
      blocks.push(current)
    } else if (current && line.startsWith('>')) {
      current.answerLines.push(line)
    } else {
      current = undefined
    }
  }
  return blocks
}
