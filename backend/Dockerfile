FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm install tsx --no-save

COPY tsconfig.json ./
COPY sql ./sql
COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npx", "tsx", "src/server.ts"]
