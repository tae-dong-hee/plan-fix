import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('backfill', Path(__file__).parents[1] / 'backfill.py')
b = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(b)
DAY = b.START


def task(op='detailCommon2', contentid=123, category='28'):
    return dict(operation=op, contentid=contentid, content_type=category, spot_id=1, tour_data_spot_id=2)


def response(items, total=None, page=1):
    return {'response': {'header': {'resultCode': '0000'}, 'body': {
        'totalCount': len(items) if total is None else total, 'pageNo': page, 'items': {'item': items}}}}


class StateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'state.sqlite3'
        self.state = b.State(self.path)

    def tearDown(self):
        self.state.conn.close()
        self.temp.cleanup()

    def test_budget_survives_restart_and_is_separate_per_endpoint_and_day(self):
        for _ in range(1000):
            self.assertTrue(self.state.reserve(b.OPS[0], DAY))
        self.state.conn.close()
        self.state = b.State(self.path)
        self.assertFalse(self.state.reserve(b.OPS[0], DAY))
        self.assertTrue(self.state.reserve(b.OPS[1], DAY))
        self.assertTrue(self.state.reserve(b.OPS[0], DAY.replace(day=21)))

    def test_quota_stops_operation_for_day(self):
        self.state.reserve(b.OPS[0], DAY)
        self.state.block(b.OPS[0], DAY)
        self.assertFalse(self.state.reserve(b.OPS[0], DAY))
        self.assertTrue(self.state.reserve(b.OPS[0], DAY.replace(day=21)))

    def test_invalid_manifest_and_changed_identity_rejected(self):
        for invalid in (task(contentid=9999999999), task(category='99'), task('detailInfo2', category='32')):
            with self.assertRaises(ValueError):
                self.state.seed([invalid])
        self.state.seed([task()])
        with self.assertRaises(ValueError):
            self.state.seed([task() | {'spot_id': 99}])

    def test_failed_requests_retry_three_times_per_day(self):
        t = task()
        self.state.seed([t])
        for _ in range(3):
            self.assertEqual(len(self.state.pending(t['operation'], DAY)), 1)
            self.state.fail(t, DAY, 'ApiFailure')
        self.assertEqual(self.state.pending(t['operation'], DAY), [])
        self.assertEqual(len(self.state.pending(t['operation'], DAY.replace(day=21))), 1)

    def test_paginated_response_resumes_without_charging_cached_page(self):
        t = task('detailInfo2')
        first = response([{'contentid': '123', 'serialnum': '1', 'infotext': 'A'}], total=2)
        second = response([{'contentid': '123', 'serialnum': '2', 'infotext': 'B'}], total=2, page=2)
        self.state.save_page(t, 1, first)
        called = []
        def request(t, page, key):
            called.append(page)
            return second
        with patch.object(b, 'today', return_value=DAY):
            result = b.fetch(t, self.state, '', DAY, requester=request, pause=lambda _: None)
        self.assertEqual(called, [2])
        self.assertEqual(len(result), 2)
        self.assertEqual(self.state.report()['budgets'][0]['calls'], 1)

    def test_empty_success_is_cached_and_does_not_retry(self):
        t = task()
        with patch.object(b, 'today', return_value=DAY):
            b.fetch(t, self.state, '', DAY, requester=lambda *args: response([]), pause=lambda _: None)
            result = b.fetch(t, self.state, '', DAY, requester=lambda *args: self.fail('Unexpected network'), pause=lambda _: None)
        self.assertEqual(result, [])
        self.assertEqual(self.state.report()['budgets'][0]['calls'], 1)

    def test_mismatched_content_and_incomplete_response_not_accepted(self):
        for data in (response([{'contentid': '456'}]), response([], total=1),
                     response([{'contentid': '123', 'contenttypeid': '39'}])):
            with self.assertRaises(b.InvalidResponse):
                b.parse_page(data, task(), 1)

    def test_repeated_page_is_not_accepted(self):
        t = task('detailInfo2')
        with patch.object(b, 'today', return_value=DAY):
            with self.assertRaises(b.InvalidResponse):
                b.fetch(t, self.state, '', DAY, pause=lambda _: None,
                        requester=lambda t, page, key: response([{'contentid': '123', 'serialnum': '1'}], total=2, page=page))

    def test_four_days_collect_all_3760_and_outside_window_never_calls(self):
        tasks = [task(contentid=n + 1) for n in range(3760)]
        self.state.seed(tasks)
        class FakeDatabase:
            def eligible(self, t):
                return None
            def apply(self, t, items):
                return 'saved'
        def fake_fetch(t, state, key, day):
            if not state.reserve(t['operation'], day):
                raise b.Quota()
            return [{'contentid': str(t['contentid']), 'overview': '설명'}]
        with patch.object(b, 'fetch', side_effect=fake_fetch) as fetch:
            b.run(self.state, FakeDatabase(), '', DAY.replace(day=19))
            fetch.assert_not_called()
            for n, expected in ((20, 2760), (21, 1760), (22, 760), (23, 0)):
                day = DAY.replace(day=n)
                with patch.object(b, 'today', return_value=day):
                    b.run(self.state, FakeDatabase(), '', day)
                self.assertEqual(self.state.report()['remaining'], expected)
            count = fetch.call_count
            b.run(self.state, FakeDatabase(), '', DAY.replace(day=24))
            self.assertEqual(fetch.call_count, count)

    def test_api_error_is_not_empty_and_quota_is_distinguished(self):
        with self.assertRaises(b.Quota):
            b.parse_page({'response': {'header': {'resultCode': '22'}}}, task(), 1)
        with self.assertRaises(b.ApiFailure):
            b.parse_page({'response': {'header': {'resultCode': '99'}}}, task(), 1)

    def test_festival_time_uses_playtime_and_extra_order_is_preserved(self):
        self.assertEqual(b.intro_values(task(category='15'), {'playtime': '18:00', 'usetimefestival': '무료'})[2], '18:00')
        self.assertEqual(b.extra_value([
            {'serialnum': '2', 'infoname': '요금', 'infotext': '무료'},
            {'serialnum': '1', 'infoname': '시간', 'infotext': '10:00'},
        ]), '시간\n10:00\n\n요금\n무료')


