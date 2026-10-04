import { AiProviderError } from './ai-provider'

const REQUEST_TIMEOUT_MS = 60_000
const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_TOO_MANY_REQUESTS = 429
const INVALID_KEY_MARKER = /api key not valid/i

async function isInvalidKeyBody(response: Response): Promise<boolean> {
  try {
    return INVALID_KEY_MARKER.test(await response.text())
  } catch {
    return false
  }
}

async function failureOf(response: Response): Promise<AiProviderError> {
  if (response.status === HTTP_UNAUTHORIZED || response.status === HTTP_FORBIDDEN) return new AiProviderError('invalid_key')
  if (response.status === HTTP_TOO_MANY_REQUESTS) return new AiProviderError('rate_limited')
  if (await isInvalidKeyBody(response)) return new AiProviderError('invalid_key')
  return new AiProviderError('provider_error')
}

/** Calls a provider and returns parsed JSON; every failure becomes an `AiProviderError`. */
export async function fetchProviderJson(url: string, init: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch {
    throw new AiProviderError('provider_error')
  }
  if (!response.ok) throw await failureOf(response)
  try {
    return await response.json()
  } catch {
    throw new AiProviderError('provider_error')
  }
}

export function nonEmptyText(text: string | undefined): string {
  if (!text) throw new AiProviderError('provider_error')
  return text
}
