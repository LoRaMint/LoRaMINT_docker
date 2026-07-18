FROM oven/bun:1 AS base
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS release
# Default the image to production so the SSR dev overlay never ships in a release,
# regardless of how the container is started. Override with -e NODE_ENV=development.
ENV NODE_ENV=production
COPY --from=install /temp/prod/node_modules node_modules
COPY package.json bunfig.toml ./
COPY index.ts config.ts types.ts migrate.ts preload.ts ./
COPY config ./config
COPY frontend ./frontend
COPY public ./public
COPY services ./services
COPY migrations ./migrations
COPY lib ./lib
COPY scripts/build-css.ts scripts/build-islands.ts ./scripts/
COPY scripts/entrypoints.sh ./entrypoint.sh
RUN bun scripts/build-css.ts && bun scripts/build-islands.ts && chmod +x ./entrypoint.sh

USER bun
EXPOSE 8090/tcp
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:'+(Bun.env.PORT??'8090')+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./entrypoint.sh"]
