import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.setup'
import { GithubClient, type GithubUser } from '../src/auth/github.client'
import { PrismaService } from '../src/prisma/prisma.service'

export const FAKE_GITHUB_ACCESS_TOKEN = 'gho_fake_access_token_must_never_leak'

export const FAKE_GITHUB_USER: GithubUser = { id: 4242, login: 'octocat', avatarUrl: 'https://avatars.test/octocat.png' }

export class FakeGithubClient {
  user: GithubUser = FAKE_GITHUB_USER
  failing = false

  async exchangeCode(): Promise<string> {
    if (this.failing) throw new Error('github is down')
    return FAKE_GITHUB_ACCESS_TOKEN
  }

  async fetchUser(accessToken: string): Promise<GithubUser> {
    if (accessToken !== FAKE_GITHUB_ACCESS_TOKEN) throw new Error('bad token')
    return this.user
  }
}

export interface TestApp {
  app: INestApplication
  prisma: PrismaService
  github: FakeGithubClient
}

export async function createTestApp(): Promise<TestApp> {
  const github = new FakeGithubClient()
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GithubClient)
    .useValue(github)
    .compile()
  const app = moduleRef.createNestApplication()
  configureApp(app)
  await app.init()
  return { app, prisma: app.get(PrismaService), github }
}

export async function truncateAll(prisma: PrismaService) {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE')
}
