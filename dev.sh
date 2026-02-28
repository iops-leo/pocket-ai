#!/usr/bin/env bash
# Pocket AI 로컬 개발 서버 실행 스크립트
# Usage: ./dev.sh [server|pwa|all]

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$ROOT/apps/server"
PWA_DIR="$ROOT/apps/pwa"

# ── 색상 출력 ─────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${CYAN}[dev]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC}  $*"; }
warn() { echo -e "${YELLOW}[!]${NC}   $*"; }
err()  { echo -e "${RED}[err]${NC} $*" >&2; }

# ── .env 체크 ─────────────────────────────────────────────
check_env() {
  local env_file="$SERVER_DIR/.env"

  if [[ ! -f "$env_file" ]]; then
    warn ".env 파일이 없습니다. $env_file 을 생성합니다..."
    cat > "$env_file" << 'EOF'
# PostgreSQL 연결 (필수)
DATABASE_URL=postgresql://localhost:5432/pocket_ai

# JWT 서명 키 (필수, 최소 32자)
JWT_SECRET=change_me_to_a_long_random_secret_at_least_32_chars

# GitHub OAuth (https://github.com/settings/applications/new)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:3001/auth/github/callback

# 허용 Origin (쉼표 구분)
ALLOWED_ORIGINS=http://localhost:3002

# PWA URL (OAuth 콜백 후 리다이렉트)
PWA_URL=http://localhost:3002

PORT=3001
EOF
    warn "⚠️  $env_file 를 열어 실제 값으로 채워주세요."
    warn "   특히 DATABASE_URL, JWT_SECRET, GITHUB_CLIENT_ID/SECRET 은 필수입니다."
    echo ""
  fi

  # 필수 변수 확인
  source "$env_file"
  local missing=()
  [[ -z "$DATABASE_URL" || "$DATABASE_URL" == "postgresql://localhost:5432/pocket_ai" ]] && missing+=("DATABASE_URL")
  [[ -z "$JWT_SECRET" || "$JWT_SECRET" == "change_me_to_a_long_random_secret_at_least_32_chars" ]] && missing+=("JWT_SECRET")
  [[ -z "$GITHUB_CLIENT_ID" || "$GITHUB_CLIENT_ID" == "your_github_client_id" ]] && missing+=("GITHUB_CLIENT_ID")
  [[ -z "$GITHUB_CLIENT_SECRET" || "$GITHUB_CLIENT_SECRET" == "your_github_client_secret" ]] && missing+=("GITHUB_CLIENT_SECRET")

  if [[ ${#missing[@]} -gt 0 ]]; then
    err "다음 환경 변수가 설정되지 않았습니다:"
    for v in "${missing[@]}"; do
      err "  - $v"
    done
    err "$env_file 를 수정한 후 다시 실행하세요."
    exit 1
  fi
}

# ── 의존성 설치 ────────────────────────────────────────────
install_deps() {
  log "의존성 확인 중..."
  if [[ ! -d "$ROOT/node_modules" ]]; then
    log "npm install 실행 중..."
    npm install --prefix "$ROOT" 2>&1 | tail -3
    ok "의존성 설치 완료"
  else
    ok "의존성 이미 설치됨"
  fi
}

# ── DB 마이그레이션 ─────────────────────────────────────────
run_migration() {
  log "DB 마이그레이션 실행 중..."
  if cd "$SERVER_DIR" && npm run migrate:up 2>&1; then
    ok "마이그레이션 완료"
  else
    err "마이그레이션 실패. DATABASE_URL 과 PostgreSQL 연결을 확인하세요."
    warn "  Supabase 사용 중이라면 DATABASE_URL이 Supabase 연결 문자열인지 확인하세요."
    warn "  로컬 PostgreSQL 없이도 Supabase에 직접 마이그레이션됩니다."
    exit 1
  fi
}

# ── 서버 실행 ──────────────────────────────────────────────
start_server() {
  kill_port 3001
  log "서버 시작 (http://localhost:3001)"
  cd "$SERVER_DIR"
  # .env 로드해서 dev 실행
  set -a; source .env; set +a
  npm run dev
}

# ── 포트 점유 프로세스 종료 ─────────────────────────────────
kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    warn "포트 $port 사용 중 (PID: $pids) → 종료 중..."
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 0.5
    ok "포트 $port 해제됨"
  fi
}

# ── PWA 실행 ───────────────────────────────────────────────
start_pwa() {
  kill_port 3002
  log "PWA 시작 (http://localhost:3002)"
  cd "$PWA_DIR"
  npm run dev
}

# ── 동시 실행 (tmux 없을 경우 백그라운드) ──────────────────
start_all() {
  kill_port 3001
  kill_port 3002
  if command -v tmux &>/dev/null; then
    SESSION="pocket-ai"
    tmux kill-session -t "$SESSION" 2>/dev/null || true
    tmux new-session -d -s "$SESSION" -x 220 -y 50

    # 서버 패널
    tmux send-keys -t "$SESSION" \
      "cd '$SERVER_DIR' && set -a && source .env && set +a && npm run dev" Enter
    tmux rename-window -t "$SESSION" "server"

    # PWA 패널 (새 창)
    tmux new-window -t "$SESSION" -n "pwa"
    tmux send-keys -t "$SESSION:pwa" \
      "cd '$PWA_DIR' && npm run dev" Enter

    ok "tmux 세션 '$SESSION' 시작됨"
    echo ""
    echo -e "  ${BLUE}서버${NC}: http://localhost:3001"
    echo -e "  ${BLUE}PWA ${NC}: http://localhost:3002"
    echo ""
    echo -e "  연결: ${CYAN}tmux attach -t $SESSION${NC}"
    echo -e "  종료: ${CYAN}tmux kill-session -t $SESSION${NC}"
    echo ""
    tmux attach -t "$SESSION"
  else
    # tmux 없으면 백그라운드로 서버 실행 후 PWA를 포그라운드로
    warn "tmux 없음 - 서버를 백그라운드로 실행합니다"
    (cd "$SERVER_DIR" && set -a && source .env && set +a && npm run dev) &
    SERVER_PID=$!
    ok "서버 PID: $SERVER_PID (http://localhost:3001)"
    sleep 2

    log "PWA 시작 (포그라운드)"
    echo ""
    echo -e "  종료 시 서버도 함께 종료됩니다 (Ctrl+C)"
    echo ""
    trap "kill $SERVER_PID 2>/dev/null; exit 0" INT TERM
    cd "$PWA_DIR" && npm run dev
  fi
}

# ── 메인 ───────────────────────────────────────────────────
MODE="${1:-all}"

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Pocket AI 로컬 개발 환경${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

case "$MODE" in
  server)
    check_env
    install_deps
    run_migration
    start_server
    ;;
  pwa)
    install_deps
    start_pwa
    ;;
  migrate)
    check_env
    install_deps
    run_migration
    ;;
  all|"")
    check_env
    install_deps
    run_migration
    start_all
    ;;
  *)
    err "알 수 없는 모드: $MODE"
    echo ""
    echo "Usage: $0 [server|pwa|migrate|all]"
    echo ""
    echo "  all     - 서버 + PWA 동시 실행 (기본값, tmux 사용)"
    echo "  server  - 서버만 실행 (port 3001)"
    echo "  pwa     - PWA만 실행 (port 3002)"
    echo "  migrate - DB 마이그레이션만 실행"
    exit 1
    ;;
esac
