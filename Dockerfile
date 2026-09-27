# The app, as one image: `docker run` it with the environment in .env.example.
# It migrates its database when it starts (src/lib/db/migrate.ts).

FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# The build imports src/lib/env.ts, which checks the environment: placeholders
# here, the real values when the container runs. None of them end up in the image.
RUN DATABASE_URL=postgres://build@localhost/build S3_ENDPOINT=http://localhost S3_BUCKET=build \
    S3_ACCESS_KEY_ID=build S3_SECRET_ACCESS_KEY=build BETTER_AUTH_SECRET=build-time-placeholder-0000000000000 \
    NEXT_TELEMETRY_DISABLED=1 STANDALONE=1 pnpm build

FROM node:24-alpine
# ffmpeg: video thumbnails. LibreOffice (office previews beyond a file's own
# thumbnail) is left out for size: `FROM` this image and `apk add libreoffice`.
RUN apk add --no-cache ffmpeg
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node", "server.js"]
