#!/usr/bin/env python3
"""Build a site package (*.inspection.json) in one step.

Inputs are NOT part of the repository: pass them on the command line.

    python3 tools/build_package.py REPORT.xlsx \
        --mask-file private/denylist.txt \
        --layout private/layout.json \
        --plan-image private/plan.png \
        --name "Ma maison" \
        --out private/ma-maison.inspection.json

The spreadsheet is read and scrubbed in memory; no intermediate file is written.
--layout is optional: a JSON with {"floorPlans": {"levels": [...]}, "sitePlanHotspots": [...]}.
"""

import argparse
import base64
import json
import struct
import sys
from pathlib import Path

from export_inspection_json import export_report

SCHEMA = 1
MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}


def png_size(data: bytes):
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", data[16:24])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("report", type=Path, help="Path to the .xlsx report")
    ap.add_argument("--mask-file", type=Path, help="Text file, one regular expression per line, to mask")
    ap.add_argument("--expected-items", type=int, help="Fail if the item count differs")
    ap.add_argument("--layout", type=Path)
    ap.add_argument("--plan-image", type=Path)
    ap.add_argument("--name", required=True)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args()

    data = export_report(a.report, a.name, a.mask_file, a.expected_items)
    layout = json.loads(a.layout.read_text(encoding="utf-8")) if a.layout else {}

    site_plan = {"imageDataUrl": None, "width": 800, "height": 600,
                 "hotspots": layout.get("sitePlanHotspots", [])}
    if a.plan_image:
        raw = a.plan_image.read_bytes()
        mime = MIME.get(a.plan_image.suffix.lower())
        if not mime:
            sys.exit(f"Unsupported image type: {a.plan_image.suffix}")
        site_plan["imageDataUrl"] = f"data:{mime};base64,{base64.b64encode(raw).decode()}"
        size = png_size(raw) if mime == "image/png" else None
        if size:
            site_plan["width"], site_plan["height"] = size
        else:
            print("Warning: could not read image size; set sitePlan.width/height by hand.", file=sys.stderr)

    pkg = {
        "schema": SCHEMA,
        "site": {"name": a.name},
        "items": data["items"],
        "adminItems": data.get("adminItems", []),
        "legend": data.get("legend", {"entries": []}),
        "levels": layout.get("floorPlans", {}).get("levels", []),
        "sitePlan": site_plan,
        "userState": {"userProgress": {}, "deletedItemIds": []},
    }
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(pkg, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Written {a.out} ({a.out.stat().st_size} bytes): {len(pkg['items'])} items")


if __name__ == "__main__":
    main()
