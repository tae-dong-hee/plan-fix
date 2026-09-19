#!/usr/bin/env python3
"""Finite, checkpointed TourAPI backfill. Credentials/production manifest stay off git."""
import argparse
from collections import Counter
from datetime import date, datetime
import fcntl
import html
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import time
from urllib.error import HTTPError
from urllib.parse import unquote, urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

KST = ZoneInfo('Asia/Seoul')
START = date(2026, 9, 20)
END = date(2026, 9, 23)
LIMIT = 1000  # Requests, including failures and pagination, per operation per KST day.
OPS = ('detailCommon2', 'detailIntro2', 'detailInfo2')
TYPES = {'12', '14', '15', '25', '28', '32', '38', '39'}
EXTRA_TYPES = {'12', '14', '15', '28', '38', '39'}
FIELDS = ('tel', 'park_info', 'time_info', 'rest_info', 'firstmenu', 'treatmenu', 'lcnsno')
BASE = 'https://apis.data.go.kr/B551011/KorService2/'


class Quota(Exception):
    pass


class InvalidResponse(Exception):
    pass


class ApiFailure(Exception):
    pass


def today():
    return datetime.now(KST).date()


def clean(value):
    return str(value).strip() or None if value is not None else None


def visible(value):
    return bool(html.unescape(re.sub('<[^>]*>', '', value or '')).strip())


def permitted(day):
    return START <= day <= END


def valid_task(task):
    return (task.get('operation') in OPS and task.get('content_type') in TYPES
            and all(type(task.get(k)) is int and task[k] > 0
                    for k in ('spot_id', 'tour_data_spot_id', 'contentid'))
            and task['contentid'] < 100000000
            and (task['operation'] != 'detailInfo2' or task['content_type'] in EXTRA_TYPES))


class State:
    def __init__(self, path):
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript('''
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=FULL;
            CREATE TABLE IF NOT EXISTS tasks (
                operation TEXT, contentid INTEGER, payload TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending', error TEXT,
                PRIMARY KEY(operation, contentid));
            CREATE TABLE IF NOT EXISTS pages (
                operation TEXT, contentid INTEGER, page INTEGER, response TEXT NOT NULL,
                PRIMARY KEY(operation, contentid, page));
            CREATE TABLE IF NOT EXISTS budget (
                day TEXT, operation TEXT, calls INTEGER NOT NULL DEFAULT 0,
                blocked INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day, operation));
            CREATE TABLE IF NOT EXISTS failures (
                day TEXT, operation TEXT, contentid INTEGER, count INTEGER NOT NULL,
                PRIMARY KEY(day, operation, contentid));
        ''')

    def seed(self, manifest):
        seen = set()
        for task in manifest:
            key = (task.get('operation'), task.get('contentid'))
            if not valid_task(task) or key in seen:
                raise ValueError('Invalid or duplicate manifest task')
            seen.add(key)
        with self.conn:
            for task in manifest:
                old = self.conn.execute('SELECT payload FROM tasks WHERE operation=? AND contentid=?',
                                        (task['operation'], task['contentid'])).fetchone()
                if old and json.loads(old[0]) != task:
                    raise ValueError('Manifest changed for existing task')
                self.conn.execute('INSERT OR IGNORE INTO tasks(operation,contentid,payload) VALUES(?,?,?)',
                                  (task['operation'], task['contentid'], json.dumps(task)))

    def pending(self, op, day):
        rows = self.conn.execute('''SELECT t.payload FROM tasks t LEFT JOIN failures f
            ON f.operation=t.operation AND f.contentid=t.contentid AND f.day=?
            WHERE t.operation=? AND t.status='pending' AND COALESCE(f.count,0)<3
            ORDER BY COALESCE(f.count,0), t.contentid''', (str(day), op))
        return [json.loads(r[0]) for r in rows]

    def reserve(self, op, day):
        # Commit BEFORE network I/O: a killed request still counts after restart.
        with self.conn:
            self.conn.execute('INSERT OR IGNORE INTO budget(day,operation) VALUES(?,?)', (str(day), op))
            return self.conn.execute('''UPDATE budget SET calls=calls+1
                WHERE day=? AND operation=? AND calls<? AND blocked=0''',
                (str(day), op, LIMIT)).rowcount == 1

    def block(self, op, day):
        with self.conn:
            self.conn.execute('UPDATE budget SET blocked=1 WHERE day=? AND operation=?', (str(day), op))

    def finish(self, task, status):
        with self.conn:
            self.conn.execute('UPDATE tasks SET status=?,error=NULL WHERE operation=? AND contentid=?',
                              (status, task['operation'], task['contentid']))

    def fail(self, task, day, error):
        with self.conn:
            self.conn.execute('''INSERT INTO failures VALUES(?,?,?,1)
                ON CONFLICT(day,operation,contentid) DO UPDATE SET count=count+1''',
                (str(day), task['operation'], task['contentid']))
            self.conn.execute('UPDATE tasks SET error=? WHERE operation=? AND contentid=?',
                              (error, task['operation'], task['contentid']))

    def page(self, task, number):
        row = self.conn.execute('SELECT response FROM pages WHERE operation=? AND contentid=? AND page=?',
                                (task['operation'], task['contentid'], number)).fetchone()
        return json.loads(row[0]) if row else None

    def save_page(self, task, number, response):
        with self.conn:
            self.conn.execute('INSERT OR REPLACE INTO pages VALUES(?,?,?,?)',
                              (task['operation'], task['contentid'], number, json.dumps(response)))

    def clear_pages(self, task):
        with self.conn:
            self.conn.execute('DELETE FROM pages WHERE operation=? AND contentid=?',
                              (task['operation'], task['contentid']))

    def report(self):
        counts = {}
        for row in self.conn.execute('SELECT operation,status,count(*) FROM tasks GROUP BY operation,status'):
            counts.setdefault(row[0], {})[row[1]] = row[2]
        return {'checked_at': datetime.now(KST).isoformat(), 'start': str(START), 'end': str(END),
                'counts': counts, 'budgets': [dict(r) for r in self.conn.execute(
                    'SELECT * FROM budget ORDER BY day,operation')],
                'remaining': sum(v.get('pending', 0) for v in counts.values()),
                'pending_errors': [dict(r) for r in self.conn.execute(
                    "SELECT operation,contentid,error FROM tasks WHERE status='pending' AND error IS NOT NULL")],
                'empty_sources': [dict(r) for r in self.conn.execute(
                    "SELECT operation,contentid FROM tasks WHERE status='empty'")]}


