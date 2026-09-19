# 장소 상세정보 4일 수집 배치

2026년 9월 19일 조사에서 남은 작업을 **9월 20일~23일 매일 오전 11시(한국 시간)**에 실행한다. 운영 VM `planfix-fe`의 `planfix-spot-backfill.timer`를 사용하므로 개인 컴퓨터가 꺼져 있어도 실행된다. 4개 날짜만 예약하며 프로그램도 기간 밖에서 API를 호출하지 않는다. VM이 중지되어 있으면 실행할 수 없으며, 기간 내 재부팅 시 누락된 실행을 한 번 보완한다.

| 대상 | 예약 당시 미수집 작업 | 한국관광공사 TourAPI |
| --- | ---: | --- |
| 장소 설명 | 3,760 | `KorService2/detailCommon2` |
| 기본 이용안내 | 292 | `KorService2/detailIntro2` |
| 추가 이용안내 | 114 | `KorService2/detailInfo2` |

작업 건수는 API별이며 같은 장소가 중복될 수 있다. 9월 19일 저장한 3,000개 정상 응답은 대상에서 제외했다. 테스트용 잘못된 장소 ID도 제외했다. 원본에 정보가 없는 정상 응답은 `empty`, 실제 저장은 `saved`, 미수집/오류는 `pending`으로 구분한다. 이후 다른 작업으로 내용이 채워졌거나 장소가 숨겨지면 API 호출 전에 건너뛴다.

## 한도와 재시작

API별 하루 최대 1,000회 요청으로 제한한다. 실패·추가 페이지도 한도에 포함하며 요청 전에 SQLite에 사용량을 확정한다. 외부 API가 먼저 한도 초과를 반환하면 해당 API는 다음 날까지 중단한다. 이 한도는 배치 자체의 제한이며 다른 수집기가 같은 키를 쓰면 실제 남은 한도가 줄어든다. 기존 운영 환경에서 각 상세 API별 1,000회 성공 후 한도 초과가 확인된 것을 기준으로 한다.

설명은 정상 진행 시 1,000 / 1,000 / 1,000 / 760건으로 나누어 조회한다. 오류·외부 한도 사용·제공기관의 빈 응답 때문에 모든 장소에 텍스트가 생기는 것을 보장하지는 않는다. 4일 종료 후 `remaining`과 `empty_sources`로 미해결 건을 확인한다.

응답 페이지, 진행 상태, 날짜별 사용량은 `/var/lib/planfix-spot-backfill/state.sqlite3`에 저장된다. 정상 응답을 먼저 저장한 뒤 운영 DB에 반영하므로 DB 장애 후 API를 다시 호출할 필요가 없다. 프로세스 간 파일 잠금으로 중복 실행을 막는다. 장소 ID·외부 ID·유형·공개 상태를 재검증한 뒤 빈 필드만 채우며 조회수·좋아요·공개 상태는 수정하지 않는다. 일시적인 요청 실패는 하루 최대 3회, 프로세스/DB 실패는 15분 간격으로 재시도한다. 기간이 끝나면 추가 요청하지 않는다.

## 설치와 확인

코드는 `deploy/spot-backfill/`에 있다. Python 3과 venv가 필요하다(Ubuntu에서는 `python3.14-venv` 패키지). 운영 manifest는 기존 감사 결과에서 성공 응답이 없는 작업만 추출한 JSON 배열이며 `spot_id`, `tour_data_spot_id`, `contentid`, `content_type`, `operation`만 포함한다. 실제 manifest, 인증정보, 응답, SQLite 파일은 Git에 올리지 않는다. 수집 범위가 달라지는 manifest 교체는 별도 검토가 필요하다.

```sh
sudo bash deploy/spot-backfill/install.sh /path/to/manifest.json
```

인증정보는 `/etc/planfix-spot-backfill/credentials.json`에 root 소유, 권한 `0600`으로 전달한다. JSON의 `database`에는 psycopg2 접속 옵션(`host`, `port`, `dbname`, `user`, `password`, 필요 시 `sslmode`), `tour_api_key`에는 기존 TourAPI 키를 넣는다. 운영 배치는 동일 VPC의 `pf-postgresql` VM 내부 주소로 연결한다. 명령 인자나 Git, 로그에 인증정보를 남기지 않는다. 서비스는 systemd `LoadCredential`로 필요한 인증정보만 전달받는다.

다음 사전 점검은 운영 DB를 읽기만 하고 TourAPI를 호출하지 않는다.

```sh
sudo systemd-run --unit=planfix-spot-backfill-check --wait --pipe --collect \
  -p User=planfix-spot-backfill -p Group=planfix-spot-backfill \
  -p StateDirectory=planfix-spot-backfill -p StateDirectoryMode=0750 \
  -p UMask=0077 \
  -p LoadCredential=credentials.json:/etc/planfix-spot-backfill/credentials.json \
  /opt/planfix-spot-backfill/venv/bin/python /opt/planfix-spot-backfill/backfill.py check
sudo systemctl enable --now planfix-spot-backfill.timer
sudo systemctl list-timers planfix-spot-backfill.timer --all --no-pager
```

일별 결과는 `/var/lib/planfix-spot-backfill/YYYY-MM-DD.json`, 최신 결과는 `latest.json`, 사전 점검은 `preflight.json`에 기록된다. 보고서의 `remaining`은 장소 수가 아닌 미완료 API 작업 수다. `empty_sources`에는 제공기관에서 정상 빈 응답을 받은 외부 ID가 남고 `pending_errors`에는 인증정보가 없는 오류 종류만 남는다. 중간 진행은 다음 `status` 명령으로 확인한다.

```sh
sudo -u planfix-spot-backfill /opt/planfix-spot-backfill/venv/bin/python /opt/planfix-spot-backfill/backfill.py status
sudo journalctl -u planfix-spot-backfill.service --no-pager -n 30
```

예약을 취소하려면 타이머와 이미 실행 중인 서비스를 함께 중지한다. 저장된 상태는 재수집 방지를 위해 보존한다.

```sh
sudo systemctl disable --now planfix-spot-backfill.timer
sudo systemctl stop planfix-spot-backfill.service
```

## 검증

`python -m unittest discover -s deploy/spot-backfill/tests -v`로 요청 예산, 날짜 경계, 재시작, 페이지 이어받기, 원본 ID 검사, 3,760건의 4일 분할을 확인한다. 운영 DB 저장 검증은 별도의 일회용 PostgreSQL에만 실행한다. `PLANFIX_BACKFILL_TEST_DB` 환경변수에 그 DB 접속 옵션 JSON을 전달하면 추가로 빈 응답, 동시 변경, 기존 이용안내 보존, 조회수·좋아요 보존, 읽기 전용 점검을 검증한다. **이 테스트 환경변수에 운영 DB를 지정하면 안 된다.**
