FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

# Сначала зависимости — слой кешируется
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Затем код
COPY index.js ./
COPY lib ./lib

# Нерут-пользователь
RUN addgroup -S bot && adduser -S -D -G bot bot
USER bot

CMD ["node", "index.js"]
