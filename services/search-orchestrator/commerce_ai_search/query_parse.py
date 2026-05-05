"""Lightweight deterministic query understanding (v1 — no LLM)."""
from __future__ import annotations

import re
from typing import Any


_COLOR_WORDS_EN = ("white", "black", "red", "blue", "green", "yellow", "grey", "gray", "beige", "brown")


def augment_filters(payload_query: str, existing: dict[str, Any], market: str | None) -> tuple[str, dict[str, Any]]:
    """Infer extra filters & strip obvious filter tokens from the lexical query string."""
    filters = dict(existing)
    q = payload_query.strip()
    ql = q.lower()

    mk = market or str(filters.get("market") or "AE")

    price_max: float | None = None

    price_pat = re.compile(
        rf"(?:under|below|less\s+than|max|maximum)\s+(?P<num>\d{{1,7}}(?:\.\d+)?)\s*(?P<cur>aed|sar|usd)?",
        re.IGNORECASE,
    )

    price_pat2 = re.compile(
        r"(?P<num>\d{1,7}(?:\.\d+)?)\s*(?P<cur>aed|sar|usd)(?:\s+or\s+under)?",
        re.IGNORECASE,
    )

    m = price_pat.search(ql) or price_pat2.search(ql)
    if m:
        try:
            price_max = float(m.group("num"))
        except ValueError:
            price_max = None

    currency = ""
    try:
        if m is not None and m.groupdict().get("cur"):
            currency = str(m.group("cur")).lower()
    except IndexError:
        currency = ""

    if price_max is not None:
        filters["priceMax"] = price_max
        filters["currency"] = currency or (mk.lower() if mk.lower() in ("ae", "sa", "us") else "")

    for c in _COLOR_WORDS_EN:
        if re.search(rf"\b{re.escape(c)}\b", ql):
            filters["color"] = c.title()
            break

    remove_bits: list[str] = []
    if m:
        remove_bits.append(m.group(0))
    if "color" in filters:
        remove_bits.append(str(filters["color"]).lower())
    remove_bits = [b for b in remove_bits if b]

    q2 = q
    for b in remove_bits:
        q2 = re.sub(re.escape(b), " ", q2, flags=re.IGNORECASE)
    q2 = re.sub(r"\s+", " ", q2).strip()

    return q2, filters
