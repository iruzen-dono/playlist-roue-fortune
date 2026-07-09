# ============================
# Stage 1 : Build Frontend
# ============================
FROM node:22-alpine AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ============================
# Stage 2 : Production Runtime
# ============================
FROM node:22-alpine

WORKDIR /app

# Backend deps
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Backend source
COPY backend/src/ ./src/

# Frontend build artifacts
COPY --from=frontend-builder /build/frontend/dist/ ./public/

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r => process.exit(r.ok?0:1)).catch(() => process.exit(1))"

EXPOSE 3001

# Le backend sert l'API ET les fichiers statiques
# Le port doit correspondre au PORT configuré
ENV NODE_ENV=production

CMD ["node", "src/index.js"]