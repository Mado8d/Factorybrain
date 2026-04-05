"""AI service — Claude API integration for FactoryBrain.

Uses the Anthropic Python SDK with lazy client initialization.
All methods gracefully handle missing API keys by returning fallback responses.
"""

import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from core.config import settings

from .prompts import (
    ANOMALY_ANALYSIS_PROMPT,
    ANOMALY_ANALYSIS_TOOL,
    CHAT_SYSTEM_PROMPT,
    ROOT_CAUSE_PROMPT,
    ROOT_CAUSE_TOOL,
    SHIFT_SUMMARY_PROMPT,
    WO_DESCRIPTION_PROMPT,
    WO_DESCRIPTION_TOOL,
)

logger = logging.getLogger(__name__)

# Model selection
MODEL_HAIKU = "claude-haiku-4-5-20250514"
MODEL_SONNET = "claude-sonnet-4-6-20250514"

# Lazy singleton client
_client: Any = None
_client_checked = False

_FALLBACK = {"error": "AI features not configured", "available": False}


def _get_api_key() -> str | None:
    """Read ANTHROPIC_API_KEY from settings or environment."""
    key = getattr(settings, "anthropic_api_key", None)
    if key:
        return key
    # Fallback: check environment directly
    import os

    return os.environ.get("ANTHROPIC_API_KEY")


def _get_client():
    """Return the Anthropic async client, or None if API key is missing."""
    global _client, _client_checked
    if _client_checked:
        return _client
    _client_checked = True

    api_key = _get_api_key()
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY not set — AI features disabled")
        _client = None
        return None

    try:
        import anthropic

        _client = anthropic.AsyncAnthropic(api_key=api_key)
    except ImportError:
        logger.warning("anthropic package not installed — AI features disabled")
        _client = None
    return _client


def _is_available() -> bool:
    """Check if the AI service is available."""
    return _get_client() is not None


def _extract_tool_result(response) -> dict:
    """Extract tool_use input from a Claude response."""
    for block in response.content:
        if block.type == "tool_use":
            return block.input
    # Fallback: try to parse text as JSON
    for block in response.content:
        if block.type == "text":
            try:
                return json.loads(block.text)
            except json.JSONDecodeError:
                return {"raw_text": block.text}
    return {"raw_text": str(response.content)}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def check_status() -> dict:
    """Return AI availability status."""
    available = _is_available()
    return {
        "available": available,
        "models": {
            "fast": MODEL_HAIKU,
            "capable": MODEL_SONNET,
        }
        if available
        else {},
    }


async def generate_wo_description(
    machine: dict,
    alert: dict | None = None,
    recent_wos: list[dict] | None = None,
) -> dict:
    """Generate work order description + procedure steps from machine context.

    Uses Haiku for fast turnaround.
    """
    client = _get_client()
    if client is None:
        return _FALLBACK

    prompt = WO_DESCRIPTION_PROMPT.format(
        machine_context=json.dumps(machine, default=str),
        alert_context=json.dumps(alert, default=str) if alert else "No alert — manual work order.",
        recent_wos_context=json.dumps(recent_wos or [], default=str),
    )

    try:
        response = await client.messages.create(
            model=MODEL_HAIKU,
            max_tokens=1024,
            tools=[WO_DESCRIPTION_TOOL],
            tool_choice={"type": "tool", "name": "generate_wo_description"},
            messages=[{"role": "user", "content": prompt}],
        )
        return _extract_tool_result(response)
    except Exception as e:
        logger.error("AI generate_wo_description failed: %s", e)
        return {"error": str(e), "available": True}


async def analyze_anomaly(
    machine: dict,
    sensor_data_24h: list[dict],
    recent_wos: list[dict],
    thresholds: dict,
) -> dict:
    """Analyze sensor anomaly with machine history context.

    Uses Sonnet for deeper reasoning.
    """
    client = _get_client()
    if client is None:
        return _FALLBACK

    prompt = ANOMALY_ANALYSIS_PROMPT.format(
        machine_context=json.dumps(machine, default=str),
        sensor_data=json.dumps(sensor_data_24h, default=str),
        thresholds=json.dumps(thresholds, default=str),
        recent_wos_context=json.dumps(recent_wos, default=str),
    )

    try:
        response = await client.messages.create(
            model=MODEL_SONNET,
            max_tokens=1024,
            tools=[ANOMALY_ANALYSIS_TOOL],
            tool_choice={"type": "tool", "name": "analyze_anomaly"},
            messages=[{"role": "user", "content": prompt}],
        )
        return _extract_tool_result(response)
    except Exception as e:
        logger.error("AI analyze_anomaly failed: %s", e)
        return {"error": str(e), "available": True}