def parse_page(data, task, page):
    try:
        response = data['response']
        header = response['header']
        code = str(header['resultCode'])
        message = str(header.get('resultMsg', '')).upper()
        if code == '22' or 'LIMITED_NUMBER' in message:
            raise Quota()
        if code != '0000':
            raise ApiFailure()
        body = response['body']
        total = int(body['totalCount'])
        wrapper = body.get('items')
        items = wrapper.get('item', []) if isinstance(wrapper, dict) else []
        if isinstance(items, dict):
            items = [items]
        if not isinstance(items, list) or total < 0:
            raise InvalidResponse()
        if int(body.get('pageNo', page)) != page:
            raise InvalidResponse()
        if not items and total != 0:
            raise InvalidResponse()
        if len(items) > total or (task['operation'] != 'detailInfo2' and total > 1):
            raise InvalidResponse()
        for item in items:
            if str(item.get('contentid')) != str(task['contentid']):
                raise InvalidResponse()
            if item.get('contenttypeid') and str(item['contenttypeid']) != task['content_type']:
                raise InvalidResponse()
        return items, total
    except (KeyError, TypeError, ValueError):
        raise InvalidResponse() from None


def request_page(task, page, key):
    params = dict(serviceKey=unquote(key), MobileOS='ETC', MobileApp='PlanFix',
                  _type='json', contentId=task['contentid'], numOfRows=100, pageNo=page)
    if task['operation'] != 'detailCommon2':
        params['contentTypeId'] = task['content_type']
    req = Request(BASE + task['operation'] + '?' + urlencode(params),
                  headers={'User-Agent': 'PlanFix-four-day-backfill'})
    status = 200
    try:
        with urlopen(req, timeout=30) as response:
            raw = response.read(5_000_000).decode('utf-8')
    except HTTPError as error:
        status = error.code
        raw = error.read(100_000).decode('utf-8', errors='replace')
    if status == 429 or 'LIMITED_NUMBER' in raw.upper():
        raise Quota()
    if status >= 400:
        raise ApiFailure()
    try:
        return json.loads(raw)
    except ValueError:
        raise InvalidResponse() from None


