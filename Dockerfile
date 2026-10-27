FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=768
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
COPY public ./public
COPY nginx.conf ./nginx.conf
COPY scripts/configure-nginx.mjs ./configure-nginx.mjs
ARG VITE_METRICS_SITE_HOST=
ARG VITE_METRICS_SCRIPT_URL=
RUN npm run build && node configure-nginx.mjs nginx.conf nginx-runtime.conf
ARG SOURCE_SHA=unrecorded
ARG VCS_REF=uncommitted
RUN SOURCE_SHA="$SOURCE_SHA" VCS_REF="$VCS_REF" node -e 'require("node:fs").writeFileSync("dist/release.json", JSON.stringify({source:process.env.SOURCE_SHA,revision:process.env.VCS_REF})+"\n")'

FROM nginx:stable-alpine@sha256:970364228b1e4f932abc22d321932816782cca8a20b85a77552a7cfe9acfb3b5
ARG SOURCE_SHA=unrecorded
ARG VCS_REF=uncommitted
LABEL org.opencontainers.image.title="Major Decision" \
      org.opencontainers.image.source="https://github.com/Terro216/major-decision" \
      org.opencontainers.image.revision="$VCS_REF" \
      dev.ilyamedve.major-decision.source-sha256="$SOURCE_SHA"
COPY --from=build /app/nginx-runtime.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
