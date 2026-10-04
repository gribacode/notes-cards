import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '../config/env.validation'

export interface GithubUser {
  id: number
  login: string
  avatarUrl: string
}

const TOKEN_URL = 'https://github.com/login/oauth/access_token'
const USER_URL = 'https://api.github.com/user'
const REQUEST_TIMEOUT_MS = 10_000

@Injectable()
export class GithubClient {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async exchangeCode(code: string): Promise<string> {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.config.get('GITHUB_CLIENT_ID', { infer: true }),
        client_secret: this.config.get('GITHUB_CLIENT_SECRET', { infer: true }),
        code,
        redirect_uri: this.config.get('GITHUB_CALLBACK_URL', { infer: true }),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`GitHub token exchange failed: HTTP ${response.status}`)

    const body = (await response.json()) as { access_token?: unknown; error?: unknown }
    if (typeof body.access_token !== 'string') throw new Error(`GitHub token exchange rejected: ${String(body.error)}`)
    return body.access_token
  }

  async fetchUser(accessToken: string): Promise<GithubUser> {
    const response = await fetch(USER_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'notes-cards',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`GitHub user request failed: HTTP ${response.status}`)

    const body = (await response.json()) as { id: number; login: string; avatar_url: string }
    return { id: body.id, login: body.login, avatarUrl: body.avatar_url }
  }
}