async def suggest_root_causes(
    machine: dict,
    failure_codes_used: list[dict],
    wo_history: list[dict],
) -> list[dict]:
    """Suggest root causes from failure history.

    Uses Haiku for fast turnaround.
    """
    client = _get_client()
    if client is None:
        return [_FALLBACK]

    prompt = ROOT_CAUSE_PROMPT.format(
        machine_context=json.dumps(machine, default=str),
        failure_codes=json.dumps(failure_codes_used, default=str),
        wo_history=json.dumps(wo_history, default=str),
    )

    try:
        response = await client.messages.create(
            model=MODEL_HAIKU,
            max_tokens=1024,
            tools=[ROOT_CAUSE_TOOL],
            tool_choice={"type": "tool", "name": "suggest_root_causes"},
            messages=[{"role": "user", "content": prompt}],
        )
        result = _extract_tool_result(response)
        return result.get("causes", [result])
    except Exception as e:
        logger.error("AI suggest_root_causes failed: %s", e)
        return [{"error": str(e), "available": True}]


async def generate_shift_summary(
    events_last_8h: list[dict],
    active_wos: list[dict],
    alerts: list[dict],
) -> str:
    """Summarize shift activity from work order events.

    Uses Haiku for fast turnaround.
    """
    client = _get_client()
    if client is None:
        return _FALLBACK["error"]

    prompt = SHIFT_SUMMARY_PROMPT.format(
        events=json.dumps(events_last_8h, default=str),
        active_wos=json.dumps(active_wos, default=str),
        alerts=json.dumps(alerts, default=str),
    )

    try:
        response = await client.messages.create(
            model=MODEL_HAIKU,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text
    except Exception as e:
        logger.error("AI generate_shift_summary failed: %s", e)
        return f"Error generating summary: {e}"


async def chat(
    messages: list[dict],
    context_chunks: list[dict],
    machine: dict | None = None,
) -> str:
    """Non-streaming RAG chat. Uses Sonnet for quality responses."""
    client = _get_client()
    if client is None:
        return _FALLBACK["error"]

    context_text = "\n\n---\n\n".join(
        f"[{c.get('source_name', 'unknown')}]\n{c.get('content', '')}" for c in context_chunks
    )

    system = CHAT_SYSTEM_PROMPT.format(
        context=context_text or "No relevant documents found.",
        machine_context=json.dumps(machine, default=str) if machine else "No specific machine selected.",
    )

    try:
        response = await client.messages.create(
            model=MODEL_SONNET,
            max_tokens=2048,
            system=system,
            messages=messages,
        )
        return response.content[0].text
    except Exception as e:
        logger.error("AI chat failed: %s", e)
        return f"Sorry, I encountered an error: {e}"


async def chat_stream(
    messages: list[dict],
    context_chunks: list[dict],
    machine: dict | None = None,
) -> AsyncGenerator[str, None]:
    """Streaming RAG chat via SSE. Uses Sonnet for quality responses."""
    client = _get_client()
    if client is None:
        yield _FALLBACK["error"]
        return

    context_text = "\n\n---\n\n".join(
        f"[{c.get('source_name', 'unknown')}]\n{c.get('content', '')}" for c in context_chunks
    )

    system = CHAT_SYSTEM_PROMPT.format(
        context=context_text or "No relevant documents found.",
        machine_context=json.dumps(machine, default=str) if machine else "No specific machine selected.",
    )

    try:
        async with client.messages.stream(
            model=MODEL_SONNET,
            max_tokens=2048,
            system=system,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text
    except Exception as e:
        logger.error("AI chat_stream failed: %s", e)
        yield f"Sorry, I encountered an error: {e}"
