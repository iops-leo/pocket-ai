# Autopilot Implementation Plan — New Session 생성 버그

1. **PWA 생성 로직 구현**
   - `apps/pwa/src/app/dashboard/page.tsx`
   - `handleNewSession`에서 `/api/sessions` POST 호출
   - 요청 body에 `publicKey`, `metadata(cwd, engine, hostname)` 전달
   - 성공 시 `fetchSessions(false)` 호출
   - 실패 시 throw하여 모달 에러 표시 유지

2. **세션 목록 API 반환 정책 수정**
   - `apps/server/src/routes/sessions.ts`
   - GET `/api/sessions`를 online-only 필터에서 user-owned all sessions로 변경
   - online 우선, 최근 활동 순으로 정렬

3. **회귀 검증**
   - PWA 테스트 실행
   - 서버 테스트 실행
   - 전체 변경 영향 점검
