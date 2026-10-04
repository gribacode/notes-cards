import { Injectable, UnauthorizedException } from '@nestjs/common'
import { instanceToPlain } from 'class-transformer'
import { PrismaService } from '../prisma/prisma.service'
import type { UpdateSettingsDto } from './dto/update-settings.dto'
import { DEFAULT_SETTINGS, type Settings } from './settings'

export interface Profile {
  id: string
  login: string
  avatarUrl: string
  settings: Settings
}

export interface GithubIdentity {
  githubId: number
  login: string
  avatarUrl: string
}

function definedFields(patch: Record<string, unknown>): Partial<Settings> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<Settings>
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertFromGithub({ githubId, login, avatarUrl }: GithubIdentity): Promise<string> {
    const user = await this.prisma.user.upsert({
      where: { githubId },
      update: { login, avatarUrl },
      create: { githubId, login, avatarUrl, settings: { ...DEFAULT_SETTINGS } },
    })
    return user.id
  }

  async getProfile(userId: string): Promise<Profile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new UnauthorizedException()
    return { id: user.id, login: user.login, avatarUrl: user.avatarUrl, settings: user.settings as unknown as Settings }
  }

  async updateSettings(userId: string, patch: UpdateSettingsDto): Promise<Settings> {
    const { settings: current } = await this.getProfile(userId)
    const merged: Settings = { ...current, ...definedFields(instanceToPlain(patch)) }
    await this.prisma.user.update({ where: { id: userId }, data: { settings: { ...merged } } })
    return merged
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.prisma.user.deleteMany({ where: { id: userId } })
  }
}
