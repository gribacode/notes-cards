import { Module } from '@nestjs/common'
import { UsersModule } from '../users/users.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { GithubClient } from './github.client'

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, GithubClient],
})
export class AuthModule {}
