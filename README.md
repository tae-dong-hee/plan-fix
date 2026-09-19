# plan-fix
플랜픽스

## 백엔드 테스트

Java 21과 실행 중인 Docker가 필요합니다.

```sh
cd backend
./gradlew test
```

Spring 통합 테스트는 Testcontainers가 생성한 PostgreSQL 17 임시 컨테이너를 사용합니다.
테스트용 설정이 `DB_*`, `SPRING_DATASOURCE_*`, 로컬 비밀 설정의 DB 연결보다 우선하며,
IDE에서 개별 테스트를 실행해도 같은 격리가 적용됩니다. Docker를 사용할 수 없으면 테스트는
실패하며 다른 DB로 연결하지 않습니다. 컨테이너와 테스트 데이터는 테스트 JVM 종료 후 삭제됩니다.

`src/test/resources/META-INF/spring.factories`가 모든 Spring 테스트에 DB 격리를 등록합니다.
새 `@SpringBootTest`에는 외부 서비스의 로컬 설정을 읽지 않도록 `@ActiveProfiles("test")`도 붙입니다.

GitHub `main`에 코드를 push하거나 PR을 병합하면 변경한 서비스가 자동 배포됩니다.

- 백엔드 → 기존 Cloud Run 서비스: [백엔드 배포 가이드](docs/cloud-run-deployment.md)
- 프런트엔드 → 기존 VM의 `https://planfix.cloud`: [프런트엔드 배포 가이드](docs/frontend-deployment.md)

비밀번호 찾기는 가입 이메일로 재설정 링크를 발송합니다. 운영 사용에 필요한 SMTP 설정과
확인 절차는 [비밀번호 재설정 가이드](docs/password-reset.md)를 참고하세요.
