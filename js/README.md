# lfg-alarm

Ring a real alarm on a phone from code, and set alarms with [LFG Alarm](https://lfg.gm)'s tools.

LFG Alarm is a social alarm clock for iPhone and Android. Rocco, LFG's agent, rings a real alarm on your phone, and your friends' phones, at a time or when something happens. This package lets a script, a CI job, a bot or an AI agent do the same.

```bash
npm install lfg-alarm
```

Node 18 or later, or any runtime with `fetch`. No dependencies; `lfg-alarm/ai` needs the `ai` package you already have.

## Ring a phone when something happens

Make a 🔮 **Anything alarm** in the LFG Alarm app (or with `setWebhookAlarm` below). It comes with a private link; calling it rings every phone on the alarm. No key needed: the link is the permission, so keep it secret.

```js
import { ring } from 'lfg-alarm';

const result = await ring(process.env.LFG_RING_URL);
// { rang: true, wokeUp: 1 }
// or { rang: false, retryAfterSeconds: 240 } if it rang moments ago
// or { rang: false, message: 'This alarm is switched off.' }
```

## Set alarms with a personal key

Make a key in the LFG Alarm app: **Settings** > **AI apps and keys**. Pass it as `apiKey`, or set `LFG_API_KEY`.

```js
import { LfgAlarm } from 'lfg-alarm';

const lfg = new LfgAlarm({ apiKey: process.env.LFG_API_KEY });

await lfg.setTimeAlarm({
  time: '07:00',
  timeZone: 'America/New_York',
  repeatDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  title: 'Standup',
  vibe: 'something upbeat',
});

const { ringUrl } = await lfg.setWebhookAlarm({ title: 'Deploy failed', quietFor: '5_min' });

console.log((await lfg.listAlarms()).text);
```

Every other tool works through `call`, with its arguments in camelCase or snake_case:

```js
await lfg.call('set_price_alarm', { tokenId: 'solana', symbol: 'SOL', name: 'Solana', percent: 10 });
const tools = await lfg.tools(); // all of them, with what each does
```

A tool that says no (a plan limit, a bad time) throws an `LfgAlarmError` with LFG Alarm's own words.

## Use it in the Vercel AI SDK

`lfg-alarm/ai` gives an AI SDK agent LFG Alarm's tools, read from the hosted server so they are always the current ones, and a `ringPhone` tool that rings an Anything alarm. Install `ai` alongside (version 5 or later).

```js
import { generateText, isStepCount } from 'ai';
import { lfgAlarmTools } from 'lfg-alarm/ai';

const { text } = await generateText({
  model: 'openai/gpt-5-mini',
  prompt: 'Wake me at 7 on weekdays with something upbeat. I am in London.',
  tools: await lfgAlarmTools(), // LFG_API_KEY, or { apiKey }
  stopWhen: isStepCount(3),
});
```

Pass `only` to give the model a few tools: `lfgAlarmTools({ only: ['set_time_alarm', 'list_my_alarms', 'delete_alarm'] })`.

For an agent that should get your attention when a long job is done, `ringPhone()` rings the Anything alarm at `LFG_RING_URL` (no key needed):

```js
import { ringPhone } from 'lfg-alarm/ai';

await generateText({
  model: 'openai/gpt-5-mini',
  prompt: 'Run the report, and ring my phone when it is ready.',
  tools: { ringPhone: ringPhone(), ...yourTools },
  stopWhen: isStepCount(10),
});
```

## What it talks to

- `ring` calls the alarm's private link (`https://api.lfg.gm/horn/...`).
- `LfgAlarm` calls LFG Alarm's hosted MCP server, `https://mcp.lfg.gm`: the same 33 tools Claude, ChatGPT and other AI apps use. AI apps can connect to it directly: [lfg.gm/agents](https://lfg.gm/agents).

Some alarm types and limits depend on the account's plan. For plans and pricing, go to [lfg.gm](https://lfg.gm).

[Developers](https://lfg.gm/developers) · [Support](https://lfg.gm/support) · [Privacy and terms](https://lfg.gm/legal) · MIT licence
