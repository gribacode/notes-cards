import { Module } from '@nestjs/common'
import { Clock } from './clock'
import { ProgressController } from './progress.controller'
import { ProgressService } from './progress.service'

@Module({ controllers: [ProgressController], providers: [ProgressService, Clock] })
export class ProgressModule {}
