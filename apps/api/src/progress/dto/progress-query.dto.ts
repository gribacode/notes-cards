import { IsString, registerDecorator } from 'class-validator'

const TIME_ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/

function isTimeZone(value: unknown): boolean {
  if (typeof value !== 'string' || !TIME_ZONE_NAME.test(value)) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

function IsTimeZone() {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isTimeZone',
      target: target.constructor,
      propertyName,
      options: { message: 'tz must be an IANA time zone name' },
      validator: { validate: isTimeZone },
    })
}

export class ProgressQueryDto {
  @IsString()
  @IsTimeZone()
  tz!: string
}
