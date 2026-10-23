import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lfgAlarmTools, ringPhone } from '../dist/ai.js';

const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('lfgAlarmTools: the server tools as AI SDK tools, and execute calls the tool', async () => {
  const calls = [];
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.method === 'tools/list') {
      return reply(200, { jsonrpc: '2.0', id: body.id, result: { tools: [
        { name: 'set_time_alarm', description: 'Sets an alarm.', inputSchema: { type: 'object', properties: { time: { type: 'string' } }, required: ['time'] } },
        { name: 'list_my_alarms', description: 'Lists alarms.', inputSchema: { type: 'object', properties: {} } },
      ] } });
    }
    return reply(200, { jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'Set for 07:00.' }] } });
  };
  const tools = await lfgAlarmTools({ apiKey: 'lfg_pat_test', fetch, only: ['set_time_alarm'] });
  assert.deepEqual(Object.keys(tools), ['set_time_alarm']);
  assert.equal(tools.set_time_alarm.description, 'Sets an alarm.');
  const out = await tools.set_time_alarm.execute({ time: '07:00' }, { toolCallId: 't1', messages: [] });
  assert.equal(out, 'Set for 07:00.');
  assert.equal(calls.at(-1).params.name, 'set_time_alarm');
});

test('ringPhone: rings the link and says so', async () => {
  const t = ringPhone({ url: 'https://api.lfg.gm/horn/abc', fetch: async () => reply(200, { fired: true, wokeUp: 1 }) });
  assert.equal(await t.execute({}, { toolCallId: 't1', messages: [] }), 'Rang. It reached 1 person.');
});

test('ringPhone: cooling down is told to the model, not thrown', async () => {
  const t = ringPhone({ url: 'https://api.lfg.gm/horn/abc', fetch: async () => reply(429, { message: 'It can go again in 40s.', retryAfterSeconds: 40 }) });
  assert.match(await t.execute({}, { toolCallId: 't1', messages: [] }), /^Did not ring/);
});
