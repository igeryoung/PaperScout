"""Render the full LLM evaluation payload as rich HTML for the review panel.

The evaluation shape matches ``src/server/schema/evaluation.ts``: localized fields
are ``{"en": ..., "zh-TW": ...}`` objects (strings or string lists). Everything the
agent produced is shown here — scores, decision, tags, summary, recommendation
reason, strengths, weaknesses, the six-section digest, and the figure caption.

Rendered into a ``QTextBrowser``, so only the Qt rich-text HTML subset is used
(tables with percentage widths, ``bgcolor``, basic inline styles).
"""

from __future__ import annotations

from html import escape
from typing import Any, Optional

# Locale keys, in switcher order. Must match the schema's SUPPORTED_LOCALES.
LOCALES = ("en", "zh-TW")

# Per-dimension maximums (see ScoresSchema).
_SCORE_DIMS = (
    ("novelty", 25),
    ("methodologicalRigor", 30),
    ("experimentalQuality", 30),
    ("venueSourceCredibility", 15),
)

# Decision / status badge colours.
_DECISION_COLOR = {
    "RECOMMEND": "#1f9d55",
    "STORE_ONLY": "#d68a1d",
    "LOW_QUALITY": "#d64545",
}
_STATUS_COLOR = {
    "SUCCESS": "#1f9d55",
    "FAILED": "#d64545",
    "UNAVAILABLE": "#888888",
}

# UI label translations, keyed by locale.
_TXT: dict[str, dict[str, str]] = {
    "en": {
        "no_eval": "No evaluation yet. Export → run the eval agent → import results.",
        "stage": "Stage",
        "scores": "Scores",
        "total": "Total",
        "tags": "Tags",
        "summary": "Summary",
        "reason": "Recommendation reason",
        "strengths": "Strengths",
        "weaknesses": "Weaknesses",
        "digest": "Digest",
        "pdf_status": "PDF analysis",
        "figure": "Figure caption",
        "novelty": "Novelty",
        "methodologicalRigor": "Methodological rigor",
        "experimentalQuality": "Experimental quality",
        "venueSourceCredibility": "Venue / source credibility",
        "tldr": "TL;DR",
        "problemMotivation": "Problem & motivation",
        "keyContributions": "Key contributions",
        "methodOverview": "Method overview",
        "resultsInterpretation": "Results interpretation",
        "aiCommentary": "AI commentary",
    },
    "zh-TW": {
        "no_eval": "尚未評估。匯出 → 執行評估 agent → 匯入結果。",
        "stage": "評估階段",
        "scores": "評分",
        "total": "總分",
        "tags": "標籤",
        "summary": "摘要",
        "reason": "推薦理由",
        "strengths": "優點",
        "weaknesses": "缺點",
        "digest": "深度解析",
        "pdf_status": "PDF 分析",
        "figure": "圖說",
        "novelty": "新穎性",
        "methodologicalRigor": "方法嚴謹度",
        "experimentalQuality": "實驗品質",
        "venueSourceCredibility": "發表來源可信度",
        "tldr": "一句話總結",
        "problemMotivation": "問題與動機",
        "keyContributions": "主要貢獻",
        "methodOverview": "方法概述",
        "resultsInterpretation": "結果詮釋",
        "aiCommentary": "AI 評論",
    },
}

_DIGEST_ORDER = (
    "tldr",
    "problemMotivation",
    "keyContributions",
    "methodOverview",
    "resultsInterpretation",
    "aiCommentary",
)


def _loc(value: Any, locale: str) -> str:
    """Pull a localized string, falling back to English then empty."""
    if isinstance(value, dict):
        return str(value.get(locale) or value.get("en") or "")
    return "" if value is None else str(value)


def _loc_list(value: Any, locale: str) -> list[str]:
    if isinstance(value, dict):
        items = value.get(locale) or value.get("en") or []
    else:
        items = value or []
    return [str(x) for x in items if x]


def _para(text: str) -> str:
    """Escape + preserve newlines as line breaks."""
    return escape(text).replace("\n", "<br>")


def _badge(text: str, color: str) -> str:
    return (
        f'<span style="background-color:{color}; color:#ffffff; '
        f'padding:1px 6px; border-radius:3px; font-weight:600;">{escape(text)}</span>'
    )


def _section(title: str, body_html: str) -> str:
    if not body_html:
        return ""
    return (
        f'<p style="margin-top:14px; margin-bottom:3px; color:#1d6fd6; '
        f'font-weight:700; font-size:12px;">{escape(title)}</p>{body_html}'
    )


