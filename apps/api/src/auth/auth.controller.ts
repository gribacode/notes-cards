import { BadRequestException, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request, Response } from 'express'
import { SessionCookie } from '../common/session-cookie'
import type { Env } from '../config/env.validation'
import { AuthService } from './auth.service'

const OAUTH_STATE_COOKIE = 'oauth_state'
const OAUTH_STATE_COOKIE_PATH = '/api/auth'
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessionCookie: SessionCookie,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get('github')
  startGithubSignIn(@Res() response: Response) {
    const state = this.auth.createState()
    response.cookie(OAUTH_STATE_COOKIE, state, { ...this.stateCookieOptions(), maxAge: OAUTH_STATE_TTL_MS })
    response.redirect(this.auth.authorizeUrl(state))
  }

  @Get('github/callback')
  async finishGithubSignIn(
    @Query('code') code: unknown,
    @Query('state') state: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const expectedState: unknown = request.cookies?.[OAUTH_STATE_COOKIE]
    response.clearCookie(OAUTH_STATE_COOKIE, this.stateCookieOptions())
    if (!this.auth.isStateValid(expectedState, state)) throw new BadRequestException('Invalid OAuth state')

    const webUrl = this.config.get('WEB_URL', { infer: true })
    const userId = typeof code === 'string' ? await this.auth.signInWithCode(code) : null
    if (userId === null) return response.redirect(`${webUrl}/?authError=1`)

    await this.sessionCookie.issue(response, userId)
    response.redirect(webUrl)
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response) {
    this.sessionCookie.clear(response)
  }

  private stateCookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'lax' as const,
      path: OAUTH_STATE_COOKIE_PATH,
    }
  }
}
