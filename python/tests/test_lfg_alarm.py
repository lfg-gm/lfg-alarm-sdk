import json
import unittest
from unittest import mock

import lfg_alarm
from lfg_alarm import LfgAlarm, LfgAlarmError, ring


def answer(status, body, headers=None):
    raw = body if isinstance(body, str) else json.dumps(body)
    return status, headers or {"Content-Type": "application/json"}, raw


class RingTests(unittest.TestCase):
    def test_rang(self):
        with mock.patch.object(lfg_alarm, "_post", return_value=answer(200, {"fired": True, "wokeUp": 2})):
            r = ring("https://api.lfg.gm/horn/abc")
        self.assertTrue(r.rang)
        self.assertEqual(r.woke_up, 2)

    def test_cooling_down_is_not_an_error(self):
        with mock.patch.object(lfg_alarm, "_post", return_value=answer(429, {"message": "Wait", "retryAfterSeconds": 42})):
            r = ring("https://api.lfg.gm/horn/abc")
        self.assertFalse(r.rang)
        self.assertEqual(r.retry_after_seconds, 42)

    def test_switched_off(self):
        with mock.patch.object(lfg_alarm, "_post", return_value=answer(409, {"message": "This alarm is switched off."})):
            r = ring("https://api.lfg.gm/horn/abc")
        self.assertFalse(r.rang)
        self.assertEqual(r.message, "This alarm is switched off.")

    def test_not_an_alarm_link_raises(self):
        with mock.patch.object(lfg_alarm, "_post", return_value=answer(404, {"message": "No such horn"})):
            with self.assertRaises(LfgAlarmError):
                ring("https://api.lfg.gm/horn/nope")


class ClientTests(unittest.TestCase):
    def test_call_sends_snake_case_and_the_key(self):
        sent = {}

        def fake(url, body, headers, timeout):
            sent.update(url=url, body=json.loads(body), headers=headers)
            return answer(200, {"jsonrpc": "2.0", "id": 1, "result": {"content": [{"type": "text", "text": "Set."}], "structuredContent": {"alarm": {"id": "a1"}}}})

        with mock.patch.object(lfg_alarm, "_post", side_effect=fake):
            r = LfgAlarm(api_key="lfg_pat_test").set_time_alarm("07:00", "America/New_York", repeat_days=["mon"])
        self.assertEqual(sent["url"], "https://mcp.lfg.gm")
        self.assertEqual(sent["headers"]["Authorization"], "Bearer lfg_pat_test")
        self.assertEqual(sent["body"]["params"], {"name": "set_time_alarm", "arguments": {"time": "07:00", "time_zone": "America/New_York", "repeat_days": ["mon"]}})
        self.assertEqual(r.text, "Set.")
        self.assertEqual(r.data, {"alarm": {"id": "a1"}})

    def test_refusal_raises_with_its_words(self):
        with mock.patch.object(lfg_alarm, "_post", return_value=answer(200, {"jsonrpc": "2.0", "id": 1, "result": {"isError": True, "content": [{"type": "text", "text": "Needs a paid plan."}]}})):
            with self.assertRaisesRegex(LfgAlarmError, "Needs a paid plan"):
                LfgAlarm(api_key="k").list_alarms()

    def test_event_stream_answer(self):
        stream = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"ok"}]}}\n\n'
        with mock.patch.object(lfg_alarm, "_post", return_value=answer(200, stream, {"Content-Type": "text/event-stream"})):
            self.assertEqual(LfgAlarm(api_key="k").list_alarms().text, "ok")

    def test_webhook_alarm_returns_the_ring_link(self):
        text = "Address to call (a POST request rings it): https://api.lfg.gm/horn/abc123\nMore"
        with mock.patch.object(lfg_alarm, "_post", return_value=answer(200, {"jsonrpc": "2.0", "id": 1, "result": {"content": [{"type": "text", "text": text}]}})):
            self.assertEqual(LfgAlarm(api_key="k").set_webhook_alarm("Deploy failed").ring_url, "https://api.lfg.gm/horn/abc123")

    def test_no_key_says_where_to_get_one(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            with self.assertRaisesRegex(LfgAlarmError, "AI apps and keys"):
                LfgAlarm().list_alarms()

    def test_refused_key(self):
        with mock.patch.object(lfg_alarm, "_post", return_value=answer(401, {"error": "unauthorized"})):
            with self.assertRaises(LfgAlarmError) as e:
                LfgAlarm(api_key="bad").list_alarms()
        self.assertEqual(e.exception.status, 401)


if __name__ == "__main__":
    unittest.main()
