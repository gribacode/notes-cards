import { IsBoolean } from 'class-validator'

export class SetHiddenDto {
  @IsBoolean()
  hidden!: boolean
}
