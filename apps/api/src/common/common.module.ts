import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import type { Env } from '../config/env.validation'
import { JwtGuard } from './jwt.guard'
import { SessionCookie } from './session-cookie'

const JWT_ALGORITHM = 'HS256'

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { algorithm: JWT_ALGORITHM },
        verifyOptions: { algorithms: [JWT_ALGORITHM] },
      }),
    }),
  ],
  providers: [JwtGuard, SessionCookie],
  exports: [JwtGuard, SessionCookie, JwtModule],
})
export class CommonModule {}
