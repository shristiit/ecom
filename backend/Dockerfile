FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json

RUN pnpm install --filter backend... --frozen-lockfile

COPY backend ./backend

WORKDIR /workspace/backend

RUN pnpm build:prod

EXPOSE 4000

CMD ["node", "dist/server.js"]
