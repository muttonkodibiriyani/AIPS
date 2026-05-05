from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any

# Normalized internal column names after header aliasing
_HEADER_ALIASES: dict[str, str] = {
    "id": "product_id",
    "product_id": "product_id",
    "sku": "sku",
    "sku (part number)": "sku",
    "name": "name_en",
    "name (ar)": "name_ar",
    "long description": "desc_en",
    "long description (ar)": "desc_ar",
    "composition": "composition",
    "image links": "image_links",
    "color": "color",
    "size": "size",
    "country of origin": "country_of_origin",
    "price.ae": "price_ae",
    "price.sa": "price_sa",
    "pricing.ae": "price_ae",
    "pricing.sa": "price_sa",
    "market": "market",
    "availability": "availability",
    "brand": "brand",
    "category": "category",
    "barcode": "barcode",
    "aims barcode all": "barcode_all",
}


def _norm_header(h: str) -> str:
    return re.sub(r"\s+", " ", h.strip().lower())


def alias_row(raw: dict[str, str | None]) -> dict[str, str]:
    out: dict[str, str] = {}
    for k, v in raw.items():
        if k is None:
            continue
        nk = _norm_header(str(k))
        internal = _HEADER_ALIASES.get(nk, nk.replace(" ", "_"))
        if v is None:
            continue
        s = str(v).strip()
        if s == "" or s.lower() == "nan":
            continue
        out[internal] = s
    return out


def _split_images(links: str) -> list[str]:
    parts = re.split(r"[|;,\n]+", links)
    return [p.strip() for p in parts if p.strip()][:24]


def _materials_from_composition(comp: str) -> list[str]:
    toks = re.split(r"[,/|]+", comp)
    return [t.strip() for t in toks if t.strip()][:16]


def _parse_price(s: str) -> float | None:
    s = re.sub(r"[^\d.\-]", "", s)
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def row_to_opensearch_doc(tenant_id: str, row: dict[str, str], default_market: str) -> dict[str, Any] | None:
    """Map a normalized row dict to OpenSearch _source. Returns None to skip row."""
    product_id = row.get("product_id") or row.get("id")
    sku = row.get("sku")
    if not product_id and not sku:
        return None
    pid = product_id or sku or str(uuid.uuid4())

    name_en = row.get("name_en", "")
    name_ar = row.get("name_ar", "")
    desc_en = row.get("desc_en", "")
    desc_ar = row.get("desc_ar", "")

    attrs: dict[str, Any] = {}
    if row.get("color"):
        attrs["color"] = row["color"].strip().title()
    if row.get("size"):
        attrs["size"] = row["size"]
    if row.get("country_of_origin"):
        attrs["country_of_origin"] = row["country_of_origin"]
    if row.get("composition"):
        attrs["materials"] = _materials_from_composition(row["composition"])
    if row.get("brand"):
        attrs["brand"] = row["brand"]
    if row.get("category"):
        attrs["category"] = row["category"]

    pricing: dict[str, float] = {}
    if row.get("price_ae") is not None:
        p = _parse_price(row["price_ae"])
        if p is not None:
            pricing["AE"] = p
    if row.get("price_sa") is not None:
        p = _parse_price(row["price_sa"])
        if p is not None:
            pricing["SA"] = p

    market = (row.get("market") or default_market or "AE").upper()
    if len(market) > 3:
        market = "AE"

    images = _split_images(row["image_links"]) if row.get("image_links") else []

    def _blob(lang: str, title: str, desc: str) -> str:
        bits = [title, desc, row.get("color", ""), row.get("composition", ""), row.get("brand", "")]
        return " ".join(b for b in bits if b).lower()

    search_en = _blob("en", name_en, desc_en)
    search_ar = _blob("ar", name_ar, desc_ar)

    availability = True
    if row.get("availability"):
        a = row["availability"].lower()
        availability = a not in ("0", "false", "no", "out", "inactive")

    doc: dict[str, Any] = {
        "tenant_id": tenant_id,
        "product_id": pid,
        "sku": sku or pid,
        "market": market,
        "title": {"en": name_en or name_ar or sku or pid, "ar": name_ar or name_en or sku or pid},
        "description": {"en": desc_en, "ar": desc_ar},
        "attrs": attrs,
        "pricing": pricing,
        "images": images,
        "search_text": {"en": search_en[:8000], "ar": search_ar[:8000]},
        "availability": availability,
        "popularity_score": 0.0,
        "created_at": datetime.utcnow().isoformat()[:10],
        "updated_at": datetime.utcnow().isoformat()[:10],
    }

    doc["_id"] = f"{tenant_id}:{pid}"
    return doc


def apply_custom_column_map(row: dict[str, str], column_map: dict[str, str]) -> dict[str, str]:
    """column_map maps raw CSV header → internal key (product_id, sku, …)."""
    mapped: dict[str, str] = {}
    for raw_h, val in row.items():
        nk = column_map.get(_norm_header(str(raw_h)))
        if nk:
            mapped[nk] = val
        else:
            ar = alias_row({str(raw_h): val})
            mapped.update(ar)
    return mapped
