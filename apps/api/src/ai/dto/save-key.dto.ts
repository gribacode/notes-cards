import { Transform } from 'class-transformer'
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import type { AiProviderName } from '../providers/ai-provider'

export const AI_PROVIDERS: AiProviderName[] = ['gemini', 'openai']
const MAX_KEY_LENGTH = 300
const MAX_MODEL_LENGTH = 100

export class SaveKeyDto {
  @IsIn(AI_PROVIDERS)
  provider!: AiProviderName

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_KEY_LENGTH)
  key!: string

  @IsString()
  @MinLength(1)
  @MaxLength(MAX_MODEL_LENGTH)
  @Matches(/^[\w.:-]+$/)
  model!: string
}