def fetch(task, state, key, day, requester=request_page, pause=time.sleep):
    all_items, expected = [], None
    for page in range(1, 101):
        data = state.page(task, page)
        if data is None:
            if today() != day or not permitted(today()) or not state.reserve(task['operation'], day):
                raise Quota()
            pause(.25)
            data = requester(task, page, key)
            parse_page(data, task, page)
            state.save_page(task, page, data)
        items, total = parse_page(data, task, page)
        if expected is not None and total != expected:
            raise InvalidResponse()
        expected = total
        all_items.extend(items)
        if len(all_items) > total:
            raise InvalidResponse()
        if len(all_items) == total:
            # Do not accept a repeated first page as a complete later page.
            if task['operation'] == 'detailInfo2' and len({json.dumps(i, sort_keys=True) for i in all_items}) != total:
                raise InvalidResponse()
            return all_items
    raise InvalidResponse()


def intro_values(task, item):
    keys = {
        '12': ('infocenter', 'parking', 'usetime', 'restdate'),
        '14': ('infocenterculture', 'parkingculture', 'usetimeculture', 'restdateculture'),
        '15': ('sponsor1tel', None, 'playtime', None),
        '25': ('infocentertourcourse', None, 'taketime', None),
        '28': ('infocenterleports', 'parkingleports', 'usetimeleports', 'restdateleports'),
        '32': ('infocenterlodging', 'parkinglodging', 'checkintime', None),
        '38': ('infocentershopping', 'parkingshopping', 'opentime', 'restdateshopping'),
        '39': ('infocenterfood', 'parkingfood', 'opentimefood', 'restdatefood'),
    }[task['content_type']]
    values = [clean(item.get(k)) if k else None for k in keys]
    return values + [clean(item.get(k)) if task['content_type'] == '39' else None
                     for k in FIELDS[4:]]


def extra_value(items):
    sections = []
    for item in sorted(items, key=lambda i: int(i.get('serialnum') or 0)):
        value = clean(item.get('infotext'))
        if not visible(value):
            continue
        label = clean(item.get('infoname'))
        sections.append((label + '\n' if label else '') + value)
    return '\n\n'.join(dict.fromkeys(sections))


class Database:
    def __init__(self, config):
        import psycopg2
        self.conn = psycopg2.connect(**config, connect_timeout=10,
                                     application_name='planfix-four-day-spot-backfill',
                                     options='-c statement_timeout=15000 -c lock_timeout=3000')

    def current(self, cursor, task, lock=False):
        cursor.execute('''SELECT s.status,s.source_type,t.contentid,t.category,s.description,to_jsonb(i)
            FROM spots s JOIN tour_data_spots t ON t.spot_id=s.spot_id
            LEFT JOIN tour_data_info i ON i.contentid=t.contentid
            WHERE s.spot_id=%s AND t.tour_data_spot_id=%s''' + (' FOR UPDATE OF s,t' if lock else ''),
            (task['spot_id'], task['tour_data_spot_id']))
        row = cursor.fetchone()
        if (not row or row[0] != 'ACTIVE' or row[1] != 'TOUR_API'
                or row[2] != task['contentid'] or row[3] != task['content_type']):
            return 'skipped_changed_source'
        info = row[5] or {}
        if info and info['tour_data_spot_id'] != task['tour_data_spot_id']:
            return 'skipped_changed_source'
        if task['operation'] == 'detailCommon2' and row[4] is not None:
            return 'skipped_filled'
        if task['operation'] == 'detailIntro2' and any(visible(info.get(f)) for f in FIELDS):
            return 'skipped_filled'
        if task['operation'] == 'detailInfo2' and info.get('additional_info') is not None:
            return 'skipped_filled'
        return None

    def eligible(self, task):
        with self.conn:
            with self.conn.cursor() as cursor:
                return self.current(cursor, task)

    def apply(self, task, items):
        with self.conn:
            with self.conn.cursor() as cur:
                skipped = self.current(cur, task, lock=True)
                if skipped:
                    return skipped
                item = items[0] if items else {}
                if task['operation'] == 'detailCommon2':
                    value = clean(item.get('overview'))
                    value = value if visible(value) else ''
                    cur.execute('UPDATE spots SET description=%s,updated_at=now() WHERE spot_id=%s AND description IS NULL',
                                (value, task['spot_id']))
                    has_data = bool(value)
                elif task['operation'] == 'detailIntro2':
                    values = intro_values(task, item)
                    updates = ','.join(f"{f}=COALESCE(NULLIF(btrim(tour_data_info.{f}),''),EXCLUDED.{f})" for f in FIELDS)
                    cur.execute(f'''INSERT INTO tour_data_info(tour_data_spot_id,contentid,category,
                        {','.join(FIELDS)},created_at,updated_at) VALUES(%s,%s,%s,{','.join(['%s']*7)},now(),now())
                        ON CONFLICT(contentid) DO UPDATE SET {updates},updated_at=now()
                        WHERE tour_data_info.tour_data_spot_id=EXCLUDED.tour_data_spot_id''',
                        [task['tour_data_spot_id'], task['contentid'], task['content_type']] + values)
                    cur.execute('UPDATE tour_data_spots SET info_collected_at=now() WHERE tour_data_spot_id=%s AND info_collected_at IS NULL',
                                (task['tour_data_spot_id'],))
                    has_data = any(visible(v) for v in values)
                else:
                    value = extra_value(items)
                    cur.execute('''INSERT INTO tour_data_info(tour_data_spot_id,contentid,category,additional_info,created_at,updated_at)
                        VALUES(%s,%s,%s,%s,now(),now()) ON CONFLICT(contentid) DO UPDATE
                        SET additional_info=EXCLUDED.additional_info,updated_at=now()
                        WHERE tour_data_info.additional_info IS NULL
                        AND tour_data_info.tour_data_spot_id=EXCLUDED.tour_data_spot_id''',
                        (task['tour_data_spot_id'], task['contentid'], task['content_type'], value))
                    has_data = bool(value)
        return 'saved' if has_data else 'empty'

    def check(self, manifest):
        counts = Counter()
        # Read-only production preflight; no TourAPI calls, no production mutations.
        self.conn.set_session(readonly=True)
        with self.conn:
            with self.conn.cursor() as cur:
                cur.execute('SELECT additional_info FROM tour_data_info LIMIT 0')
                for task in manifest:
                    counts[task['operation'] + ':' + (self.current(cur, task) or 'pending')] += 1
        return dict(counts)


