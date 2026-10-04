import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { configureApp } from './app.setup'

const DEFAULT_PORT = 3000

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  configureApp(app)
  await app.listen(process.env.PORT ?? DEFAULT_PORT)
}

void bootstrap()
