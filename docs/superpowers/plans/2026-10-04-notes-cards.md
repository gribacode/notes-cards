# План: карточки из конспектов

Спек: `docs/superpowers/specs/2026-10-04-notes-cards-design.md`
Подход: чистое ядро `packages/core` (парсер, Лейтнер, статистика) общее для `apps/web` (`react-evolution` small) и `apps/api` (`nest-standard`). Web парсит конспекты в браузере и ходит в api по относительному `/api`: в проде через nginx на VPS, локально через proxy Vite. Сессия в httpOnly cookie.
Проверка всего плана: `npm run check` (lint, lint:arch, typecheck, test во всех workspaces) и `npx playwright test`, ожидается все зеленое.
Коммиты делает пользователь, хук devkit запрещает агенту `git commit`. После каждой задачи агент дает готовую команду.

## 1. Поднять монорепозиторий и каркасы пакетов

Что: убрать из индекса файлы прошлой попытки, сделать npm workspaces, общий `tsconfig.base.json` (strict), ESLint flat config, Vitest и скрипт `check`. Каркас web (Vite, React, Tailwind, shadcn/ui, `lucide-react`, proxy `/api` на `localhost:3000`), каркас api (Nest, `GET /api/health`), `docker-compose.yml` с Postgres. После задачи пользователь запускает `/devkit:arch init apps/web` (react-evolution, small) и `/devkit:arch init apps/api` (nest-standard).
Файлы: `package.json`, `tsconfig.base.json`, `eslint.config.js`, `.nvmrc` (Node 22), `docker-compose.yml`, `packages/core/src/index.ts`, `apps/web/{package.json,vite.config.ts,src/main.tsx,src/app/App.tsx}`, `apps/api/{package.json,src/main.ts,src/app.module.ts}`.
Проверка: `npm run check` проходит, `docker compose up -d db && npm run dev` отдает страницу, `curl localhost:5173/api/health` отвечает `{"ok":true}`.

## 2. Парсер карточек в ядре

Что: достать из Markdown `> [!question]- вопрос` и ответ из строк `>` с кодом и списками, вычислить id карточки и хэш заметки. SHA-256 через `crypto.subtle`, он есть и в браузере, и в Node 22.
Файлы: `packages/core/src/cards/{parseNote,types}.ts`, `packages/core/src/hash.ts`, `packages/core/src/cards/__fixtures__/*.md` по шаблону из `notes`.
Интерфейс:
```ts
type Card = { id: string; question: string; answer: string; notePath: string; noteTitle: string; origin: 'callout' | 'ai' }
type ParsedNote = { path: string; title: string; contentHash: string; markdown: string; cards: Card[] }
function parseNote(path: string, markdown: string): Promise<ParsedNote>
function cardId(notePath: string, question: string): Promise<string>
```
Проверка: `npm test -w packages/core`. Должны пройти: код в ответе, пустой ответ (карточка пропускается), вложенный callout, `[!warning]` (не карточка), frontmatter, CRLF.

## 3. Лейтнер и статистика в ядре

Что: переход ступени по ответу, состав сессии, серия дней. Время и рандом передаются параметрами.
Файлы: `packages/core/src/schedule/{leitner,buildSession}.ts`, `packages/core/src/stats/streak.ts`.
Интерфейс:
```ts
type CardState = { cardId: string; stage: number; intervalDays: number; dueAt: string; correct: number; wrong: number; hidden: boolean }
type Review = { id: string; cardId: string; known: boolean; answeredAt: string; firstInSession: boolean }
function applyAnswer(prev: CardState | undefined, cardId: string, known: boolean, now: Date): CardState
function buildSession(cards: Card[], states: ReadonlyMap<string, CardState>, opts: { now: Date; newLeftToday: number; maxCards: number; random: () => number }): Card[]
function streak(activeDays: readonly string[], today: string): { current: number; best: number }
```
Проверка: `npm test -w packages/core`. Должно выполняться: 1→3→7→21→60→120 дней, «не знал» сбрасывает на 1, скрытые карточки исключаются, просроченные идут раньше новых, карточки одного конспекта не стоят подряд, если есть другие.

## 4. API: база, конфиг, вход через GitHub

