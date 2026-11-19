FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @meotdc/api... --frozen-lockfile
COPY apps/api apps/api
RUN pnpm --filter @meotdc/api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --prod --filter @meotdc/api... --frozen-lockfile
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/database apps/api/database
RUN mkdir -p /app/data/assignment-submissions && chown -R node:node /app/data
WORKDIR /app/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
