<p align="center"><img src="https://raw.githubusercontent.com/lfg-gm/lfg-alarm-mcp/main/logo.png" width="96" alt="LFG Alarm"></p>

# LFG Alarm SDK

Ring a real alarm on a phone from code, and set alarms with [LFG Alarm](https://lfg.gm)'s tools. For JavaScript/TypeScript and Python.

| | Install | Docs |
|---|---|---|
| JavaScript / TypeScript | `npm install lfg-alarm` | [js/README.md](js/README.md) |
| Python | `pip install lfg-alarm` | [python/README.md](python/README.md) |

Both are small, have no dependencies, and do the same two things:

- **`ring(url)`**: call a 🔮 **Anything alarm**'s private link and every phone on it rings. No key needed.
- **`LfgAlarm`**: with a personal key (LFG Alarm app: **Settings** > **AI apps and keys**), set, change and delete alarms through LFG Alarm's hosted MCP server, `https://mcp.lfg.gm`.

```js
import { ring } from 'lfg-alarm';
await ring(process.env.LFG_RING_URL); // the build failed: wake the on-call phone
```

```python
from lfg_alarm import LfgAlarm
LfgAlarm().set_time_alarm("07:00", "Europe/London", repeat_days=["mon", "fri"], title="Gym")
```

AI apps (Claude, ChatGPT, Cursor, VS Code, Gemini CLI and others) can use LFG Alarm without code: [lfg-gm/lfg-alarm-mcp](https://github.com/lfg-gm/lfg-alarm-mcp).

## Develop

```bash
cd js && npm install && npm run build && npm test
cd python && python -m unittest discover -s tests
```

MIT licence. Help: [lfg.gm/support](https://lfg.gm/support) or support@lfg.gm.
