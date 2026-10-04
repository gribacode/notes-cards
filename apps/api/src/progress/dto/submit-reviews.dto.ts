import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidateNested,
} from 'class-validator'

export const MAX_REVIEWS_PER_BATCH = 500
export const MAX_CARD_ID_LENGTH = 128
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

function NotInFuture() {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'notInFuture',
      target: target.constructor,
      propertyName,
      options: { message: `${propertyName} must not be more than 5 minutes in the future` },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && Date.parse(value) <= Date.now() + MAX_CLOCK_SKEW_MS,
      },
    })
}

export class ReviewDto {
  @IsUUID()
  id!: string

  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CARD_ID_LENGTH)
  cardId!: string

  @IsBoolean()
  known!: boolean

  @IsISO8601({ strict: true })
  @NotInFuture()
  answeredAt!: string

  @IsBoolean()
  firstInSession!: boolean
}

export class SubmitReviewsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_REVIEWS_PER_BATCH)
  @ValidateNested({ each: true })
  @Type(() => ReviewDto)
  reviews!: ReviewDto[]
}
