# Stage 1 - Build
FROM node:22-alpine AS builder   # <-- Changed from 18 to 22

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Stage 2 - Production
FROM node:22-alpine   # <-- Changed from 18 to 22

WORKDIR /usr/src/app

# Option 1: If using standalone output
COPY --from=builder /usr/src/app/.next/standalone ./
COPY --from=builder /usr/src/app/.next/static ./.next/static
COPY --from=builder /usr/src/app/public ./public

USER node

EXPOSE 3000

CMD ["node", "server.js"]