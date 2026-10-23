"""LFG Alarm for Python: ring a real alarm on a phone from code, and set alarms
with a personal key.

Two ways in:

- ``ring(url)`` calls an Anything alarm's private link. No key needed: the link
  is the permission. Make the alarm in the LFG Alarm app, or with
  ``LfgAlarm.set_webhook_alarm``.
- ``LfgAlarm(api_key=...)`` uses LFG Alarm's hosted MCP server
  (https://mcp.lfg.gm), the same tools Claude and ChatGPT use. Make a key in the
  LFG Alarm app: Settings > AI apps and keys.

Standard library only.
"""

from __future__ import annotations

import itertools
import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

__all__ = ["DEFAULT_BASE_URL", "LfgAlarm", "LfgAlarmError", "RingResult", "ToolResult", "ring"]
__version__ = "0.2.0"

DEFAULT_BASE_URL = "https://mcp.lfg.gm"
_USER_AGENT = f"lfg-alarm-python/{__version__}"


class LfgAlarmError(Exception):
    """Something LFG Alarm said no to, or could not be reached for."""

    def __init__(self, message: str, status: Optional[int] = None) -> None:
        super().__init__(message)
        self.status = status


@dataclass
class RingResult:
    rang: bool
    """True when the alarm rang."""
    woke_up: Optional[int] = None
    """How many people's phones it rang on."""
    retry_after_seconds: Optional[int] = None
    """When it rang moments ago: seconds until it can ring again."""
    message: Optional[str] = None
    """LFG Alarm's own words when it did not ring."""


@dataclass
class ToolResult:
    text: str
    """The tool's answer, in plain words."""
    data: Any = None
    """The tool's structured answer, when it gives one (for example the alarm)."""
    ring_url: Optional[str] = None
    """For a webhook alarm: the private link that rings it (pass it to ``ring``)."""


def _post(url: str, body: bytes, headers: Dict[str, str], timeout: float):
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("User-Agent", _USER_AGENT)
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, dict(res.headers), res.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read().decode("utf-8", "replace")


def ring(url: str, timeout: float = 15) -> RingResult:
    """Rings an Anything alarm by calling its private link (https://api.lfg.gm/horn/...).

    Returns ``RingResult(rang=False, ...)`` with the reason when the alarm is
    cooling down or switched off; raises ``LfgAlarmError`` when the link is not
    an alarm's.
    """
    # An empty JSON body: the link never reads it, and urllib would otherwise label it a form, which the server refuses.
    status, headers, raw = _post(url, b"{}", {"Content-Type": "application/json"}, timeout)
    try:
        body = json.loads(raw) if raw else {}
    except ValueError:
        body = {}
    if 200 <= status < 300:
        return RingResult(rang=True, woke_up=body.get("wokeUp"))
    if status == 429:
        after = body.get("retryAfterSeconds") or int({k.lower(): v for k, v in headers.items()}.get("retry-after", 60))
        return RingResult(rang=False, retry_after_seconds=after, message=body.get("message"))
    if status == 409:
        return RingResult(rang=False, message=body.get("message") or "This alarm is switched off.")
    raise LfgAlarmError(body.get("message") or f"LFG Alarm answered {status}", status)


def _snake(args: Dict[str, Any]) -> Dict[str, Any]:
    """timeZone -> time_zone; snake_case passes through. None values are left out."""
    return {re.sub(r"[A-Z]", lambda m: "_" + m.group(0).lower(), k): v for k, v in args.items() if v is not None}


class LfgAlarm:
    """A client for LFG Alarm's tools. ``api_key`` defaults to the LFG_API_KEY environment variable."""

    def __init__(self, api_key: Optional[str] = None, base_url: str = DEFAULT_BASE_URL, timeout: float = 30) -> None:
        self.api_key = api_key if api_key is not None else os.environ.get("LFG_API_KEY")
        self.base_url = base_url
        self.timeout = timeout
        self._ids = itertools.count(1)

    def _rpc(self, method: str, params: Dict[str, Any]) -> Any:
        if not self.api_key:
            raise LfgAlarmError(
                "No API key. Make one in the LFG Alarm app (Settings > AI apps and keys) "
                "and pass it as api_key, or set LFG_API_KEY."
            )
        payload = json.dumps({"jsonrpc": "2.0", "id": next(self._ids), "method": method, "params": params}).encode()
        status, headers, raw = _post(
            self.base_url,
            payload,
            {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
            },
            self.timeout,
        )
        if status == 401:
            raise LfgAlarmError("LFG Alarm did not accept that API key. Make a new one in Settings > AI apps and keys.", 401)
        if not 200 <= status < 300:
            raise LfgAlarmError(f"LFG Alarm answered {status}", status)
        content_type = {k.lower(): v for k, v in headers.items()}.get("content-type", "")
        if "text/event-stream" in content_type:
            # A server may answer as a one-message event stream.
            lines = [line[5:].strip() for line in raw.splitlines() if line.startswith("data:")]
            raw = lines[-1] if lines else "{}"
        msg = json.loads(raw or "{}")
        if msg.get("error"):
            raise LfgAlarmError(msg["error"].get("message") or "LFG Alarm could not do that.")
        return msg.get("result")

    def call(self, tool: str, **args: Any) -> ToolResult:
        """Calls any of LFG Alarm's tools by name ("set_price_alarm"), with its arguments."""
        result = self._rpc("tools/call", {"name": tool, "arguments": _snake(args)}) or {}
        text = "\n".join(c.get("text", "") for c in result.get("content", []) if c.get("type") == "text")
        if result.get("isError"):
            raise LfgAlarmError(text or "LFG Alarm could not do that.")
        return ToolResult(text=text, data=result.get("structuredContent"))

    def tools(self) -> List[Dict[str, Any]]:
        """Every tool there is, with what it does and what it takes (``input_schema``, JSON Schema)."""
        result = self._rpc("tools/list", {}) or {}
        return [
            {"name": t.get("name"), "title": t.get("title"), "description": t.get("description"), "input_schema": t.get("inputSchema")}
            for t in result.get("tools", [])
        ]

    def set_time_alarm(
        self,
        time: str,
        time_zone: str,
        date: Optional[str] = None,
        repeat_days: Optional[List[str]] = None,
        title: Optional[str] = None,
        vibe: Optional[str] = None,
        **more: Any,
    ) -> ToolResult:
        """A time alarm: "07:00" in an IANA time zone, once (date) or on repeat days (["mon", "fri"])."""
        return self.call(
            "set_time_alarm", time=time, time_zone=time_zone, date=date, repeat_days=repeat_days, title=title, vibe=vibe, **more
        )

    def set_webhook_alarm(self, title: str, quiet_for: Optional[str] = None, **more: Any) -> ToolResult:
        """An Anything alarm, with the private link that rings it as ``ring_url``."""
        result = self.call("set_webhook_alarm", title=title, quiet_for=quiet_for, **more)
        match = re.search(r"https://\S+/horn/[A-Za-z0-9]+", result.text)
        result.ring_url = match.group(0) if match else None
        return result

    def list_alarms(self) -> ToolResult:
        return self.call("list_my_alarms")

    def delete_alarm(self, id: str) -> ToolResult:
        return self.call("delete_alarm", id=id)
