# GitHub에서 VM 프런트엔드 자동 배포

[`Deploy frontend to VM`](../.github/workflows/deploy-frontend.yml)은 `main`의 프런트엔드 변경을 테스트하고 컨테이너 이미지로 배포합니다. 코드 수정 후 GitHub에 push하거나 PR을 `main`에 병합하면 됩니다. 서비스 주소는 **https://planfix.cloud**입니다. 실행 결과는 [GitHub Actions](https://github.com/tae-dong-hee/plan-fix/actions/workflows/deploy-frontend.yml)에서 확인합니다.

기존 `http://34.64.203.44`의 화면 주소는 경로와 쿼리를 유지한 채 HTTPS 도메인으로 이동합니다. HTTPS 전환 후에도 IP에서 화면을 제공하면 조회는 되지만 댓글 등 쓰기 요청은 백엔드의 CORS 검사에서 거절됩니다. 이미 열려 있던 IP 탭은 새로고침하고 HTTPS 도메인에서 다시 로그인해야 합니다. 배포 점검에 쓰는 IP의 `/api/`, `/deploy-version.json`과 `127.0.0.1`은 그대로 유지합니다.

운영 VM은 `/opt/planfix-frontend/domain.conf`를 추가로 마운트해 HTTPS와 인증서를 제공합니다. 기존 Compose의 443 포트·인증서·도메인 설정 마운트를 유지해야 하며, 저장소의 HTTP 전용 Compose로 덮어쓰면 안 됩니다.

## 실행 조건

| 작업 | 실행 내용 |
| --- | --- |
| `main`에 `frontend/**`, `deploy/frontend/**` 또는 프런트엔드 워크플로 변경 push | 테스트 통과 후 프런트엔드 배포 |
| `main` 대상 PR에서 같은 경로 변경 | 테스트만 실행 |
| Actions의 **Run workflow**에서 `main` 선택 | 테스트 후 배포 |
| 다른 브랜치에서 수동 실행 | 테스트만 실행 |
| 백엔드나 문서만 변경 | 프런트엔드 자동 배포 실행 안 함 |

같은 브랜치의 워크플로는 순서대로 실행하며 새 push가 진행 중인 배포를 취소하지 않습니다. 백엔드는 [별도의 Cloud Run 워크플로](cloud-run-deployment.md)로 배포됩니다.

## 배포 과정

1. Node.js 24에서 `npm ci`, `npm run typecheck`, `npm test`를 실행하고 VM 배포·롤백 스크립트를 테스트합니다. 테스트가 실패하면 이미지를 배포하지 않습니다.
2. [`frontend/Dockerfile`](../frontend/Dockerfile)로 프런트엔드를 빌드합니다. 결과물은 Nginx 컨테이너에 포함되며, `/api/` 요청은 기존 Cloud Run 백엔드로 전달합니다.
3. GitHub Actions가 WIF로 GCP에 인증하고 커밋 SHA 태그와 `production` 태그를 Artifact Registry에 올립니다.
4. VM의 `planfix-frontend-deploy.timer`가 30초마다 새 `production` 이미지를 확인합니다. 후보 컨테이너를 `127.0.0.1:18080`에서 실행해 버전과 API를 검사한 뒤 운영 컨테이너를 교체합니다. 교체 후 검사에 실패하면 저장한 이전 이미지로 되돌립니다.
5. GitHub Actions가 공개 `/deploy-version.json`의 커밋 SHA가 이번 커밋과 일치하는지 기다리고 `/api/v1/spots?size=1` 응답을 확인합니다. 버전 확인은 최대 60회, 요청 사이 5초 간격이며 요청 시간은 별도로 소요됩니다. 배포 작업 전체 제한은 20분입니다.

운영 컨테이너를 교체하는 동안 짧은 연결 중단이 있을 수 있습니다. Actions에서 실패한 경우 VM 배포 로그와 현재 공개 버전을 함께 확인하세요. 공개 확인 단계의 실패 자체가 VM 롤백 명령을 실행하지는 않습니다.

