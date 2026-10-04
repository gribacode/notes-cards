// Сгенерировано devkit /arch для react-evolution.small. Правила описаны в ARCHITECTURE.md.
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
      "name": "ed-no-app",
      "severity": "error",
      "from": {
        "path": "^src/(features|services|shared)/"
      },
      "to": {
        "path": "^src/app/"
      },
      "comment": "Из app никто не импортирует"
    },
    {
      "name": "ed-no-features",
      "severity": "error",
      "from": {
        "path": "^src/(services|shared)/"
      },
      "to": {
        "path": "^src/features/"
      },
      "comment": "services и shared не импортируют features"
    },
    {
      "name": "ed-shared-no-services",
      "severity": "error",
      "from": {
        "path": "^src/shared/"
      },
      "to": {
        "path": "^src/services/"
      },
      "comment": "shared не импортирует services"
    },
    {
      "name": "ed-public-api",
      "severity": "error",
      "from": {
        "path": "^src/([^/]+)/([^/]+)/"
      },
      "to": {
        "path": "^src/(features|services)/[^/]+/.+",
        "pathNot": [
          "^src/$1/$2/",
          "^src/(features|services)/[^/]+/index\\.(ts|tsx|js|jsx)$"
        ]
      },
      "comment": "Снаружи модуля только через index"
    }
  ],
  "options": {
    "doNotFollow": {
      "path": "node_modules"
    },
    "exclude": {
      "path": "(^|/)(dist|build|\\.next|coverage)/"
    },
    "tsPreCompilationDeps": true,
    "tsConfig": {
      "fileName": "tsconfig.app.json"
    }
  }
};
