import { IsString, MaxLength, MinLength } from 'class-validator'
import { MAX_CARD_ID_LENGTH } from './submit-reviews.dto'

export class CardParamsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CARD_ID_LENGTH)
  cardId!: string
}
