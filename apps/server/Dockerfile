# ── Build Stage ──────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# 서버 패키지 파일만 복사 (모노레포 루트 불필요)
COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/

RUN npm run build

# ── Runtime Stage ─────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# 프로덕션 의존성만 설치
COPY package.json ./
RUN npm install --omit=dev

# 빌드 결과물 복사
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts

EXPOSE 3001

CMD ["node", "dist/index.js"]
