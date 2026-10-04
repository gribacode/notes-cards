import { Body, Controller, Delete, Get, HttpCode, Put, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { JwtGuard } from '../common/jwt.guard'
import { SessionCookie } from '../common/session-cookie'
import { UserId } from '../common/user-id.decorator'
import { UpdateSettingsDto } from './dto/update-settings.dto'
import { UsersService } from './users.service'

@Controller('me')
@UseGuards(JwtGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly sessionCookie: SessionCookie,
  ) {}

  @Get()
  getProfile(@UserId() userId: string) {
    return this.users.getProfile(userId)
  }

  @Put('settings')
  updateSettings(@UserId() userId: string, @Body() patch: UpdateSettingsDto) {
    return this.users.updateSettings(userId, patch)
  }

  @Delete()
  @HttpCode(204)
  async deleteAccount(@UserId() userId: string, @Res({ passthrough: true }) response: Response) {
    await this.users.deleteAccount(userId)
    this.sessionCookie.clear(response)
  }
}
