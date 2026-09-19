# 계정 복구 요청 제한

문자 요청에는 **휴대폰번호당 시간당 5회와 60초 재발송 간격**, 인증번호에는 **인증 요청당 오답 5회** 제한을 적용한다. 여러 서버 인스턴스에서도 같은 제한이 적용되도록 PostgreSQL에 상태를 저장한다. 번호 등록에는 별도의 계정별 제한도 적용한다.

추가 요청 상한은 개별 사용자 IP가 아닌 **서버에 연결된 socket peer가 공유하는 상한**이다. 운영의 VM Nginx → Cloud Run 경로에서는 여러 사용자가 하나의 프록시 주소를 공유할 수 있다. 기본값은 해당 peer당 요청 1,000회/시간, 인증 확인 3,000회/시간이다. 따라서 같은 프록시를 통과한 사용자 20명의 접근만으로 복구 기능이 차단되지 않는다. 이 상한은 수신번호별 제한과 인증번호 오답 제한을 대체하지 않는다.

```yaml
app:
  account-recovery:
    request-hourly-limit: ${RECOVERY_REQUESTS_PER_PEER_HOUR:1000}
    confirmation-hourly-limit: ${RECOVERY_CONFIRMATIONS_PER_PEER_HOUR:3000}
```

설정값은 양수여야 한다. 두 상한은 독립된 버킷이며, 같은 peer가 쓰는 관련 복구 기능은 동일한 요청 버킷을 공유한다. 실제 사용자 수와 운영 프록시 경로에 맞춰 조정한다. 상한을 높여도 수신번호당 제한과 인증번호당 오답 제한은 유지한다.

컨트롤러는 `HttpServletRequest.getRemoteAddr()`만 전달한다. 클라이언트가 보낸 `X-Forwarded-For`를 새로 신뢰하거나 첫 항목을 사용자 IP로 간주하지 않는다. 실제 클라이언트 IP별 제한이 필요하면 운영 경로의 신뢰할 수 있는 프록시를 확인하고 오른쪽부터 신뢰 경계를 적용하는 별도 설정이 필요하다. Google의 전달 헤더는 사용자가 넣은 기존 값을 포함할 수 있다. [Google 공식 전달 헤더 설명](https://docs.cloud.google.com/load-balancing/docs/https#x-forwarded-for_header), [Spring 프록시 설정](https://docs.spring.io/spring-boot/how-to/webserver.html)

요청 제한은 계정·인증 요청의 트랜잭션을 시작하기 전에 검사한다. 발송 실패나 잘못된 인증 요청도 이미 사용한 제한을 되돌리지 않는다. 동시에 외부 트랜잭션이 DB 연결을 점유한 상태에서 제한용 새 연결을 기다리는 구조를 피한다.
