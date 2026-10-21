/**
 * LFG Alarm for JavaScript and TypeScript: ring a real alarm on a phone from
 * code, and set alarms with a personal key.
 *
 * Two ways in:
 *  - `ring(url)` calls an Anything alarm's private link. No key needed: the
 *    link is the permission. Make the alarm in the LFG Alarm app, or with
 *    `setWebhookAlarm`.
 *  - `new LfgAlarm({ apiKey })` uses LFG Alarm's hosted MCP server
 *    (https://mcp.lfg.gm), the same tools Claude and ChatGPT use. Make a key
 *    in the LFG Alarm app: Settings > AI apps and keys.
 */

export const DEFAULT_BASE_URL = 'https://mcp.lfg.gm';

/** Something LFG Alarm said no to, or could not be reached for. */
export class LfgAlarmError extends Error {
  /** The HTTP status, when there was one. */
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'LfgAlarmError';
    this.status = status;
  }
}

export interface RingResult {
  /** True when the alarm rang. */
  rang: boolean;
  /** How many people's phones it rang on. */
  wokeUp?: number;
  /** When it did not ring because it rang moments ago: seconds until it can ring again. */
  retryAfterSeconds?: number;
  /** LFG Alarm's own words when it did not ring. */
  message?: string;
}

type Fetch = typeof fetch;

/**
 * Rings an Anything alarm by calling its private link
 * (`https://api.lfg.gm/horn/...`). Resolves `{ rang: false }` with the reason
 * when the alarm is cooling down or switched off; throws when the link is
 * not an alarm's.
 */
export async function ring(url: string, opts: { fetch?: Fetch; signal?: AbortSignal } = {}): Promise<RingResult> {
  const doFetch = opts.fetch ?? fetch;
  const res = await doFetch(url, { method: 'POST', signal: opts.signal });
  const body = (await res.json().catch(() => ({}))) as { wokeUp?: number; message?: string; retryAfterSeconds?: number };
  if (res.ok) return { rang: true, wokeUp: body.wokeUp };
  if (res.status === 429) {
    const after = body.retryAfterSeconds ?? Number(res.headers.get('retry-after') ?? 60);
    return { rang: false, retryAfterSeconds: after, message: body.message };
  }
  if (res.status === 409) return { rang: false, message: body.message ?? 'This alarm is switched off.' };
  throw new LfgAlarmError(body.message ?? `LFG Alarm answered ${res.status}`, res.status);
}

export interface ToolResult {
  /** The tool's answer, in plain words. */
  text: string;
  /** The tool's structured answer, when it gives one (for example the alarm). */
  data?: unknown;
}

export interface Tool {
  name: string;
  title?: string;
  description?: string;
}

export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type Reach = 'private' | 'friends' | 'public';

export interface TimeAlarm {
  /** 24-hour clock time, "07:00". */
  time: string;
  /** IANA time zone, "America/New_York". */
  timeZone: string;
  /** For a one-off: the date, "2026-11-01". */
  date?: string;
  /** For a repeating alarm: the days it rings. */
  repeatDays?: Day[];
  /** Short name, up to 60 characters. */
  title?: string;
  /** The feel in a few words ("something upbeat"): LFG picks a sound and a look to match. */
  vibe?: string;
  reach?: Reach;
  /** Friends to add, by username or email. */
  addPeople?: string[];
  note?: string;
  [extra: string]: unknown;
}

export interface WebhookAlarm {
  /** What it says when it rings, "Garage door is open". */
  title: string;
  /** Calls within this long after a ring are ignored. */
  quietFor?: '1_min' | '5_min' | '10_min' | '30_min' | '1_hour';
  reach?: Exclude<Reach, 'public'>;
  addPeople?: string[];
  [extra: string]: unknown;
}

/** "timeZone" → "time_zone": the tools take snake_case. */
function snake(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (v !== undefined) out[k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = v;
  }
  return out;
}

function readEnv(name: string): string | undefined {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.[name];
}

export class LfgAlarm {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly doFetch: Fetch;
  private nextId = 1;

  /** `apiKey` defaults to the LFG_API_KEY environment variable. */
  constructor(opts: { apiKey?: string; baseUrl?: string; fetch?: Fetch } = {}) {
    this.apiKey = opts.apiKey ?? readEnv('LFG_API_KEY');
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.doFetch = opts.fetch ?? fetch;
  }

  private async rpc(method: string, params: Record<string, unknown>): Promise<any> {
    if (!this.apiKey) {
      throw new LfgAlarmError('No API key. Make one in the LFG Alarm app (Settings > AI apps and keys) and pass it as apiKey, or set LFG_API_KEY.');
    }
    const res = await this.doFetch(this.baseUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: this.nextId++, method, params }),
    });
    if (res.status === 401) throw new LfgAlarmError('LFG Alarm did not accept that API key. Make a new one in Settings > AI apps and keys.', 401);
    if (!res.ok) throw new LfgAlarmError(`LFG Alarm answered ${res.status}`, res.status);
    const raw = await res.text();
    // Usually plain JSON; a server may answer as a one-message event stream.
    const json = (res.headers.get('content-type') ?? '').includes('text/event-stream')
      ? raw.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).pop()
      : raw;
    const msg = JSON.parse(json ?? '{}') as { result?: any; error?: { message?: string } };
    if (msg.error) throw new LfgAlarmError(msg.error.message ?? 'LFG Alarm could not do that.');
    return msg.result;
  }

  /** Calls any of LFG Alarm's tools by name ("set_price_alarm"), with its arguments in snake_case or camelCase. */
  async call(tool: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    const result = await this.rpc('tools/call', { name: tool, arguments: snake(args) });
    const text = ((result?.content ?? []) as { type: string; text?: string }[])
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
    if (result?.isError) throw new LfgAlarmError(text || 'LFG Alarm could not do that.');
    return { text, data: result?.structuredContent };
  }

  /** Every tool there is, with what it does. */
  async tools(): Promise<Tool[]> {
    const result = await this.rpc('tools/list', {});
    return ((result?.tools ?? []) as Tool[]).map(({ name, title, description }) => ({ name, title, description }));
  }

  /** A time alarm, once (`date`) or on repeat days (`repeatDays`). */
  setTimeAlarm(alarm: TimeAlarm): Promise<ToolResult> {
    return this.call('set_time_alarm', alarm);
  }

  /** An Anything alarm, and the private link that rings it (pass it to `ring`). */
  async setWebhookAlarm(alarm: WebhookAlarm): Promise<ToolResult & { ringUrl: string | null }> {
    const result = await this.call('set_webhook_alarm', alarm);
    return { ...result, ringUrl: result.text.match(/https:\/\/\S+\/horn\/[A-Za-z0-9]+/)?.[0] ?? null };
  }

  /** The person's alarms, in plain words. */
  listAlarms(): Promise<ToolResult> {
    return this.call('list_my_alarms');
  }

  deleteAlarm(id: string): Promise<ToolResult> {
    return this.call('delete_alarm', { id });
  }
}
