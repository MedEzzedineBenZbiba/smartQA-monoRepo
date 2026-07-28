# Stage 1 - Build
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

# Build the Next.js app
RUN npm run build

# Stage 2 - Production
FROM node:18-alpine

WORKDIR /usr/src/app

# Copy standalone build and static files
COPY --from=builder /usr/src/app/.next/standalone ./
COPY --from=builder /usr/src/app/.next/static ./.next/static
COPY --from=builder /usr/src/app/public ./public

USER node

EXPOSE 3000

CMD ["node", "server.js"]