def _score_table(scores: dict[str, Any], t: dict[str, str]) -> str:
    rows = []
    for key, maximum in _SCORE_DIMS:
        raw = scores.get(key)
        val = raw if isinstance(raw, (int, float)) else 0
        pct = max(0, min(100, round(val / maximum * 100))) if maximum else 0
        bar = (
            '<table width="100%" cellspacing="0" cellpadding="0" '
            'style="background-color:#e9e9e9;"><tr>'
            f'<td width="{pct}%" bgcolor="#1d6fd6" style="font-size:3px;">&nbsp;</td>'
            f'<td style="font-size:3px;">&nbsp;</td></tr></table>'
        )
        rows.append(
            "<tr>"
            f'<td width="42%" style="padding:2px 6px 2px 0;">{escape(t[key])}</td>'
            f'<td width="14%" align="right" style="padding:2px 8px 2px 0; color:#555;">'
            f"{'—' if raw is None else raw} / {maximum}</td>"
            f'<td width="44%" style="padding:2px 0;">{bar}</td>'
            "</tr>"
        )
    total = scores.get("total")
    rows.append(
        '<tr><td style="padding-top:4px; font-weight:700;">'
        f"{escape(t['total'])}</td>"
        '<td align="right" style="padding-top:4px; font-weight:700;">'
        f"{'—' if total is None else total} / 100</td><td></td></tr>"
    )
    return (
        '<table width="100%" cellspacing="0" cellpadding="0">'
        + "".join(rows)
        + "</table>"
    )


def eval_html(ev: Optional[dict[str, Any]], locale: str) -> str:
    """Build the full evaluation view. ``ev`` is the stored evaluation JSON."""
    if locale not in _TXT:
        locale = "en"
    t = _TXT[locale]
    if not ev:
        return (
            f'<div style="color:#888; padding:8px;">{escape(t["no_eval"])}</div>'
        )

    parts: list[str] = []

    # Header: decision + stage + pdf status badges.
    badges = []
    decision = ev.get("recommendationDecision")
    if decision:
        badges.append(_badge(decision, _DECISION_COLOR.get(decision, "#555555")))
    stage = ev.get("evaluationStage")
    if stage:
        badges.append(
            f'<span style="color:#555;">{escape(t["stage"])}: '
            f"{escape(str(stage))}</span>"
        )
    pdf_status = ev.get("pdfAnalysisStatus")
    if pdf_status:
        badges.append(
            f'{escape(t["pdf_status"])}: '
            + _badge(str(pdf_status), _STATUS_COLOR.get(pdf_status, "#888888"))
        )
    if badges:
        parts.append(
            '<p style="margin:0 0 4px 0;">' + " &nbsp; ".join(badges) + "</p>"
        )

    # Scores.
    scores = ev.get("scores") or {}
    if scores:
        parts.append(_section(t["scores"], _score_table(scores, t)))

    # Tags.
    tags = ev.get("tags") or []
    if tags:
        chips = " ".join(
            f'<span style="background-color:#eef2f7; color:#33475b; '
            f'padding:1px 6px; border-radius:8px;">{escape(str(tag))}</span>'
            for tag in tags
        )
        parts.append(_section(t["tags"], f'<p style="margin:2px 0;">{chips}</p>'))

    # Summary + recommendation reason.
    summary = _loc(ev.get("summary"), locale)
    if summary:
        parts.append(_section(t["summary"], f"<p>{_para(summary)}</p>"))
    reason = _loc(ev.get("recommendationReason"), locale)
    if reason:
        parts.append(_section(t["reason"], f"<p>{_para(reason)}</p>"))

    # Strengths / weaknesses.
    for key, label in (("strengths", t["strengths"]), ("weaknesses", t["weaknesses"])):
        items = _loc_list(ev.get(key), locale)
        if items:
            lis = "".join(f"<li>{_para(it)}</li>" for it in items)
            parts.append(_section(label, f'<ul style="margin:2px 0;">{lis}</ul>'))

    # Digest (six sections).
    digest = ev.get("digest")
    if isinstance(digest, dict):
        digest_body = []
        for key in _DIGEST_ORDER:
            text = _loc(digest.get(key), locale)
            if text:
                digest_body.append(
                    f'<p style="margin:8px 0 2px 0; font-weight:600; color:#444;">'
                    f"{escape(t[key])}</p><p style=\"margin:0;\">{_para(text)}</p>"
                )
        if digest_body:
            parts.append(_section(t["digest"], "".join(digest_body)))

    # Figure caption.
    figure = ev.get("figure")
    if isinstance(figure, dict):
        caption = _loc(figure.get("caption"), locale)
        label = figure.get("label") or ""
        page = figure.get("pageNumber")
        if caption or label:
            head = escape(str(label))
            if page:
                head += f" (p.{escape(str(page))})"
            parts.append(
                _section(
                    t["figure"],
                    f'<p><b>{head}</b><br>{_para(caption)}</p>' if caption
                    else f"<p><b>{head}</b></p>",
                )
            )

    body = "".join(parts)
    return (
        '<div style="font-size:13px; line-height:1.5; color:#222;">'
        + body
        + "</div>"
    )
