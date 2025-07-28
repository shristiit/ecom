# ─────────────   dependencies layer ─────────────
FROM node:20-slim AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-lock.yaml package.json ./
RUN pnpm fetch --prod            

# ─────────────  build layer ─────────────
FROM deps AS builder
COPY backend ./                 
RUN pnpm install --offline --prod
# (Optional) transpile if you add TypeScript later:
# RUN pnpm run build


FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/backend .
EXPOSE 4000
CMD ["node", "src/index.js"]
