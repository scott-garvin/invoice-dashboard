FROM node:26-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:server
RUN mkdir -p build/server && cp server/schema.sql build/server/schema.sql
FROM node:26-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/build ./build
COPY server/certs ./server/certs
USER node
CMD ["node", "build/server/index.js"]
