# The CLI, as an image: ghcr.io/pwnera/artbucket/cli runs `artbucket` on the
# folder mounted at /work, and keeps the key `login` saves in /config. Built
# from the repository's root: docker build -f cli/Dockerfile .

FROM node:24-alpine AS build
WORKDIR /src
COPY LICENSE ./
COPY bin/artbucket.ts bin/
COPY cli/build.js cli/package.json cli/
RUN node cli/build.js

FROM node:24-alpine
# package.json beside it says the file is a module; the link puts it on the path.
COPY --from=build /src/cli/artbucket.js /src/cli/package.json /src/cli/LICENSE /opt/artbucket/
RUN ln -s /opt/artbucket/artbucket.js /usr/local/bin/artbucket \
 && mkdir /config /work && chown node:node /config /work
# A volume on /config starts out the node user's, so `login` can write to it.
ENV XDG_CONFIG_HOME=/config
USER node
WORKDIR /work
ENTRYPOINT ["artbucket"]
CMD ["--help"]
