---
devkit-arch: nest-standard
root: src
ignore: []
---

Сгенерировано `/arch` из devkit. Правится руками вместе с `.dependency-cruiser.cjs`.

# Архитектура api. Модули по фичам из документации Nest

Каждая фича это модуль Nest со своим контроллером и сервисом. Правила карточек и Лейтнера живут в `@notes-cards/core`, сервисы их вызывают и остаются тонкими.

## Дерево

```
src/
  main.ts               запуск
  app.module.ts         корневой модуль
  app.setup.ts          общая настройка приложения для main и тестов
  health/               GET /api/health
  auth/                 OAuth GitHub, выдача JWT в httpOnly cookie
  users/                профиль и настройки, удаление аккаунта
  progress/             ответы, состояния карточек, активность, экспорт
    dto/
  ai/                   ключи ИИ, прокси к Gemini и OpenAI, ИИ-карточки
    providers/
  prisma/               PrismaModule и PrismaService
  common/               guards, pipes, filters, interceptors, decorators
  config/               конфиг из env с валидацией
```

Модель базы в `prisma/schema.prisma` в корне пакета.

## Импорты

| откуда | можно импортировать | правило |
|--------|---------------------|---------|
| `*.controller.ts` | свой сервис и `dto` | `nest-controller-no-orm`, `nest-controller-no-repository` |
| `*.service.ts` | свои `repository` и `entities`, Prisma, чужие `*.module.ts`, `*.service.ts`, `dto` | `nest-foreign-internals` |
| `common`, `config` | только `common`, `config` | `nest-common-no-features` |

`@notes-cards/core` можно импортировать отовсюду.

## Public API

1. Модуль отдает наружу провайдеры из `exports` своего `*.module.ts`.
2. Другой модуль добавляет его в `imports` и инжектит сервис.
3. Controller, `entities` и repository чужого модуля не импортируются. DTO чужого модуля можно, это контракт.

## Куда класть

| новый код | путь |
|-----------|------|
| REST endpoint | `<модуль>/<модуль>.controller.ts` |
| бизнес-правило api | `<модуль>/<модуль>.service.ts` |
| правило карточек, Лейтнер, статистика | `packages/core`, не сюда |
| запросы к базе | сервис модуля через `PrismaService` |
| входные данные с `class-validator` | `<модуль>/dto/` |
| модель базы | `prisma/schema.prisma` |
| адаптер провайдера ИИ | `ai/providers/` |
| guard, pipe, filter, interceptor | `common/` |
| конфиг | `config/` через `ConfigModule` |

## Антипаттерны

1. Контроллер зовет Prisma. Вызов идет через сервис.
2. Сервис на 1000 строк с правилами. Это сигнал перейти в `nest-modular-clean` или вынести правило в `packages/core`.
3. Циклы модулей и `forwardRef` без причины. Общее вынеси в отдельный модуль.
4. Импорт `entities` чужого модуля. Попроси данные у его сервиса.

## Долг

Подвязано 2026-10-04. Нарушений в baseline 0.