Что: Prisma со схемой (User, Source, CardState, Review, AiKey, AiCard), `config/` с валидацией env, OAuth GitHub с пустым scope. Callback ставит JWT в cookie `httpOnly; Secure; SameSite=Lax; Path=/api` и редиректит на `WEB_URL`.
Файлы: `apps/api/prisma/schema.prisma`, `apps/api/src/config/*`, `apps/api/src/prisma/prisma.{module,service}.ts`, `apps/api/src/auth/{auth.module,auth.controller,auth.service}.ts`, `apps/api/src/common/jwt.guard.ts`, `apps/api/src/users/*`, `apps/api/.env.example`.
Интерфейс: `GET /api/auth/github`, `GET /api/auth/github/callback`, `POST /api/auth/logout`, `GET /api/me → { id, login, avatarUrl, settings }`, `PUT /api/me/settings`, `DELETE /api/me`, guard `JwtGuard`.
Проверка: `npm test -w apps/api`. Ожидается: callback с замоканным GitHub создает пользователя и ставит cookie с `HttpOnly`, неверный `state` дает 400, `/api/me` без cookie дает 401, `DELETE /api/me` удаляет все данные пользователя.

## 5. API: прогресс и синхронизация

Что: прием пачки ответов идемпотентно по `review.id`, пересчет `CardState` через `applyAnswer` из ядра в порядке `answeredAt`, отдача состояний и активности, скрытие карточек, экспорт.
Файлы: `apps/api/src/progress/{progress.module,progress.controller,progress.service}.ts`, `apps/api/src/progress/dto/*`.
Интерфейс:
```ts
POST  /api/reviews { reviews: Review[] }
GET   /api/progress → { states: CardState[]; activity: { date: string; count: number }[]; totals: { answers: number; correctRate: number } }
PATCH /api/cards/:cardId { hidden: boolean }
GET   /api/export → JSON со всеми данными пользователя
```
Проверка: `npm test -w apps/api`. Ожидается: повторная пачка не меняет состояния, `firstInSession: false` не идет в `totals`, ответы вне порядка применяются по времени.

## 6. API: ключи и прокси ИИ

Что: ключ хранится в AES-256-GCM (`AI_KEY_SECRET`). Адаптеры Gemini и OpenAI за одним интерфейсом. Эндпоинты «спросить», «советы» и «карточки» с кэшем по `notePath + contentHash`. Ошибки переводятся в `invalid_key | rate_limited | provider_error`.
Файлы: `apps/api/src/ai/{ai.module,ai.controller,ai.service,crypto,prompts}.ts`, `apps/api/src/ai/providers/{gemini,openai}.ts`.
Интерфейс:
```ts
interface AiProvider { complete(req: { model: string; system: string; messages: { role: 'user' | 'assistant'; content: string }[] }): Promise<string> }
PUT  /api/ai/key { provider: 'gemini' | 'openai'; key: string; model: string }, DELETE /api/ai/key
POST /api/ai/ask { card: Card; messages } → { text }
POST /api/ai/advice { mistakes: Card[] } → { text }
POST /api/ai/cards { notePath; contentHash; markdown } → Card[], GET /api/ai/cards → Card[]
```
Проверка: `npm test -w apps/api`. Ожидается: в базе ключ не совпадает с исходным и расшифровывается, ключа нет ни в ответах, ни в логах, повторный `POST /api/ai/cards` с тем же хэшем не зовет провайдера, ответ 429 приходит как `rate_limited`.

## 7. Web: оболочка, вход, клиент api

Что: React Router, TanStack Query, Sonner для тостов, анимированный градиентный фон (выключается настройкой и `prefers-reduced-motion`), клиент api с `credentials: 'include'`, очередь ответов в localStorage с повтором, когда вернется сеть, фича входа.
Файлы: `apps/web/src/app/{router,providers}.tsx`, `apps/web/src/shared/ui/GradientBackground.tsx`, `apps/web/src/shared/api/{client,reviewQueue}.ts`, `apps/web/src/features/auth/{index.ts,model/useMe.ts,ui/LoginButton.tsx}`.
Интерфейс: `enqueueReviews(r: Review[]): void`, `flushReviews(): Promise<void>`, `useMe()` из `features/auth`.
Проверка: `npm test -w apps/web`. Ожидается: при ошибке сети очередь сохраняется и уходит при следующем `flush`, после успеха очищается, 401 ведет на вход.

## 8. Web: фича sources

