import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { AppModule } from './app.module'
import { configureApp } from './app.setup'
import type { Env } from './config/env.validation'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { abortOnError: false })
  configureApp(app)
  app.enableShutdownHooks()
  await app.listen(app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true }))
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