@unittest.skipUnless(os.environ.get('PLANFIX_BACKFILL_TEST_DB'), 'Disposable PostgreSQL config required')
class DatabaseTests(unittest.TestCase):
    def setUp(self):
        config = json.loads(os.environ['PLANFIX_BACKFILL_TEST_DB'])
        if config.get('host') not in ('127.0.0.1', 'localhost') or config.get('dbname') != 'backfill_test':
            raise ValueError('Tests require the disposable local backfill_test database')
        self.db = b.Database(config)
        with self.db.conn:
            with self.db.conn.cursor() as cur:
                cur.execute('''DROP TABLE IF EXISTS tour_data_info,tour_data_spots,spots;
                    CREATE TABLE spots(spot_id bigint PRIMARY KEY,status text,source_type text,
                      description text,view_count int,like_count int,updated_at timestamptz);
                    CREATE TABLE tour_data_spots(tour_data_spot_id bigint PRIMARY KEY,spot_id bigint,
                      contentid bigint,category text,info_collected_at timestamptz);
                    CREATE TABLE tour_data_info(tour_data_spot_id bigint,contentid bigint UNIQUE,
                      category text,tel text,park_info text,time_info text,rest_info text,firstmenu text,
                      treatmenu text,lcnsno text,additional_info text,created_at timestamptz,updated_at timestamptz);
                    INSERT INTO spots VALUES(1,'ACTIVE','TOUR_API',NULL,43,7,now());
                    INSERT INTO tour_data_spots VALUES(2,1,123,'28',NULL);''')

    def tearDown(self):
        self.db.conn.close()

    def query(self, sql):
        with self.db.conn:
            with self.db.conn.cursor() as cur:
                cur.execute(sql)
                return cur.fetchall() if cur.description else None

    def test_description_preserves_counters_and_replay_is_noop(self):
        self.assertEqual(self.db.apply(task(), [{'overview': '캠핑장'}]), 'saved')
        self.assertEqual(self.db.apply(task(), [{'overview': '덮어쓰기'}]), 'skipped_filled')
        self.assertEqual(self.query('SELECT description,view_count,like_count,status FROM spots'),
                         [('캠핑장', 43, 7, 'ACTIVE')])

    def test_intro_preserves_extra_and_extra_preserves_intro(self):
        self.assertEqual(self.db.apply(task('detailInfo2'), [{'infoname': '요금', 'infotext': '무료'}]), 'saved')
        self.assertEqual(self.db.apply(task('detailIntro2'), [{'infocenterleports': '033-1234', 'parkingleports': '가능'}]), 'saved')
        self.assertEqual(self.query('SELECT tel,park_info,additional_info FROM tour_data_info'),
                         [('033-1234', '가능', '요금\n무료')])
        self.assertEqual(self.db.apply(task('detailInfo2'), [{'infotext': '덮어쓰기'}]), 'skipped_filled')

    def test_extra_after_intro_preserves_basic_fields(self):
        self.db.apply(task('detailIntro2'), [{'infocenterleports': '033-1234'}])
        self.db.apply(task('detailInfo2'), [{'infotext': '추가 안내'}])
        self.assertEqual(self.query('SELECT tel,additional_info FROM tour_data_info'), [('033-1234', '추가 안내')])

    def test_concurrent_fill_and_hidden_or_changed_source_are_skipped(self):
        self.assertIsNone(self.db.eligible(task()))
        self.query("UPDATE spots SET description='수동 입력'")
        self.assertEqual(self.db.apply(task(), [{'overview': '외부'}]), 'skipped_filled')
        self.query("UPDATE spots SET status='HIDDEN',description=NULL")
        self.assertEqual(self.db.apply(task(), [{'overview': '외부'}]), 'skipped_changed_source')
        self.query("UPDATE spots SET status='ACTIVE'; UPDATE tour_data_spots SET contentid=456")
        self.assertEqual(self.db.apply(task(), [{'overview': '외부'}]), 'skipped_changed_source')

    def test_empty_success_is_marked_separately_from_uncollected(self):
        for op in b.OPS:
            self.assertEqual(self.db.apply(task(op), []), 'empty')
        self.assertEqual(self.query('SELECT description FROM spots'), [('',)])
        self.assertEqual(self.query('SELECT additional_info FROM tour_data_info'), [('',)])
        self.assertEqual(self.query('SELECT info_collected_at IS NOT NULL FROM tour_data_spots'), [(True,)])

    def test_preflight_is_read_only(self):
        self.assertEqual(self.db.check([task()]), {'detailCommon2:pending': 1})
        with self.db.conn.cursor() as cur:
            cur.execute('SHOW transaction_read_only')
            self.assertEqual(cur.fetchone(), ('on',))


if __name__ == '__main__':
    unittest.main()
