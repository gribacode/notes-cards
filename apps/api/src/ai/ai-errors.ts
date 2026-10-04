import { HttpException, HttpStatus } from '@nestjs/common'
import type { AiErrorCode } from './providers/ai-provider'

const ERRORS: Record<AiErrorCode, { status: HttpStatus; message: string }> = {
  no_key: { status: HttpStatus.BAD_REQUEST, message: 'Ключ ИИ не задан. Добавьте его в настройках.' },
  invalid_key: { status: HttpStatus.UNPROCESSABLE_ENTITY, message: 'Провайдер отклонил ключ. Проверьте ключ и права доступа.' },
  rate_limited: { status: HttpStatus.TOO_MANY_REQUESTS, message: 'Превышен лимит запросов к провайдеру. Повторите позже.' },
  provider_error: { status: HttpStatus.BAD_GATEWAY, message: 'Провайдер ИИ вернул ошибку или недоступен. Повторите позже.' },
}

export const UNREADABLE_KEY_MESSAGE = 'Сохраненный ключ не удалось прочитать. Введите ключ заново.'

export function aiHttpError(code: AiErrorCode, message?: string): HttpException {
  const { status, message: defaultMessage } = ERRORS[code]
  return new HttpException({ code, message: message ?? defaultMessage }, status)
}
