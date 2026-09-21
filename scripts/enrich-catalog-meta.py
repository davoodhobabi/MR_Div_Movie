#!/usr/bin/env python3
"""Fill missing titleFa / year on the bundled catalog.

Archive.js is often 503. Years come from download URLs first, then Wikidata.
Persian titles come from Wikidata labels via the QLever SPARQL endpoint.
"""

from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "lib/catalog/data/bundledCatalog.json"
META = ROOT / "lib/catalog/data/bundledCatalog.meta.json"
ITEMS = ROOT / "data/catalog.items.json"
CATALOG = ROOT / "data/catalog.json"

UA = "MrDivMovie/1.0 (catalog enrichment; personal Android app)"
QLEVER = "https://qlever.dev/api/wikidata"
WDQS = "https://query.wikidata.org/sparql"
BATCH = 300
YEAR_MIN, YEAR_MAX = 1888, 2030
YEAR_PATH = re.compile(r"/(?:movies|series|serial)/((?:19|20)\d{2})/", re.I)
YEAR_DOT = re.compile(r"\.((?:19|20)\d{2})\.")
PERSIAN_RE = re.compile(r"[\u0600-\u06FF]")


def has_persian(text: str) -> bool:
    return bool(PERSIAN_RE.search(text))


def year_from_text(text: str) -> int | None:
    match = YEAR_PATH.search(text)
    if match:
        year = int(match.group(1))
        if YEAR_MIN <= year <= YEAR_MAX:
            return year
    match = YEAR_DOT.search(text)
    if match:
        year = int(match.group(1))
        if YEAR_MIN <= year <= YEAR_MAX:
            return year
    return None


def year_from_item(item: dict) -> int | None:
    texts: list[str] = []
    for source in item.get("urls") or []:
        texts.append(str(source.get("url") or ""))
        texts.append(str(source.get("title") or ""))
    for season in item.get("seasons") or []:
        for option in season.get("options") or []:
            texts.append(str(option.get("folderUrl") or ""))
            texts.append(str(option.get("quality") or ""))
    for text in texts:
        year = year_from_text(text)
        if year is not None:
            return year
    return None


def search_key(item: dict) -> str:
    return " ".join(
        [
            str(item.get("title") or ""),
            str(item.get("titleFa") or ""),
            str(item.get("imdbId") or ""),
            str(item.get("type") or ""),
            str(item.get("year") or ""),
        ]
    ).lower()


def sparql_query(ids: list[str]) -> str:
    values = " ".join(f'"{imdb}"' for imdb in ids)
    return f"""PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?imdb (SAMPLE(?faLabel) AS ?fa) (MIN(?y) AS ?year) WHERE {{
  VALUES ?imdb {{ {values} }}
  ?item wdt:P345 ?imdb.
  OPTIONAL {{
    ?item rdfs:label ?faLabel.
    FILTER(LANG(?faLabel) = "fa")
  }}
  OPTIONAL {{
    {{ ?item wdt:P577 ?d }} UNION {{ ?item wdt:P580 ?d }}
    BIND(YEAR(?d) AS ?y)
  }}
}}
GROUP BY ?imdb"""


def parse_bindings(payload: dict) -> dict[str, tuple[str | None, int | None]]:
    out: dict[str, tuple[str | None, int | None]] = {}
    for row in payload.get("results", {}).get("bindings", []):
        imdb = row.get("imdb", {}).get("value")
        if not imdb:
            continue
        fa = (row.get("fa") or {}).get("value") or None
        if fa and not has_persian(fa):
            fa = None
        year_raw = (row.get("year") or {}).get("value")
        year = int(float(year_raw)) if year_raw else None
        if year is not None and not (YEAR_MIN <= year <= YEAR_MAX):
            year = None
        out[imdb] = (fa, year)
    return out


def fetch_json(url: str, data: bytes | None = None, timeout: int = 90) -> dict:
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "User-Agent": UA,
            "Accept": "application/sparql-results+json,application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.load(response)


def sparql_batch(ids: list[str]) -> dict[str, tuple[str | None, int | None]]:
    query = sparql_query(ids)
    last_error: Exception | None = None
    for attempt in range(5):
        try:
            qlever_url = QLEVER + "?" + urllib.parse.urlencode({"query": query})
            return parse_bindings(fetch_json(qlever_url, timeout=90))
        except Exception as err:
            last_error = err
            time.sleep(1.5 * (attempt + 1))
            try:
                body = urllib.parse.urlencode({"query": query, "format": "json"}).encode()
                return parse_bindings(fetch_json(WDQS, data=body, timeout=90))
            except Exception as wdqs_err:
                last_error = wdqs_err
                time.sleep(1.0)
    raise RuntimeError(f"SPARQL failed for {ids[0]}…: {last_error}")


def chunks(values: list[str], size: int) -> list[list[str]]:
    return [values[i : i + size] for i in range(0, len(values), size)]


def main() -> None:
    items: list[dict] = json.loads(BUNDLE.read_text())
    url_years = 0
    for item in items:
        if item.get("year") is None:
            year = year_from_item(item)
            if year is not None:
                item["year"] = year
                url_years += 1

    need_ids = list(
        dict.fromkeys(
            item["imdbId"]
            for item in items
            if item.get("imdbId")
            and (not item.get("titleFa") or item.get("year") is None)
        )
    )
    batches = chunks(need_ids, BATCH)
    print(
        f"[enrich] {len(items)} items, {len(need_ids)} need Wikidata, "
        f"{len(batches)} batches, url years {url_years}"
    )

    wiki: dict[str, tuple[str | None, int | None]] = {}
    for index, batch in enumerate(batches, start=1):
        try:
            wiki.update(sparql_batch(batch))
        except Exception as err:
            print(f"[enrich] batch failed ({batch[0]}): {err}")
        print(f"[enrich] wikidata {index}/{len(batches)} ({len(wiki)} ids)")
        time.sleep(0.2)

    fa_count = 0
    year_count = 0
    for item in items:
        fa, wiki_year = wiki.get(item.get("imdbId", ""), (None, None))
        if fa and not item.get("titleFa"):
            item["titleFa"] = fa
            fa_count += 1
        if item.get("year") is None and wiki_year is not None:
            item["year"] = wiki_year
            year_count += 1
        item["searchKey"] = search_key(item)

    BUNDLE.write_text(json.dumps(items, ensure_ascii=False, separators=(",", ":")))
    meta = json.loads(META.read_text()) if META.exists() else {}
    meta["enrichedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    meta["enrichSource"] = "url-year+qlever"
    META.write_text(json.dumps(meta, indent=2) + "\n")

    slim = [{k: item[k] for k in item if k != "searchKey"} for item in items]
    ITEMS.write_text(json.dumps(slim, ensure_ascii=False, separators=(",", ":")))
    if CATALOG.exists():
        catalog = json.loads(CATALOG.read_text())
        if isinstance(catalog, dict) and isinstance(catalog.get("items"), list):
            catalog["items"] = slim
            catalog["generatedAt"] = meta.get("enrichedAt")
            CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2))

    with_fa = sum(1 for item in items if item.get("titleFa"))
    with_year = sum(1 for item in items if item.get("year") is not None)
    print(
        f"[enrich] wrote titleFa={with_fa}/{len(items)} year={with_year}/{len(items)} "
        f"(url years {url_years}, wiki fa {fa_count}, wiki year {year_count})"
    )


if __name__ == "__main__":
    main()
