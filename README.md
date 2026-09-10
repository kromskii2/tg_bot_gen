# tg_bot_gen

Telegram-бот — полноценный генератор паролей с инлайн-меню (telegraf v4, Node.js).

## Возможности

- `/start` — всё меню на инлайн-кнопках
- 🔑 Генерация паролей через `crypto.randomInt` (без `Math.random`)
- ⚙️ Настройки на кнопках:
  - длина 4–128 (кнопки −5 / −1 / +1 / +5)
  - наборы: A-Z, a-z, 0-9, символы
  - «без похожих символов» (il1Lo0O)
  - «произносимый» режим (CV-паттерн)
- 📊 Оценка стойкости: энтропия в битах + уровень
- 📋 История последних 5 паролей (в памяти, на диск не пишется)
- 📧 **Генератор почтовых адресов**: 3 стиля (random / pronounceable / word.num+число), 14 доменов (gmail, mail.ru, yandex, outlook, proton…), опция «цифра в адресе», пачка из 5, команда /email
- 🔒 Доступ только для владельца (`OWNER_ID` из `.env`)

## Запуск

```bash
npm install
npm start        # или npm run dev (с --watch)
```

## Настройка `.env`

```
BOT_TOKEN=***
OWNER_ID=ваш_user_id
```

## Структура

```
index.js            # бот: меню, хэндлеры кнопок
lib/generator.js    # генератор + оценка энтропии
```

## Docker / CI-CD

✅ GitHub Actions: `.github/workflows/docker.yml` — при пуше в `main`, PR и теге `v*`:
1. **test** — `node --check` + смоук-тесты генератора (`npm test`)
2. **build** — сборка образа и публикация в GHCR: `ghcr.io/kromskii2/tg_bot_gen` (теги `latest`, `main`, `sha-xxx`, semver для тегов)

Локально:

```bash
npm test                 # проверки
docker build -t tg_bot_gen .   # или npm run docker
docker run --env-file .env tg_bot_gen
# или:
docker compose up -d --build
```

Запуск собранного в CI образа:

```bash
docker run -d --name tg_bot_gen --env-file .env ghcr.io/kromskii2/tg_bot_gen:latest
```
(для private-репозитория: `docker login ghcr.io` с PAT со scope `read:packages`)
