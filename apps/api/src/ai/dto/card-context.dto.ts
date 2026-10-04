import { IsString, MaxLength } from 'class-validator'

export const MAX_QUESTION_LENGTH = 2000
export const MAX_ANSWER_LENGTH = 8000
export const MAX_NOTE_TITLE_LENGTH = 300

/** A card (or a missed card) as the model sees it: no ids, no scheduling data. */
export class CardContextDto {
  @IsString()
  @MaxLength(MAX_QUESTION_LENGTH)
  question!: string

  @IsString()
  @MaxLength(MAX_ANSWER_LENGTH)
  answer!: string

  @IsString()
  @MaxLength(MAX_NOTE_TITLE_LENGTH)
  noteTitle!: string
}
