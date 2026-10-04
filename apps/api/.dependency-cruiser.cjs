// Сгенерировано devkit /arch для nest-standard. Правила описаны в ARCHITECTURE.md.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  "forbidden": [
    {
      "name": "no-circular",
      "severity": "warn",
      "from": {},
      "to": {
        "circular": true
      },
      "comment": "Цикл импортов"
    },
    {
      "name": "no-orphans",
      "severity": "warn",
      "from": {
        "orphan": true,
        "pathNot": [
          "\\.d\\.ts$",
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$",
          "\\.(spec|test)\\.(ts|tsx|js|jsx)$",
          "(^|/)(main|index)\\.(ts|tsx)$"
        ]
      },
      "to": {},
      "comment": "Файл никто не импортирует"
    },
    {
      "name": "nest-controller-no-orm",
      "severity": "error",
      "from": {
        "path": "\\.(controller|resolver)\\.ts$"
      },
      "to": {
        "path": "(^|node_modules/)(@prisma/client|typeorm|mongoose|@mikro-orm/[^/]+|drizzle-orm)(/|$)"
      },
      "comment": "Контроллер и резолвер зовут сервис, не ORM"
    },
    {
      "name": "nest-controller-no-repository",
      "severity": "error",
      "from": {
        "path": "\\.(controller|resolver)\\.ts$"
      },
      "to": {
        "path": "\\.repository\\.ts$"
      },
      "comment": "Контроллер и резолвер зовут сервис, не репозиторий"
    },
    {
      "name": "nest-foreign-internals",
      "severity": "error",
      "from": {
        "path": "^src/([^/]+)/"
      },
      "to": {
        "path": "^src/[^/]+/.+",
        "pathNot": [
          "^src/$1/",
          "\\.(module|service)\\.ts$",
          "/dto/",
          "^src/(common|config|shared)/",
          "^node_modules/"
        ]
      },
      "comment": "У чужого модуля можно брать только module, service и dto"
    },
    {
      "name": "nest-common-no-features",
      "severity": "error",
      "from": {
        "path": "^src/(common|config|shared)/"
      },
      "to": {
        "path": "^src/",
        "pathNot": [
          "^src/(common|config|shared)/",
          "^node_modules/"
        ]
      },
      "comment": "common и config не импортируют модули фич"
    }
  ],
  "options": {
    "doNotFollow": {
      "path": "node_modules"
    },
    "exclude": {
      "path": "(^|/)(dist|build|\\.next|coverage)/|^src/prisma/generated/"
    },
    "tsPreCompilationDeps": true,
    "tsConfig": {
      "fileName": "tsconfig.json"
    }
  }
};
