# lfg-alarm

Ring a real alarm on a phone from code, and set alarms with [LFG Alarm](https://lfg.gm)'s tools.

LFG Alarm is a social alarm clock for iPhone and Android. Rocco, LFG's agent, rings a real alarm on your phone, and your friends' phones, at a time or when something happens. This package lets a script, a cron job, a bot or an AI agent do the same.

```bash
pip install lfg-alarm
```

Python 3.8 or later. Standard library only, no dependencies.

## Ring a phone when something happens

Make a 🔮 **Anything alarm** in the LFG Alarm app (or with `set_webhook_alarm` below). It comes with a private link; calling it rings every phone on the alarm. No key needed: the link is the permission, so keep it secret.

```python
import os
from lfg_alarm import ring

result = ring(os.environ["LFG_RING_URL"])
# RingResult(rang=True, woke_up=1, ...)
# or rang=False with retry_after_seconds if it rang moments ago,
# or rang=False with message="This alarm is switched off."
```

## Set alarms with a personal key

Make a key in the LFG Alarm app: **Settings** > **AI apps and keys**. Pass it as `api_key`, or set `LFG_API_KEY`.

```python
from lfg_alarm import LfgAlarm

lfg = LfgAlarm()  # reads LFG_API_KEY

lfg.set_time_alarm(
    "07:00",
    "America/New_York",
    repeat_days=["mon", "tue", "wed", "thu", "fri"],
    title="Standup",
    vibe="something upbeat",
)

hook = lfg.set_webhook_alarm("Deploy failed", quiet_for="5_min")
print(hook.ring_url)

print(lfg.list_alarms().text)
```

Every other tool works through `call`:

```python
lfg.call("set_price_alarm", token_id="solana", symbol="SOL", name="Solana", percent=10)
tools = lfg.tools()  # all of them, with what each does
```

A tool that says no (a plan limit, a bad time) raises `LfgAlarmError` with LFG Alarm's own words.

## What it talks to

- `ring` calls the alarm's private link (`https://api.lfg.gm/horn/...`).
- `LfgAlarm` calls LFG Alarm's hosted MCP server, `https://mcp.lfg.gm`: the same 33 tools Claude, ChatGPT and other AI apps use. AI apps can connect to it directly: [lfg.gm/agents](https://lfg.gm/agents).

Some alarm types and limits depend on the account's plan. For plans and pricing, go to [lfg.gm](https://lfg.gm).

[Developers](https://lfg.gm/developers) · [Support](https://lfg.gm/support) · [Privacy and terms](https://lfg.gm/legal) · MIT licence