def run(state, db, key, day):
    if not permitted(day):
        return
    deadline = time.monotonic() + 5400
    for op in OPS:
        blocked = False
        for _ in range(3):
            for task in state.pending(op, day):
                if today() != day or time.monotonic() > deadline:
                    raise RuntimeError('Execution window ended')
                skipped = db.eligible(task)
                if skipped:
                    state.finish(task, skipped)
                    continue
                try:
                    items = fetch(task, state, key, day)
                except Quota:
                    state.block(op, day)
                    blocked = True
                    break
                except Exception as error:
                    # Never log exception strings: URLs may contain the service key.
                    if isinstance(error, InvalidResponse):
                        state.clear_pages(task)
                    state.fail(task, day, type(error).__name__)
                    continue
                # Persist DB commit before completion marker. Replay is conditional/idempotent.
                state.finish(task, db.apply(task, items))
            if blocked:
                break


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=('run', 'check', 'status'))
    parser.add_argument('--state-dir', type=Path, default=Path('/var/lib/planfix-spot-backfill'))
    parser.add_argument('--manifest', type=Path, default=Path('/etc/planfix-spot-backfill/manifest.json'))
    parser.add_argument('--credentials', type=Path, default=Path(os.environ.get(
        'CREDENTIALS_DIRECTORY', '/etc/planfix-spot-backfill')) / 'credentials.json')
    args = parser.parse_args()
    with (args.state_dir / 'run.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(json.dumps({'status': 'already_running'}))
            return 0
        state = State(args.state_dir / 'state.sqlite3')
        manifest = json.loads(args.manifest.read_text())
        state.seed(manifest)
        error = None
        try:
            if args.mode == 'check' or (args.mode == 'run' and permitted(today())):
                config = json.loads(args.credentials.read_text())
                db = Database(config['database'])
                try:
                    if args.mode == 'check':
                        print(json.dumps({'preflight': db.check(manifest)}), flush=True)
                    else:
                        run(state, db, config['tour_api_key'], today())
                finally:
                    db.conn.close()
        except Exception as exc:
            error = type(exc).__name__
        report = state.report()
        report.update(mode=args.mode, error=error, within_collection_dates=permitted(today()))
        target = args.state_dir / ('preflight.json' if args.mode == 'check' else 'latest.json')
        temp = target.with_suffix('.tmp')
        temp.write_text(json.dumps(report, ensure_ascii=False, indent=2))
        temp.replace(target)
        if args.mode == 'run':
            (args.state_dir / f'{today()}.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps({k: v for k, v in report.items() if k not in ('empty_sources', 'pending_errors')},
                         ensure_ascii=False), flush=True)
        return 1 if error else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as exc:
        print(json.dumps({'fatal': type(exc).__name__}), flush=True)
        sys.exit(1)
