FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY migrations ./migrations
COPY src ./src

RUN npm run build:prod

EXPOSE 4000

CMD ["node", "dist/server.js"]
