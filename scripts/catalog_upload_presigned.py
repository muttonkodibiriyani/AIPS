#!/usr/bin/env python3
"""
gzip a UTF-8 CSV, presign PUT to MinIO through the Nest gateway, PUT the blob, enqueue catalog-ingestion, optional poll.

Pure stdlib — no pip install required.

Examples:
  set GATEWAY=https://your-api.example.com
  set API_KEY=pk_stub
  python scripts/catalog_upload_presigned.py --csv ./apps/showcase/data/catalog.csv --tenant demo-sl --poll

Configure MinIO CORS for browser uploads; CLI bypasses browser CORS.
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
import sys
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def getenv(name: str, default: str | None = None) -> str:
    return (os.environ.get(name) or default or "").strip()


def http_json(method: str, url: str, token: str, body: dict | None = None) -> tuple[int, dict]:
    payload = json.dumps(body).encode("utf-8") if body else None
    hdrs = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
    }
    if payload is not None:
        hdrs["Content-Type"] = "application/json"
    req = Request(url, method=method, headers=hdrs, data=payload)
    try:
        with urlopen(req, timeout=600) as r:
            raw = r.read().decode("utf-8") or "{}"
            return int(r.status), json.loads(raw)
    except HTTPError as e:
        raw = e.read().decode("utf-8") or "{}"
        try:
            return int(e.code), json.loads(raw)
        except json.JSONDecodeError:
            return int(e.code), {"detail": raw}
    except URLError as e:
        raise SystemExit(f"network_error:{e}") from e


def main() -> None:
    p = argparse.ArgumentParser(description="gzip CSV → presign PUT → import job (gateway + catalog-ingestion)")
    p.add_argument("--csv", required=True, type=Path, help="UTF-8 source .csv path")
    p.add_argument("--tenant", default=os.environ.get("TENANT_ID", "demo-sl"))
    p.add_argument("--gateway", default=getenv("GATEWAY", getenv("COMMERCE_GATEWAY_URL")))
    p.add_argument("--api-key", default=getenv("API_KEY", getenv("COMMERCE_API_KEY", "pk_demo")))
    p.add_argument("--poll", action="store_true", help="poll job until completed or failed")
    p.add_argument("--default-market", default="AE")
    args = p.parse_args()

    if not args.gateway:
        sys.exit("Set --gateway or env GATEWAY / COMMERCE_GATEWAY_URL")
    base = args.gateway.rstrip("/")
    csv_path = args.csv.expanduser().resolve()
    if not csv_path.is_file():
        sys.exit(f"CSV not found: {csv_path}")

    safe_base = "".join(c if c.isalnum() or c in "._-" else "_" for c in csv_path.stem)[:120]
    gz_name = f"{safe_base}_{uuid.uuid4().hex[:10]}.csv.gz"

    gz_bytes = gzip.compress(csv_path.read_bytes())

    status, presign = http_json(
        "POST",
        f"{base}/v1/admin/feeds/presign",
        args.api_key,
        {"tenantId": args.tenant, "filename": gz_name},
    )
    if status >= 400 or not presign.get("uploadUrl") or not presign.get("objectKey"):
        sys.exit(json.dumps({"step": "presign", "http": status, "body": presign}, indent=2))

    upload_url = str(presign["uploadUrl"])
    object_key = str(presign["objectKey"])
    put_req = Request(
        upload_url,
        method="PUT",
        data=gz_bytes,
        headers={"Content-Type": "application/gzip"},
    )
    try:
        with urlopen(put_req, timeout=7200):
            pass
    except HTTPError as e:
        sys.exit(json.dumps({"step": "minio_put", "http": e.code}, indent=2))

    status2, accepted = http_json(
        "POST",
        f"{base}/v1/admin/feeds/import",
        args.api_key,
        {
            "tenantId": args.tenant,
            "objectKey": object_key,
            "originalFilename": csv_path.name,
            "defaultMarket": args.default_market,
        },
    )
    if status2 >= 400 or not accepted.get("accepted") or not accepted.get("jobId"):
        sys.exit(json.dumps({"step": "import", "http": status2, "body": accepted}, indent=2))

    job_id = str(accepted["jobId"])
    print(json.dumps({"ok": True, "jobId": job_id, "objectKey": object_key}, indent=2))

    if args.poll:
        deadline = time.time() + 3600 * 6
        while time.time() < deadline:
            st, snap = http_json("GET", f"{base}/v1/admin/feeds/jobs/{job_id}", args.api_key, None)
            if st >= 400:
                print(json.dumps({"poll_error": snap}, indent=2))
                sys.exit(1)
            s = snap.get("status") or ""
            rp = snap.get("rowsProcessed", 0)
            ri = snap.get("rowsIndexed", 0)
            print(json.dumps({"status": s, "rowsProcessed": rp, "rowsIndexed": ri}, indent=2))
            if s in ("completed", "failed"):
                if s != "completed":
                    sys.exit(1)
                return
            time.sleep(3)


if __name__ == "__main__":
    main()
