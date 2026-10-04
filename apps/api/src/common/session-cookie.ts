import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Response } from 'express'
import type { Env } from '../config/env.validation'

export const SESSION_COOKIE = 'session'

const SESSION_DAYS = 30
const SESSION_COOKIE_PATH = '/api'
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

@Injectable()
export class SessionCookie {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async issue(response: Response, userId: string) {
    const token = await this.jwt.signAsync({ sub: userId }, { expiresIn: `${SESSION_DAYS}d` })
    response.cookie(SESSION_COOKIE, token, { ...this.options(), maxAge: SESSION_DAYS * MILLISECONDS_PER_DAY })
  }

  clear(response: Response) {
    response.clearCookie(SESSION_COOKIE, this.options())
  }

  private options() {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'lax' as const,
      path: SESSION_COOKIE_PATH,
    }
  }
}
