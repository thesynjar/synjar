FROM node:20-alpine AS base
RUN npm install -g pnpm@9.15.0

# -----------------------------------------------------------------------------
# Stage: Install all dependencies (including devDependencies for build)
# -----------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./prisma/
ENV NODE_ENV=development
RUN pnpm install --frozen-lockfile --ignore-scripts

# -----------------------------------------------------------------------------
# Stage: Install production-only dependencies
# -----------------------------------------------------------------------------
FROM base AS prod-deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# -----------------------------------------------------------------------------
# Stage: Build application
# -----------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter api run db:generate
RUN pnpm --filter api run build
RUN pnpm --filter api run scripts:build

# Resolve prisma symlink to actual package (for runner stage)
RUN cp -rL apps/api/node_modules/prisma /tmp/prisma-cli

# -----------------------------------------------------------------------------
# Stage: Production runner
# -----------------------------------------------------------------------------
FROM base AS runner
ARG PORT=6200
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=${PORT}

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy production-only dependencies (smaller image, no devDependencies)
COPY --from=prod-deps --chown=nodejs:nodejs /app/apps/api/node_modules ./node_modules
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules/.pnpm ./node_modules/.pnpm

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/prisma ./prisma

# Copy generated Prisma client (overwrites the one from prod-deps with generated code)
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nodejs:nodejs /app/apps/api/node_modules/@prisma ./node_modules/@prisma

# Copy prisma CLI for migrations (symlink broken during copy, need actual package)
COPY --from=builder --chown=nodejs:nodejs /tmp/prisma-cli ./node_modules/prisma

USER nodejs

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT}/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/main.js"]
