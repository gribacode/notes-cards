import { Body, Controller, Delete, Get, HttpCode, Post, Put, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { JwtGuard } from '../common/jwt.guard'
import { UserId } from '../common/user-id.decorator'
import { AiService } from './ai.service'
import { AdviceDto } from './dto/advice.dto'
import { AskDto } from './dto/ask.dto'
import { GenerateCardsDto } from './dto/generate-cards.dto'
import { SaveKeyDto } from './dto/save-key.dto'

@Controller('ai')
@UseGuards(JwtGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Put('key')
  saveKey(@UserId() userId: string, @Body() dto: SaveKeyDto) {
    return this.ai.saveKey(userId, dto)
  }

  @Get('key')
  async getKey(@UserId() userId: string, @Res() response: Response) {
    // Nest sends an empty body for null; the web client expects the JSON literal `null`.
    response.json(await this.ai.getKey(userId))
  }

  @Delete('key')
  @HttpCode(204)
  deleteKey(@UserId() userId: string) {
    return this.ai.deleteKey(userId)
  }

  @Get('models')
  listModels(@UserId() userId: string) {
    return this.ai.listModels(userId)
  }

  @Post('ask')
  @HttpCode(200)
  ask(@UserId() userId: string, @Body() dto: AskDto) {
    return this.ai.ask(userId, dto)
  }

  @Post('advice')
  @HttpCode(200)
  advice(@UserId() userId: string, @Body() dto: AdviceDto) {
    return this.ai.advice(userId, dto)
  }

  @Post('cards')
  @HttpCode(200)
  generateCards(@UserId() userId: string, @Body() dto: GenerateCardsDto) {
    return this.ai.generateCards(userId, dto)
  }

  @Get('cards')
  listCards(@UserId() userId: string) {
    return this.ai.listCards(userId)
  }
}