| 항목 | 설정 |
| --- | --- |
| GitHub 저장소 | `tae-dong-hee/plan-fix` |
| GCP 프로젝트 | `planfix-01` / 프로젝트 번호 `148201851366` |
| VM / 영역 | `planfix-fe` / `asia-northeast3-c` |
| 이미지 | `asia-northeast3-docker.pkg.dev/planfix-01/planfix-frontend/frontend:<COMMIT_SHA>` |
| VM이 확인하는 태그 | `production` |
| 공개 주소 | `https://planfix.cloud` |

## 인증과 빌드 설정

GitHub Secrets에 GCP 서비스 계정 JSON 키나 VM SSH 키를 저장하지 않습니다. GitHub Actions는 이미지를 업로드하고 VM은 자신의 서비스 계정으로 이미지를 가져옵니다.

- WIF 공급자: `projects/148201851366/locations/global/workloadIdentityPools/planfix-frontend-github/providers/planfix-repo`
- 배포 서비스 계정: `planfix-frontend-deploy@planfix-01.iam.gserviceaccount.com`
- 신뢰 조건: 저장소 소유자 ID `243352673`, 저장소 ID `1328290631`, `refs/heads/main`, 워크플로 `tae-dong-hee/plan-fix/.github/workflows/deploy-frontend.yml@refs/heads/main`으로 제한합니다.
- 배포 서비스 계정은 `planfix-frontend` Artifact Registry 저장소에만 `roles/artifactregistry.writer` 권한을 가집니다. VM의 기존 서비스 계정은 이 저장소를 읽습니다.
- `VITE_API_BASE_URL=/api/v1`은 빌드 시 지정합니다. `VITE_KAKAO_JS_KEY`는 저장소의 **Settings → Secrets and variables → Actions → Variables**에 등록한 값을 사용합니다. 이 키가 없으면 빌드를 중단합니다.
- `VITE_GOOGLE_MAPS_API_KEY`도 같은 저장소 Variables에서 빌드에 전달합니다. 검수된 장소의 Google 사진 카드에만 사용하며, 키가 없으면 기존 대체 화면을 유지합니다. 운영 키는 `https://planfix.cloud/*`와 Maps JavaScript API·Places UI Kit API로 제한합니다. [승인 기준과 비용 제한](assets/google-place-cards.md)을 함께 확인하세요.

`VITE_*` 값은 브라우저에 공개되는 설정입니다. 서버 비밀번호나 카카오 REST API 시크릿을 넣지 마세요. [`.dockerignore`](../frontend/.dockerignore)는 로컬 `.env`와 임시 인증 파일 등을 빌드에서 제외합니다. 빌드 설정을 바꾸면 **Run workflow**에서 `main`을 선택해 새 이미지를 배포합니다.

## 재실행과 VM 진단

일시적인 실패는 Actions의 **Re-run failed jobs** 또는 **Re-run all jobs**로 재시도합니다. 재실행은 원래 실행의 커밋을 사용합니다. 최신 `main`을 배포하려면 **Run workflow**에서 `main`을 선택합니다.

VM에서 운영 전환 후 검증에 실패한 이미지는 `/var/lib/planfix-frontend/rejected/`에 기록해 반복 배포하지 않습니다. 이 경우 원인을 수정한 새 커밋을 배포하세요. 같은 이미지를 재검증하려면 원인 해결 후 해당 이미지의 거부 기록을 지워야 하며, 단순한 워크플로 재실행만으로 거부 기록이 사라지지는 않습니다. 운영 전환 전의 일시적인 장애는 타이머의 다음 실행에서 재시도합니다.

VM에 접속한 뒤 서비스와 로그를 확인합니다.

```sh
gcloud compute ssh planfix-fe --project planfix-01 --zone asia-northeast3-c
sudo systemctl status planfix-frontend-deploy.timer planfix-frontend-deploy.service
sudo journalctl -u planfix-frontend-deploy.service -n 100 --no-pager
curl --fail http://127.0.0.1/deploy-version.json
curl --fail 'http://127.0.0.1/api/v1/spots?size=1'
```

타이머를 잠시 중지하거나 다시 시작하려면 다음 명령을 사용합니다. 이미 시작한 배포가 있다면 상태와 로그를 먼저 확인하세요.

