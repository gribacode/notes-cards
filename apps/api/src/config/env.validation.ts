import { plainToInstance, Transform } from 'class-transformer'
import { IsBoolean, IsInt, IsString, IsUrl, Max, Min, MinLength, validateSync } from 'class-validator'

const DEFAULT_PORT = 3000
const MIN_JWT_SECRET_LENGTH = 32
const MAX_PORT = 65535

function parseBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true
  if (value === 'false') return false
  return value
}

export class Env {
  @IsString()
  @MinLength(1)
  DATABASE_URL!: string

  @IsString()
  @MinLength(MIN_JWT_SECRET_LENGTH)
  JWT_SECRET!: string

  @IsString()
  @MinLength(1)
  GITHUB_CLIENT_ID!: string

  @IsString()
  @MinLength(1)
  GITHUB_CLIENT_SECRET!: string

  @IsUrl({ require_tld: false })
  GITHUB_CALLBACK_URL!: string

  @IsUrl({ require_tld: false })
  WEB_URL!: string

  @Transform(parseBoolean)
  @IsBoolean()
  COOKIE_SECURE: boolean = true

  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  @IsInt()
  @Min(1)
  @Max(MAX_PORT)
  PORT: number = DEFAULT_PORT
}

export function validateEnv(rawEnv: Record<string, unknown>): Env {
  const env = plainToInstance(Env, rawEnv, { enableImplicitConversion: false })
  const errors = validateSync(env, { skipMissingProperties: false })
  if (errors.length > 0) {
    const problems = errors.map((error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
    throw new Error(`Invalid environment variables:\n  ${problems.join('\n  ')}`)
  }
  return env
}
