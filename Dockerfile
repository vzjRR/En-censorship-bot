# syntax=docker/dockerfile:1

# ---------- Base ----------
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack disable 2>/dev/null || true

# ---------- Dependencies ----------
FROM base AS deps
COPY package.json package-lock.json* ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

# ---------- Build ----------
FROM deps AS build
COPY . .
RUN npm run build

# ---------- Runtime ----------
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* ./
COPY server/package.json server/package.json
RUN npm ci --omit=dev --workspace=server --ignore-scripts

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/drizzle ./server/drizzle
COPY --from=build /app/web/dist ./web/dist

EXPOSE 3000

CMD ["node", "server/dist/main.js"]
