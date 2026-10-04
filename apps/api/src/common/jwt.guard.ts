import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { SESSION_COOKIE } from './session-cookie'

export type AuthenticatedRequest = Request & { userId: string }

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { userId?: string }>()
    const token: unknown = request.cookies?.[SESSION_COOKIE]
    if (typeof token !== 'string') throw new UnauthorizedException()

    try {
      const payload = await this.jwt.verifyAsync<{ sub?: unknown }>(token)
      if (typeof payload.sub !== 'string') throw new UnauthorizedException()
      request.userId = payload.sub
      return true
    } catch {
      throw new UnauthorizedException()
    }
  }
}
