# The app, as one image: `docker run` it with the environment in .env.example.
# Given a command, it runs the CLI instead: docker run ghcr.io/pwnera/artbucket login ...
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
# The CLI, as npm has it (cli/artbucket.js).
RUN node cli/build.js

FROM node:24-alpine
# ffmpeg: video thumbnails. chromium: brand pages drawn as pictures for agents
# (lib/core/print.ts), 130 MB the previews earn. LibreOffice (office previews
# beyond a file's own thumbnail) is left out for size: `FROM` this image and
# `apk add libreoffice`.
RUN apk add --no-cache ffmpeg chromium
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 CHROMIUM_PATH=/usr/bin/chromium-browser
COPY --from=build --chown=node:node /app/.next/standalone ./
# The standalone build leaves out public/ and .next/static: without public/, /icon.svg is a 404.
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/drizzle ./drizzle
# The CLI: `docker run ghcr.io/pwnera/artbucket login ...` runs it (bin/artbucket-entrypoint.sh).
# package.json beside it says the file is a module; the link puts it on the path.
COPY --from=build /app/cli/artbucket.js /app/cli/package.json /opt/artbucket/
COPY --chmod=755 bin/artbucket-entrypoint.sh /usr/local/bin/
RUN ln -s /opt/artbucket/artbucket.js /usr/local/bin/artbucket \
 && mkdir /config /work && chown node:node /config /work
USER node
EXPOSE 3000
ENTRYPOINT ["artbucket-entrypoint.sh"]
CMD ["node", "server.js"]