Что: загрузчик GitHub (ссылка с веткой и папкой, Trees API и raw), загрузчик локальной папки (File System Access с запоминанием, запасной `webkitdirectory`), кэш в IndexedDB через `idb-keyval`, список неразобранных заметок. Форма выбора источника для мастера и настроек.
Файлы: `apps/web/src/features/sources/{index.ts,api/{github,localFolder,cache}.ts,model/useCards.ts,ui/SourcePicker.tsx}`.
Интерфейс: `interface NotesSource { load(): Promise<{ path: string; markdown: string }[]> }`, `useCards() → { notes: ParsedNote[]; cards: Card[]; failed: string[]; status }`.
Проверка: `npm test -w apps/web`. Ожидается: разбор ссылок `github.com/o/r`, `/tree/b/dir`, `.git` в конце и мусора (понятная ошибка), при 403 и 404 от GitHub берется кэш, неразобранная заметка не роняет загрузку.

## 9. Web: фича ai

Что: форма ключа с предупреждением про бесплатный тариф Gemini, выбор провайдера и модели. Нижняя шторка (shadcn Drawer на vaul) с ответом и уточнениями, ссылка «Открыть в ChatGPT», советы по ошибкам. ИИ-карточки для заметок без вопросов порциями с паузой на `rate_limited`.
Файлы: `apps/web/src/features/ai/{index.ts,api/aiApi.ts,model/{useAiCards,chatgptLink}.ts,ui/{AiKeyForm,AskSheet,Advice}.tsx}`.
Интерфейс: `<AskSheet card={Card} />`, `<Advice mistakes={Card[]} />`, `useAiCards(notes: ParsedNote[]) → Card[]`, `chatgptUrl(prompt: string): string`.
Проверка: `npm test -w apps/web`. Ожидается: без ключа вместо ответа кнопка ChatGPT, `invalid_key` и `rate_limited` показывают причину, ссылка ChatGPT укладывается в лимит длины URL, ключ в форме замаскирован.

## 10. Web: фича session с итогами

Что: карточка с переворотом, свайп с наклоном и штампом на `motion` (drag, пружинный возврат), клавиши ← → и пробел, Markdown в `shared/ui` на `react-markdown` + `remark-gfm` без сырого HTML и с ленивой подсветкой Shiki, шторка конспекта, значок «ИИ» и «Плохой вопрос». «Не знал» отправляет карточку в конец очереди. Экран итогов и «Повторить ошибки».
Файлы: `apps/web/src/features/session/{index.ts,model/useSession.ts,ui/{SessionPage,SwipeCard,NoteSheet,SummaryPage}.tsx}`, `apps/web/src/shared/ui/Markdown.tsx`.
Проверка: `npm test -w apps/web`. Ожидается: свайп дальше порога засчитывает ответ, короткий возвращает карточку, `<script>` и `<img onerror>` в Markdown не выполняются, при открытой шторке свайп не срабатывает, `firstInSession` ставится только первому ответу.

## 11. Web: dashboard, мастер и настройки

Что: главный экран (на сегодня, итоги, серия, график активности за год, проблемные карточки, ступени, плашка про заметки без вопросов). Мастер из трех шагов и настройки собираются в `app/` из фич auth, sources и ai, плюс лимиты, анимация, скрытые вопросы, экспорт и удаление аккаунта.
Файлы: `apps/web/src/features/dashboard/{index.ts,ui/{HomePage,ActivityHeatmap,StatsTiles}.tsx}`, `apps/web/src/app/pages/{OnboardingPage,SettingsPage}.tsx`.
Проверка: `npm test -w apps/web`. Ожидается: график считает дни в локальной таймзоне, пустая история не ломает экран, без источника открывается мастер, пропуск шага ИИ ведет на главный экран.

## 12. Деплой на VPS и e2e

Что: `Dockerfile` для api (multi-stage, non-root, `prisma migrate deploy` на старте, healthcheck) и для web (сборка Vite, затем nginx со статикой). `deploy/compose.yml`: nginx (SPA-фоллбек, `/api` на api, кэш статики, HTTPS), api, Postgres с volume, certbot, бэкап `pg_dump` по cron. Workflow GitHub Actions: check, образы в GHCR, SSH на сервер, `docker compose pull && up -d`. README: подготовка VPS, DNS, первый выпуск сертификата, секреты GitHub, OAuth App. Playwright с замоканными GitHub и ИИ.
Файлы: `apps/api/Dockerfile`, `apps/web/Dockerfile`, `.dockerignore`, `deploy/{compose.yml,nginx.conf,backup.sh,.env.example}`, `.github/workflows/deploy.yml`, `README.md`, `playwright.config.ts`, `e2e/session.spec.ts`.
Проверка: `docker compose -f deploy/compose.yml up` локально (без certbot, профиль `local`) открывает страницу, `/api/health` отвечает. `npx playwright test` проходит «вход → источник → сессия со свайпами → итоги». На VPS после push в main: HTTPS, cookie с флагом HttpOnly.
