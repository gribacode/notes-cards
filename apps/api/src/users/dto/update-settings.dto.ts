import { Type } from 'class-transformer'
import { Equals, IsBoolean, IsInt, IsOptional, IsString, IsUrl, Max, Min, MinLength, ValidateNested } from 'class-validator'

const MAX_NEW_PER_DAY = 100
const MIN_MAX_CARDS = 5
const MAX_MAX_CARDS = 100

export class GithubSourceDto {
  @Equals('github')
  kind!: 'github'

  @IsUrl({ require_tld: false })
  url!: string
}

export class LocalSourceDto {
  @Equals('local')
  kind!: 'local'

  @IsString()
  @MinLength(1)
  label!: string
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_NEW_PER_DAY)
  newPerDay?: number

  @IsOptional()
  @IsInt()
  @Min(MIN_MAX_CARDS)
  @Max(MAX_MAX_CARDS)
  maxCards?: number

  @IsOptional()
  @IsBoolean()
  animation?: boolean

  @IsOptional()
  @IsBoolean()
  generateAiCards?: boolean

  @IsOptional()
  @ValidateNested()
  @Type(() => Object, {
    keepDiscriminatorProperty: true,
    discriminator: {
      property: 'kind',
      subTypes: [
        { value: GithubSourceDto, name: 'github' },
        { value: LocalSourceDto, name: 'local' },
      ],
    },
  })
  source?: GithubSourceDto | LocalSourceDto | null
}
