import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  registerDecorator,
  ValidateNested,
} from 'class-validator'
import { CardContextDto } from './card-context.dto'

const MAX_MESSAGE_LENGTH = 4000
const MAX_MESSAGES = 20

function LastIsFromUser() {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'lastIsFromUser',
      target: target.constructor,
      propertyName,
      options: { message: 'the last message must be from the user' },
      validator: {
        validate: (value: unknown) => Array.isArray(value) && (value.at(-1) as { role?: unknown } | undefined)?.role === 'user',
      },
    })
}

export class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant'

  @IsString()
  @MaxLength(MAX_MESSAGE_LENGTH)
  content!: string
}

export class AskDto {
  @ValidateNested()
  @Type(() => CardContextDto)
  card!: CardContextDto

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_MESSAGES)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  @LastIsFromUser()
  messages!: ChatMessageDto[]
}
