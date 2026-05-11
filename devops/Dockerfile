FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY src/portal/package.json ./src/portal/
COPY deploy/package.json ./deploy/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/portal/node_modules ./src/portal/node_modules
COPY . .
RUN pnpm build:prod

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
EXPOSE 9521
CMD ["node", "--env-file=.env.production", "dist/src/api/server.js"]