```sh
sudo systemctl stop planfix-frontend-deploy.timer
sudo systemctl start planfix-frontend-deploy.timer
```

## 이전 이미지로 롤백

VM에는 현재 정상 이미지가 `/var/lib/planfix-frontend/current.env`, 교체 전 이미지가 `previous.env`에 저장됩니다. 자동 배포 도입 후에는 기존 수동 배포용 Compose 파일 대신 `/opt/planfix-frontend/compose.yaml`을 사용하며, 프로젝트 이름 `planfix-fe`와 `--env-file`을 지정합니다.

먼저 타이머를 비활성화하고 실행 중인 배포를 중지합니다. 이후 이전 이미지를 실행하고 페이지·API 검증이 통과한 경우에만 현재 상태를 갱신합니다.

```sh
sudo systemctl disable --now planfix-frontend-deploy.timer
sudo systemctl stop planfix-frontend-deploy.service
sudo docker compose --project-name planfix-fe \
  --file /opt/planfix-frontend/compose.yaml \
  --env-file /var/lib/planfix-frontend/previous.env \
  up --detach --no-deps --pull never frontend && \
curl --fail --retry 5 --retry-connrefused --retry-delay 2 http://127.0.0.1/ --output /dev/null && \
curl --fail 'http://127.0.0.1/api/v1/spots?size=1' --output /dev/null && \
sudo cp /var/lib/planfix-frontend/previous.env /var/lib/planfix-frontend/current.env
```

`previous.env`가 없으면 이전 이미지가 아직 저장되지 않은 상태입니다. 초기의 기존 이미지는 `/deploy-version.json`을 제공하지 않을 수 있으므로 롤백 확인은 페이지와 API로 수행합니다. 스크립트는 롤백에 필요한 로컬 이미지를 삭제하지 않습니다.

타이머가 꺼져 있는 동안 새 GitHub 배포는 VM 반영을 기다리다가 실패합니다. 재개하기 전에 Artifact Registry의 `production` 태그를 롤백할 커밋 SHA의 이미지로 옮기거나, 수정한 새 커밋의 이미지가 `production`으로 올라오도록 하세요. 레지스트리에 없는 초기 기존 이미지로 롤백했다면 수정한 새 이미지가 필요합니다. 태그를 그대로 둔 채 재개하면 VM이 롤백 전 이미지를 다시 적용할 수 있습니다.

```sh
sudo systemctl enable --now planfix-frontend-deploy.timer
```

## VM 배포 스크립트 변경

`deploy/frontend/**` 변경도 테스트와 이미지 배포를 실행하지만, VM에 설치된 배포 스크립트와 systemd 설정은 이미지에 포함되지 않습니다. 이 파일을 변경하면 VM에서 설치 절차를 다시 수행해야 합니다. 일반적인 `frontend/**` 애플리케이션 변경에는 VM 접속이 필요 없습니다.

최신 저장소 파일을 VM에 준비하고 저장소 루트에서 실행합니다. VM에는 Docker Compose, Bash, Python 3, curl, flock, timeout이 필요합니다. 운영 Compose에는 HTTPS 포트와 인증서·도메인 설정 마운트가 있으므로 기존 `/opt/planfix-frontend/compose.yaml`은 보존합니다.

```sh
sudo systemctl stop planfix-frontend-deploy.timer
sudo systemctl stop planfix-frontend-deploy.service
sudo install -d -m 0755 /opt/planfix-frontend
sudo install -m 0755 deploy/frontend/deploy.sh /opt/planfix-frontend/deploy.sh
sudo install -m 0644 deploy/frontend/planfix-frontend-deploy.service /etc/systemd/system/
sudo install -m 0644 deploy/frontend/planfix-frontend-deploy.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now planfix-frontend-deploy.timer
```

설치 후 `journalctl`과 공개 페이지에서 반영을 확인합니다. 첫 실행은 기존 `planfix-fe-frontend-1` 컨테이너의 이미지를 현재 정상 이미지로 저장하므로, 해당 컨테이너가 없는 새 VM에는 별도의 초기 구성이 필요합니다.
