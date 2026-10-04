import { randomBytes, timingSafeEqual } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '../config/env.validation'
import { UsersService } from '../users/users.service'
import { GithubClient } from './github.client'

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const STATE_BYTES = 32

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly github: GithubClient,
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  createState(): string {
    return randomBytes(STATE_BYTES).toString('hex')
  }

  authorizeUrl(state: string): string {
    const url = new URL(AUTHORIZE_URL)
    url.searchParams.set('client_id', this.config.get('GITHUB_CLIENT_ID', { infer: true }))
    url.searchParams.set('redirect_uri', this.config.get('GITHUB_CALLBACK_URL', { infer: true }))
    url.searchParams.set('state', state)
    url.searchParams.set('scope', '')
    return url.toString()
  }

  isStateValid(expected: unknown, actual: unknown): boolean {
    if (typeof expected !== 'string' || typeof actual !== 'string') return false
    const expectedBuffer = Buffer.from(expected)
    const actualBuffer = Buffer.from(actual)
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
  }

  /** Returns the user id, or null when GitHub refused the sign-in. The GitHub token never leaves this method. */
  async signInWithCode(code: string): Promise<string | null> {
    try {
      const accessToken = await this.github.exchangeCode(code)
      const githubUser = await this.github.fetchUser(accessToken)
      return await this.users.upsertFromGithub({
        githubId: githubUser.id,
        login: githubUser.login,
        avatarUrl: githubUser.avatarUrl,
      })
    } catch (error) {
      this.logger.warn(`GitHub sign-in failed: ${error instanceof Error ? error.message : 'unknown error'}`)
      return null
    }
  }
}
