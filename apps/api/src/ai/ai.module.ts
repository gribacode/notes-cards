import { Module } from '@nestjs/common'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'
import { AiProviderFactory } from './providers/provider-factory'

@Module({ controllers: [AiController], providers: [AiService, AiProviderFactory] })
export class AiModule {}
