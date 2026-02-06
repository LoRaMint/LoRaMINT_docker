FROM oven/bun:1 AS base
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY package.json .
COPY index.ts config.ts types.ts migrate.ts ./
COPY services ./services
COPY migrations ./migrations
COPY lib ./lib
COPY scripts/entrypoints.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER bun
EXPOSE 8090/tcp
ENTRYPOINT ["./entrypoint.sh"]
