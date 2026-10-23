/**
 * LFG Alarm as tools for the Vercel AI SDK.
 *
 *  - `lfgAlarmTools()` hands a model LFG Alarm's tools, the same ones Claude
 *    and ChatGPT use, read from the hosted server so they are always current.
 *    Needs a personal key (LFG_API_KEY).
 *  - `ringPhone()` is one tool that rings an Anything alarm's private link
 *    (LFG_RING_URL), so an agent can get its person's attention. No key.
 */
import { jsonSchema, tool, type Tool as AiTool } from 'ai';
import { LfgAlarm, LfgAlarmError, ring } from './index';

type Fetch = typeof fetch;

function readEnv(name: string): string | undefined {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.[name];
}

/**
 * LFG Alarm's tools, ready for `generateText` or `streamText`. Pass `only`
 * with tool names ("set_time_alarm", "list_my_alarms") to give the model a
 * few instead of all of them.
 */
export async function lfgAlarmTools(
  opts: { apiKey?: string; baseUrl?: string; fetch?: Fetch; only?: string[] } = {},
): Promise<Record<string, AiTool>> {
  const client = new LfgAlarm(opts);
  const listed = await client.tools();
  const wanted = opts.only ? listed.filter((t) => opts.only!.includes(t.name)) : listed;
  const tools: Record<string, AiTool> = {};
  for (const t of wanted) {
    tools[t.name] = tool({
      description: t.description ?? t.title ?? t.name,
      inputSchema: jsonSchema<Record<string, unknown>>((t.inputSchema ?? { type: 'object', properties: {} }) as never),
      execute: async (args) => (await client.call(t.name, args)).text,
    });
  }
  return tools;
}

/**
 * One tool that rings the person's phone now, through an Anything alarm's
 * private link: for when something they asked to hear about is ready.
 * `url` defaults to the LFG_RING_URL environment variable.
 */
export function ringPhone(opts: { url?: string; fetch?: Fetch } = {}): AiTool {
  const url = opts.url ?? readEnv('LFG_RING_URL');
  return tool({
    description:
      "Rings the person's phone now with their LFG Alarm, so they hear it even away from the screen. Use it when something they asked to be told about is ready or needs them. It rings the alarm the person set up; nothing written here is shown.",
    inputSchema: jsonSchema<Record<string, never>>({ type: 'object', properties: {}, additionalProperties: false }),
    execute: async () => {
      if (!url) throw new LfgAlarmError("No ring link. Copy an Anything alarm's link from the LFG Alarm app and pass it as url, or set LFG_RING_URL.");
      const r = await ring(url, { fetch: opts.fetch });
      return r.rang ? `Rang. It reached ${r.wokeUp ?? 1} ${r.wokeUp === 1 ? 'person' : 'people'}.` : `Did not ring: ${r.message ?? 'it rang moments ago'}.`;
    },
  });
}
