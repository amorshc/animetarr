# syntax=docker/dockerfile:1

# ---- Build stage: bundle the server (ncc) and compile the Angular UI --------
# One standard Node base handles both. Angular 12's webpack needs the legacy
# OpenSSL provider on Node 17+.
FROM node:18-bullseye AS build
ENV NODE_OPTIONS=--openssl-legacy-provider
WORKDIR /build
COPY . .

# 1) Server -> /build/dist  (this runs `rimraf dist` first, so it MUST come
#    before the UI build, whose outputPath is ../dist/ui).
RUN npm ci
RUN npm run build

# 2) Angular UI -> /build/dist/ui
WORKDIR /build/animetarr-ui
RUN npm ci
RUN npm run build

# ---- Runtime stage: just Node + the built dist ------------------------------
FROM node:20-alpine
WORKDIR /app
ENV API_PORT=3000
COPY --from=build /build/dist .
EXPOSE 3000
CMD ["node", "."]
