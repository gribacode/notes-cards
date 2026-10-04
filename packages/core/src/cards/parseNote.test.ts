import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cardId, parseNote } from './parseNote'

const fixture = readFileSync(new URL('./__fixtures__/event-loop.md', import.meta.url), 'utf8')
const PATH = 'js/Event Loop.md'

describe('parseNote', () => {
  it('extracts three cards from a realistic note and skips the warning callout', async () => {
    const note = await parseNote(PATH, fixture)

    expect(note.cards.map((card) => card.question)).toEqual([
      'Почему setTimeout(fn, 0) выполняется после Promise.then?',
      'Какие задачи относятся к микрозадачам?',
      'Что такое макрозадача?',
    ])
    expect(note.cards.every((card) => card.origin === 'callout')).toBe(true)
  })

  it('takes the title from the file basename without .md', async () => {
    const note = await parseNote(PATH, fixture)

    expect(note.title).toBe('Event Loop')
    expect(note.path).toBe(PATH)
    expect(note.cards[0]).toMatchObject({ notePath: PATH, noteTitle: 'Event Loop' })
  })

  it('keeps fenced code in the answer with the callout prefix removed', async () => {
    const note = await parseNote(PATH, fixture)

    expect(note.cards[0]?.answer).toBe(
      [
        '`then` ставит колбэк в очередь микрозадач.',
        '',
        '```js',
        "Promise.resolve().then(() => log('B'))",
        "setTimeout(() => log('A'), 0)",
        '```',
      ].join('\n'),
    )
  })

  it('keeps list items in the answer', async () => {
    const note = await parseNote(PATH, fixture)

    expect(note.cards[1]?.answer).toBe(
      '- `Promise.then`\n- `queueMicrotask`\n- `MutationObserver`',
    )
  })

  it('skips a card with an empty answer', async () => {
    const note = await parseNote('a.md', '> [!question]- Вопрос без ответа?\n\nТекст')

    expect(note.cards).toEqual([])
  })

  it('skips a card with an empty question', async () => {
    const note = await parseNote('a.md', '> [!question]-\n> Ответ без вопроса')

    expect(note.cards).toEqual([])
  })

  it('does not treat a callout nested inside another callout as a card', async () => {
    const markdown = '> [!note] Заметка\n> > [!question]- Вложенный вопрос?\n> > Ответ'

    const note = await parseNote('a.md', markdown)

    expect(note.cards).toEqual([])
  })

  it('keeps a nested callout as plain answer text of the enclosing question', async () => {
    const markdown = '> [!question]- Внешний?\n> Ответ\n> > [!question]- Вложенный?\n> > Текст'

    const note = await parseNote('a.md', markdown)

    expect(note.cards).toHaveLength(1)
    expect(note.cards[0]?.answer).toBe('Ответ\n> [!question]- Вложенный?\n> Текст')
  })

  it('ignores frontmatter and a question-like line inside it', async () => {
    const markdown = '---\n> [!question]- Из frontmatter?\n> Нет\n---\n> [!question]- Настоящий?\n> Да'

    const note = await parseNote('a.md', markdown)

    expect(note.cards.map((card) => card.question)).toEqual(['Настоящий?'])
  })

  it('normalizes CRLF to LF in markdown, answers and hash', async () => {
    const lf = await parseNote(PATH, fixture)
    const crlf = await parseNote(PATH, fixture.replace(/\n/g, '\r\n'))

    expect(crlf.markdown).toBe(lf.markdown)
    expect(crlf.markdown).not.toContain('\r')
    expect(crlf.contentHash).toBe(lf.contentHash)
    expect(crlf.cards).toEqual(lf.cards)
  })

  it('accepts an uppercase callout type', async () => {
    const note = await parseNote('a.md', '> [!QUESTION]- Что?\n> Это')

    expect(note.cards).toHaveLength(1)
  })

  it('stops the block at the first line without a > prefix', async () => {
    const note = await parseNote('a.md', '> [!question]- Что?\n> Ответ\nне часть ответа\n> хвост')

    expect(note.cards[0]?.answer).toBe('Ответ')
  })

  it('keeps only the first of duplicate questions in one note', async () => {
    const markdown = '> [!question]- Что?\n> Первый\n\n> [!question]- Что?\n> Второй'

    const note = await parseNote('a.md', markdown)

    expect(note.cards.map((card) => card.answer)).toEqual(['Первый'])
  })

  it('hashes the normalized markdown as 64 hex characters', async () => {
    const note = await parseNote(PATH, fixture)

    expect(note.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect((await parseNote(PATH, fixture + '\nещё')).contentHash).not.toBe(note.contentHash)
  })

  it('gives each card the id from cardId', async () => {
    const note = await parseNote(PATH, fixture)

    expect(note.cards[0]?.id).toBe(await cardId(PATH, note.cards[0]?.question ?? ''))
  })
})

describe('parseNote edge cases', () => {
  it('treats adjacent questions without a blank line as two cards', async () => {
    const note = await parseNote('a.md', '> [!question]- A\n> a\n> [!question]- B\n> b')

    expect(note.cards.map((card) => [card.question, card.answer])).toEqual([
      ['A', 'a'],
      ['B', 'b'],
    ])
  })

  it('keeps indentation of an indented first answer line', async () => {
    const note = await parseNote('a.md', '> [!question]- Q?\n>\n>     indented()\n> text\n>')

    expect(note.cards[0]?.answer).toBe('    indented()\ntext')
  })

  it('parses a BOM-prefixed note with frontmatter like one without BOM', async () => {
    const plain = await parseNote(PATH, fixture)
    const bom = await parseNote(PATH, `\uFEFF${fixture}`)

    expect(bom).toEqual(plain)
  })

  it('NFC-normalizes the path so NFD and NFC give equal ids and titles', async () => {
    const nfc = 'Краткий.md'.normalize('NFC')
    const nfd = nfc.normalize('NFD')
    expect(nfd).not.toBe(nfc)

    const fromNfd = await parseNote(nfd, '> [!question]- Q?\n> a')
    const fromNfc = await parseNote(nfc, '> [!question]- Q?\n> a')

    expect(await cardId(nfd, 'Q?')).toBe(await cardId(nfc, 'Q?'))
    expect(fromNfd).toEqual(fromNfc)
    expect(fromNfd.title).toBe(nfc.replace('.md', ''))
  })

  it('does not strip an unclosed frontmatter', async () => {
    const note = await parseNote('a.md', '---\n> [!question]- Q?\n> a')

    expect(note.cards).toHaveLength(1)
  })

  it('accepts quote lines without a space after >', async () => {
    const note = await parseNote('a.md', '>[!question]- Q?\n>a')

    expect(note.cards[0]).toMatchObject({ question: 'Q?', answer: 'a' })
  })

  it('ignores trailing spaces around the question text', async () => {
    const note = await parseNote('a.md', '> [!question]-   Q?   \n> a')

    expect(note.cards[0]?.question).toBe('Q?')
  })

  it('keeps a quoted line inside a fenced answer block as `> foo`', async () => {
    const note = await parseNote('a.md', '> [!question]- Q?\n> ```md\n> > foo\n> ```')

    expect(note.cards[0]?.answer).toBe('```md\n> foo\n```')
  })
})

describe('cardId', () => {
  it('is the SHA-256 hex of path, newline and trimmed question', async () => {
    const expected = await cardId('a.md', 'Что?')

    expect(expected).toMatch(/^[0-9a-f]{64}$/)
    expect(await cardId('a.md', '  Что?  ')).toBe(expected)
    expect(await cardId('b.md', 'Что?')).not.toBe(expected)
  })

  it('matches a known SHA-256 value', async () => {
    // printf 'a.md\nq' | shasum -a 256
    expect(await cardId('a.md', 'q')).toBe(
      'f556a6b29b518e43eee68b2aa046c0cd2e6633a4f2257ca5b91e18bae57411a3',
    )
  })
})
