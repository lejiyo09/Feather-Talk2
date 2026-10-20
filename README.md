# FeatherTalk v2 재구현 (PWA)

참고 사이트: https://v2.feathertalk.live/

> **진행 상태:** PWA 골격과 Render 배포 설정만 갖춘 단계입니다.
> 원본 사이트에 접속할 수 없어 화면·기능 분석이 아직 진행되지 않았습니다.
> 자세한 내용은 [docs/ANALYSIS.md](docs/ANALYSIS.md)를 참고하세요.

## 구조

```
├── index.html            # 앱 진입점 (현재 임시 셸)
├── style.css             # 스타일 (현재 임시)
├── script.js             # 서비스 워커 등록, 설치 버튼, 온라인/오프라인 표시
├── sw.js                 # 서비스 워커: 앱 셸 캐시, 오프라인 대응
├── manifest.webmanifest  # PWA 매니페스트
├── assets/icons/         # PWA 아이콘 (임시 대체 아이콘 — 원본 아이콘 미확인)
├── render.yaml           # Render 정적 사이트 배포 설정 (Blueprint)
└── docs/ANALYSIS.md      # 원본 분석 기록
```

## 로컬 실행

서비스 워커는 `file://`에서 동작하지 않으므로 로컬 서버로 실행합니다.

```bash
python3 -m http.server 8080
# 또는
npx serve .
```

브라우저에서 http://localhost:8080 접속.

## Render 배포

1. Render 대시보드 → **New → Blueprint** → 이 저장소 선택 (`render.yaml` 자동 인식)
2. 또는 **New → Static Site** → 저장소 선택, Build Command 비움, Publish Directory `.`

빌드 단계가 없는 정적 사이트이며, `sw.js`는 `Cache-Control: no-cache`로 제공됩니다.

## 대체 리소스

- 아이콘: 원본 아이콘을 확인하지 못해 임시로 생성한 단색 아이콘 사용
