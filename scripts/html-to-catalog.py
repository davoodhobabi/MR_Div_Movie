#!/usr/bin/env python3
"""Convert a one-page archive HTML into a metadata JSON catalog.

Extracts title, IMDb fields, quality label, size, SoftSub/Dubbed/NoSub,
and download hrefs into each source's url field.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ENTRY_RE = re.compile(
    r"<h3>(\d+)\.\s*(.*?)</h3>\s*"
    r"<p><b>IMDb Code:</b>\s*([^<]+)</p>\s*"
    r"<p><b>Title Type:</b>\s*([^<]+)</p>\s*"
    r"<p><b>IMDb Votes:</b>\s*([^<]+)</p>\s*"
    r"<p><b>IMDb Rates:</b>\s*([^<]+)</p>"
    r"(.*?)(?=<h3>|\Z)",
    re.IGNORECASE | re.DOTALL,
)

P_RE = re.compile(r"<p\b[^>]*>(.*?)</p>", re.IGNORECASE | re.DOTALL)
EDITION_RE = re.compile(r"<b>\s*(SoftSub|Dubbed|NoSub)\s*</b>", re.IGNORECASE)
SEASON_RE = re.compile(r"^\s*season\s+(\d+)\s*$", re.IGNORECASE)
ANCHOR_RE = re.compile(
    r"<a\b([^>]*)>([^<]+)</a>\s*(?:/\s*([^<]*?))?(?=<a|</p>|$)",
    re.IGNORECASE | re.DOTALL,
)
HREF_RE = re.compile(r'\s+href\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)', re.IGNORECASE)

HTML_UNESCAPE = (
    ("&amp;", "&"),
    ("&lt;", "<"),
    ("&gt;", ">"),
    ("&quot;", '"'),
    ("&#39;", "'"),
    ("&nbsp;", " "),
)


def decode_html(text: str) -> str:
    out = text
    for src, dst in HTML_UNESCAPE:
        out = out.replace(src, dst)
    return out.strip()


def clean_title(raw: str) -> str:
    title = decode_html(raw)
    title = re.sub(r"\s+", " ", title).strip()
    title = re.sub(r"\s+start_year$", "", title, flags=re.IGNORECASE)
    return title


def parse_votes(raw: str) -> int | None:
    try:
        return int(raw.replace(",", "").strip())
    except ValueError:
        return None


def parse_rating(raw: str) -> float | None:
    try:
        return float(raw.strip())
    except ValueError:
        return None


def clean_size(raw: str | None) -> str:
    if not raw:
        return ""
    size = decode_html(raw)
    size = re.sub(r"\s+", " ", size).strip(" /")
    return size


def extract_href(attrs: str) -> str:
    match = HREF_RE.search(attrs)
    if not match:
        return ""
    raw = match.group(1).strip()
    if len(raw) >= 2 and raw[0] in "\"'" and raw[0] == raw[-1]:
        raw = raw[1:-1]
    return decode_html(raw)


def parse_sources(body: str) -> list[dict]:
    sources: list[dict] = []
    edition: str | None = None
    season: str | None = None

    for paragraph in P_RE.findall(body):
        edition_match = EDITION_RE.search(paragraph)
        if edition_match:
            label = edition_match.group(1).lower()
            if label == "softsub":
                edition = "SoftSub"
            elif label == "dubbed":
                edition = "Dubbed"
            elif label == "nosub":
                edition = "NoSub"
            else:
                edition = None
            season = None
            continue

        text_only = re.sub(r"<[^>]+>", "", paragraph).strip()
        season_match = SEASON_RE.match(text_only)
        if season_match:
            season = f"Season {int(season_match.group(1))}"
            continue

        if edition not in ("SoftSub", "Dubbed", "NoSub"):
            continue

        for match in ANCHOR_RE.finditer(paragraph):
            quality = decode_html(match.group(2))
            if not quality:
                continue
            title = f"{season} · {quality}" if season else quality
            sources.append(
                {
                    "title": title,
                    "url": extract_href(match.group(1)),
                    "size": clean_size(match.group(3)),
                    "edition": edition,
                }
            )

    return sources


def html_to_catalog(html: str, source: str) -> dict:
    items = []
    for match in ENTRY_RE.finditer(html):
        items.append(
            {
                "index": int(match.group(1)),
                "title": clean_title(match.group(2)),
                "imdbId": decode_html(match.group(3)),
                "type": decode_html(match.group(4)).lower(),
                "imdbVotes": parse_votes(match.group(5)),
                "imdbRating": parse_rating(match.group(6)),
                "urls": parse_sources(match.group(7)),
            }
        )

    return {
        "source": source,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(items),
        "items": items,
    }


def main() -> None:
    if len(sys.argv) < 2:
        print(
            "Usage: python3 scripts/html-to-catalog.py <input.html> [output.json]",
            file=sys.stderr,
        )
        sys.exit(1)

    input_path = Path(sys.argv[1]).expanduser().resolve()
    output_path = (
        Path(sys.argv[2]).expanduser().resolve()
        if len(sys.argv) > 2
        else Path(__file__).resolve().parent.parent / "data" / "catalog.json"
    )

    catalog = html_to_catalog(
        input_path.read_text(encoding="utf-8"),
        input_path.name,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    items_path = output_path.with_name("catalog.items.json")
    items_path.write_text(
        json.dumps(catalog["items"], ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    source_count = sum(len(item["urls"]) for item in catalog["items"])
    print(f"Wrote {catalog['count']} titles / {source_count} sources → {output_path}")
    print(f"Wrote compact items → {items_path}")


if __name__ == "__main__":
    main()
