ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs npm

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js scraper.js storage.js static-site.js ftp-sync.js ui.html ui.css ui.js ./
COPY static ./static

EXPOSE 8099

ENV PORT=8099
ENV DATA_DIR=/data

ENTRYPOINT ["node", "/app/server.js"]
