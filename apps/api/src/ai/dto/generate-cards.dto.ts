import { IsString, Matches, MaxLength, MinLength } from 'class-validator'

const MAX_NOTE_PATH_LENGTH = 500
const MAX_MARKDOWN_LENGTH = 30_000

export class GenerateCardsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NOTE_PATH_LENGTH)
  notePath!: string

  @Matches(/^[0-9a-f]{64}$/)
  contentHash!: string

  @IsString()
  @MaxLength(MAX_MARKDOWN_LENGTH)
  markdown!: string
}
