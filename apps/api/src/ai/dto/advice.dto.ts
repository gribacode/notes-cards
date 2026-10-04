import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator'
import { CardContextDto } from './card-context.dto'

const MAX_MISTAKES = 50

export class AdviceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_MISTAKES)
  @ValidateNested({ each: true })
  @Type(() => CardContextDto)
  mistakes!: CardContextDto[]
}
