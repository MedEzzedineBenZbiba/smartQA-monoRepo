# Stage 1 - Build
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install ALL dependencies including dev (needed to build)
RUN npm install

COPY . .

# Compile TypeScript → JavaScript
RUN npm run build

# Stage 2 - Production
FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev --only=production

# Copy compiled code from builder
COPY --from=builder /usr/src/app/dist ./dist

USER node

CMD ["node", "dist/main"]