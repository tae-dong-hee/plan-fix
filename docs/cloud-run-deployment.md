# GitHub에서 Cloud Run 백엔드 자동 배포

[`Deploy backend to Cloud Run`](../.github/workflows/deploy-backend.yml) 워크플로는 `main`의 백엔드 변경을 테스트한 뒤 기존 Cloud Run 서비스에 배포합니다. 코드 수정 후 GitHub에 push하거나 PR을 `main`에 병합하면 됩니다. 실제 실행 결과는 저장소의 [Actions](https://github.com/tae-dong-hee/plan-fix/actions/workflows/deploy-backend.yml)에서 확인합니다.

## 실행 조건

| 작업 | 실행 내용 |
| --- | --- |
| `main`에 `backend/**` 또는 워크플로 파일 변경 push | 테스트 통과 후 백엔드 배포 |
| `main` 대상 PR에서 같은 경로 변경 | 테스트만 실행 |
| Actions의 **Run workflow**에서 `main` 선택 | 테스트 후 수동 배포 |
| 다른 브랜치에서 수동 실행 | 테스트만 실행 |
| 프런트엔드나 문서만 변경 | 백엔드 자동 배포 실행 안 함 |

같은 브랜치의 실행은 동시에 배포하지 않도록 설정되어 있습니다. 실행 중인 배포를 새 push가 취소하지 않습니다.

## 배포 과정과 대상

1. Java 21과 별도의 PostgreSQL 17 컨테이너에서 `SPRING_PROFILES_ACTIVE=ci ./gradlew --no-daemon test`를 실행합니다. [`application-ci.yml`](../backend/src/test/resources/application-ci.yml)은 로컬 비밀 파일을 읽지 않으며, 운영 DB와 분리된 일회용 DB를 사용합니다. 도입 시 같은 CI 프로필로 검증한 결과는 52개 테스트 클래스, 303개 테스트 통과였습니다.
2. [`backend/Dockerfile`](../backend/Dockerfile)로 실행 JAR와 Java 21 런타임 이미지를 만듭니다. 컨테이너는 일반 사용자로 실행되며 8080 포트를 사용합니다.
3. GitHub의 OIDC 토큰으로 Google Cloud에 인증하고, 커밋 SHA를 태그로 붙인 이미지를 Artifact Registry에 올립니다.
4. 기존 Cloud Run 서비스의 이미지와 배포 추적용 라벨을 갱신하고, 새 리비전의 준비 상태를 기다립니다. 이어 `--to-latest`로 최신 리비전에 트래픽을 보냅니다.
5. 공개 API `/api/v1/spots?size=1`을 호출해 정상 응답을 확인합니다. 성공하면 실행 요약에 커밋, 서비스 URL, 이미지 주소를 기록합니다.

| 항목 | 설정 |
| --- | --- |
| GitHub 저장소 | `tae-dong-hee/plan-fix` |
| GCP 프로젝트 | `planfix-01` / 프로젝트 번호 `148201851366` |
| 리전 | `asia-northeast3` |
| Cloud Run 서비스 | `planfix-backend` |
| 이미지 | `asia-northeast3-docker.pkg.dev/planfix-01/cloud-run-source-deploy/planfix-backend:<COMMIT_SHA>` |
| 공개 백엔드 URL | `https://planfix-backend-148201851366.asia-northeast3.run.app` |

배포 명령은 기존 서비스의 DB 연결 설정, 환경변수, Secret Manager 참조, VPC 연결, 실행 서비스 계정 및 공개 URL을 유지합니다. 새 서비스를 만들거나 운영 설정을 GitHub의 값으로 덮어쓰지 않습니다. 애플리케이션이 기동할 때 수행하는 DB 스키마 처리는 기존 Spring 설정을 따릅니다.

## 인증과 비밀값

배포에는 Workload Identity Federation(WIF)을 사용합니다. GitHub Secrets에 Google 서비스 계정 JSON 키나 운영 DB 비밀번호를 등록할 필요가 없습니다. 런타임 비밀값은 기존 Google Secret Manager에서 관리하고 Cloud Run에서 참조합니다.

- WIF 공급자: `projects/148201851366/locations/global/workloadIdentityPools/planfix-github/providers/planfix-repo`
- 배포 서비스 계정: `planfix-github-deploy@planfix-01.iam.gserviceaccount.com`
- 신뢰 조건: `repository_owner_id=243352673`, `repository_id=1328290631`, `refs/heads/main`, `tae-dong-hee/plan-fix/.github/workflows/deploy-backend.yml@refs/heads/main` 워크플로 경로를 고정합니다. 이름이 같은 다른 저장소나 다른 브랜치·워크플로에는 배포 권한을 부여하지 않습니다.
- 해당 저장소의 WIF 주체에는 배포 서비스 계정을 사용할 `roles/iam.workloadIdentityUser` 권한을 부여합니다.
- 배포 서비스 계정의 `roles/run.developer`는 기존 `planfix-backend` 서비스에, `roles/artifactregistry.writer`는 `cloud-run-source-deploy` 저장소에, `roles/iam.serviceAccountUser`는 Cloud Run의 기존 실행 서비스 계정 `planfix-run@planfix-01.iam.gserviceaccount.com`에 한정합니다.

[`backend/.dockerignore`](../backend/.dockerignore)는 모든 하위 경로의 `application-secret.*`, `.env*`, 임시 GitHub 인증 파일과 로컬 빌드 산출물을 이미지 빌드에서 제외합니다. 테스트 DB의 기본 계정은 일회용 CI 전용이며 운영 인증정보가 아닙니다.

## 재실행과 오류 확인

Actions에서 실패한 실행을 열어 `test`, `Build container`, `Authenticate to Google Cloud`, `Push container`, `Update existing Cloud Run service`, `Verify public API` 중 실패한 단계를 확인합니다. 일시적인 오류라면 **Re-run failed jobs** 또는 **Re-run all jobs**를 사용할 수 있습니다. 기존 실행을 재실행하면 그 실행의 커밋을 사용합니다. 최신 `main`을 배포하려면 **Run workflow**에서 `main`을 선택합니다.

리비전의 준비 상태 확인은 컨테이너가 기동했는지 확인하는 단계입니다. 이후 API 검사가 실제 요청 처리까지 확인합니다. **API 검사 실패는 워크플로를 실패 처리하지만 자동 롤백하지 않습니다.** 이미 트래픽이 새 리비전으로 전환됐을 수 있으므로 필요하면 아래 절차로 이전 정상 리비전을 선택합니다.

## 이전 리비전으로 롤백

Cloud Run 배포 권한이 있는 계정으로 로그인한 터미널에서 리비전을 조회합니다.

```sh
gcloud run revisions list \
  --project planfix-01 \
  --region asia-northeast3 \
  --service planfix-backend
```

`REVISION_NAME`을 정상 동작했던 리비전 이름으로 바꿔 트래픽 100%를 전환합니다.

```sh
gcloud run services update-traffic planfix-backend \
  --project planfix-01 \
  --region asia-northeast3 \
  --to-revisions 'REVISION_NAME=100'
```

롤백 뒤에는 서비스 URL의 API 응답을 다시 확인합니다. 다음 GitHub 배포는 `--to-latest`를 실행하므로, 새로 배포한 최신 리비전으로 트래픽 100%가 다시 이동합니다.

## 프런트엔드 범위

비밀번호 재설정 기능은 별도의 SMTP 설정이 필요합니다. Cloud Run 환경변수와 Secret Manager에
추가할 값은 [비밀번호 재설정 가이드](password-reset.md)를 참고하세요. SMTP가 설정되지 않으면
비밀번호 재설정 요청은 이용 불가 안내를 반환하며 기존 로그인과 카카오 로그인은 계속 사용할 수 있습니다.

프런트엔드는 별도의 [`Deploy frontend to VM`](../.github/workflows/deploy-frontend.yml) 워크플로로 기존 VM `34.64.203.44`에 자동 배포됩니다. `main`의 `frontend/**` 변경이 배포를 시작하며, 백엔드와 프런트엔드를 함께 변경하면 두 워크플로가 각각 실행됩니다. 실행 조건과 VM 운영 절차는 [프런트엔드 배포 가이드](frontend-deployment.md)를 참고하세요.
