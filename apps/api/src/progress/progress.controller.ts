import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { JwtGuard } from '../common/jwt.guard'
import { UserId } from '../common/user-id.decorator'
import { CardParamsDto } from './dto/card-params.dto'
import { ProgressQueryDto } from './dto/progress-query.dto'
import { SetHiddenDto } from './dto/set-hidden.dto'
import { SubmitReviewsDto } from './dto/submit-reviews.dto'
import { ProgressService } from './progress.service'

const EXPORT_FILE_NAME = 'notes-cards-export.json'

@Controller()
@UseGuards(JwtGuard)
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Post('reviews')
  @HttpCode(200)
  submitReviews(@UserId() userId: string, @Body() { reviews }: SubmitReviewsDto) {
    return this.progress.submitReviews(userId, reviews)
  }

  @Get('progress')
  getProgress(@UserId() userId: string, @Query() { tz }: ProgressQueryDto) {
    return this.progress.getProgress(userId, tz)
  }

  @Patch('cards/:cardId')
  setHidden(@UserId() userId: string, @Param() { cardId }: CardParamsDto, @Body() { hidden }: SetHiddenDto) {
    return this.progress.setHidden(userId, cardId, hidden)
  }

  @Get('export')
  exportData(@UserId() userId: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Content-Disposition', `attachment; filename="${EXPORT_FILE_NAME}"`)
    return this.progress.exportData(userId)
  }
}
