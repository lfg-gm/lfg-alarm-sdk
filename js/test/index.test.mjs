import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LfgAlarm, LfgAlarmError, ring } from '../dist/index.js';

const reply = (status, body, headers = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

test('ring: rang', async () => {
  const r = await ring('https://api.lfg.gm/horn/abc', { fetch: async () => reply(200, { fired: true, wokeUp: 2, devices: 3 }) });
  assert.deepEqual(r, { rang: true, wokeUp: 2 });
});

test('ring: cooling down is not an error', async () => {
  const r = await ring('https://api.lfg.gm/horn/abc', { fetch: async () => reply(429, { error: 'cooling_down', message: 'Wait', retryAfterSeconds: 42 }) });
  assert.equal(r.rang, false);
  assert.equal(r.retryAfterSeconds, 42);
});

test('ring: switched off', async () => {
  const r = await ring('https://api.lfg.gm/horn/abc', { fetch: async () => reply(409, { error: 'alarm_off', message: 'This alarm is switched off.' }) });
  assert.deepEqual(r, { rang: false, message: 'This alarm is switched off.' });
});

test('ring: not an alarm link throws', async () => {
  await assert.rejects(ring('https://api.lfg.gm/horn/nope', { fetch: async () => reply(404, { message: 'No such horn' }) }), LfgAlarmError);
});

test('call sends a tools/call with snake_case arguments and the key', async () => {
  let sent;
  const lfg = new LfgAlarm({
    apiKey: 'lfg_pat_test',
    fetch: async (url, init) => {
      sent = { url, init, body: JSON.parse(init.body) };
      return reply(200, { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'Set.' }], structuredContent: { alarm: { id: 'a1' } } } });
    },
  });
  const r = await lfg.setTimeAlarm({ time: '07:00', timeZone: 'America/New_York', repeatDays: ['mon'] });
  assert.equal(sent.url, 'https://mcp.lfg.gm');
  assert.equal(sent.init.headers.authorization, 'Bearer lfg_pat_test');
  assert.equal(sent.body.method, 'tools/call');
  assert.deepEqual(sent.body.params, { name: 'set_time_alarm', arguments: { time: '07:00', time_zone: 'America/New_York', repeat_days: ['mon'] } });
  assert.deepEqual(r, { text: 'Set.', data: { alarm: { id: 'a1' } } });
});

test('a tool refusal throws with its words', async () => {
  const lfg = new LfgAlarm({ apiKey: 'k', fetch: async () => reply(200, { jsonrpc: '2.0', id: 1, result: { isError: true, content: [{ type: 'text', text: 'Needs a paid plan.' }] } }) });
  await assert.rejects(lfg.listAlarms(), /Needs a paid plan/);
});

test('an event-stream answer is read too', async () => {
  const lfg = new LfgAlarm({ apiKey: 'k', fetch: async () => reply(200, 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"ok"}]}}\n\n', { 'content-type': 'text/event-stream' }) });
  assert.equal((await lfg.listAlarms()).text, 'ok');
});

test('setWebhookAlarm returns the ring link', async () => {
  const lfg = new LfgAlarm({ apiKey: 'k', fetch: async () => reply(200, { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'Address to call (a POST request rings it): https://api.lfg.gm/horn/abc123\nMore' }] } }) });
  assert.equal((await lfg.setWebhookAlarm({ title: 'Deploy failed' })).ringUrl, 'https://api.lfg.gm/horn/abc123');
});

test('no key says where to get one', async () => {
  const lfg = new LfgAlarm({ apiKey: '', fetch: async () => reply(200, {}) });
  await assert.rejects(lfg.listAlarms(), /AI apps and keys/);
});

test('a refused key says so', async () => {
  const lfg = new LfgAlarm({ apiKey: 'bad', fetch: async () => reply(401, { error: 'unauthorized' }) });
  await assert.rejects(lfg.listAlarms(), (e) => e instanceof LfgAlarmError && e.status === 401);
});
