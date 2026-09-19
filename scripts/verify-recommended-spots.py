#!/usr/bin/env python3
"""Read-only catalog → public API → catalog verification (Python standard library)."""
import argparse
import collections
import concurrent.futures
import datetime
import json
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DISTRICTS = set("110 130 150 170 190 210 230 720 730 750 760 770 780 790 800 810 820 830".split())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="https://planfix.cloud")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    catalog = json.loads((ROOT / "backend/src/main/resources/recommended-gangwon-spots.json").read_text())
    metadata = json.loads((ROOT / "docs/assets/recommended-spot-sources.json").read_text())
    expected = {(p["sigungu"], p["title"]) for p in catalog["places"]}
    counts = collections.Counter(p["sigungu"] for p in catalog["places"])
    require(len(catalog["places"]) == len(expected) == 360, "Catalog must contain 360 unique places")
    require(dict(counts) == {d: 20 for d in DISTRICTS}, "Expected 20 places in each of 18 districts")
    require(len(metadata["places"]) == 360 and expected == {(p["sigungu"], p["title"]) for p in metadata["places"]}, "Metadata/catalog mismatch")
    require({r["sigungu"] for r in metadata["regions"] if r["researchSources"]} == DISTRICTS, "Missing district research sources")
    metadata_by_place = {(p["sigungu"], p["title"]): p for p in metadata["places"]}

    def request(path, params=None):
        url = args.base_url.rstrip("/") + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"User-Agent": "PlanFix-Catalog-Audit/1.0"})
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response), response.headers

    def district_check(district):
        data, headers = request("/api/v1/spots/recommended", {"region": "51", "sigungu": district, "size": 20})
        items = data["items"]
        actual = {(p["sigungu"], p["title"]) for p in items}
        require(data["totalCount"] == len(items) == len(actual) == 20, f"{district}: count/duplicate mismatch")
        require(actual == {p for p in expected if p[0] == district}, f"{district}: missing/unapproved place")
        require(all(p["region"] == "51" for p in items), f"{district}: other province leaked")
        require(headers.get("Cache-Control") == "no-store", f"{district}: cache header mismatch")
        return items

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        items = [p for group in pool.map(district_check, sorted(DISTRICTS)) for p in group]
    require({(p["sigungu"], p["title"]) for p in items} == expected, "Reverse union differs from catalog")
    require(len({p["spotId"] for p in items}) == 360, "Duplicate spot IDs across districts")

    def detail_check(item):
        detail, _ = request(f"/api/v1/spots/{item['spotId']}")
        require(all(detail[k] == item[k] for k in ("spotId", "title", "region", "sigungu")), f"Detail mismatch: {item['spotId']}")
        audited = metadata_by_place[(item["sigungu"], item["title"])]
        require(all(detail[k] == audited[k] for k in ("category", "address")), f"Metadata mismatch: {item['spotId']}")
        require(all(abs(detail[k] - audited[k]) < 0.00001 for k in ("latitude", "longitude")), f"Coordinate mismatch: {item['spotId']}")
        return item["spotId"]

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        checked_details = list(pool.map(detail_check, items))
    for size in (20, 100):
        data, _ = request("/api/v1/spots/recommended", {"region": "51", "size": size})
        actual = {(p["sigungu"], p["title"]) for p in data["items"]}
        require(data["totalCount"] == 360 and len(data["items"]) == len(actual) == size, "Global sample count/duplicates")
        require(actual <= expected, "Global sample contains an unapproved place")
    for params in ({"region": "11"}, {"region": "51", "sigungu": "999"}):
        data, _ = request("/api/v1/spots/recommended", params)
        require(data["items"] == [] and data["totalCount"] == 0, "Unsupported region returned candidates")
    for size in (0, 101):
        try:
            request("/api/v1/spots/recommended", {"size": size})
        except urllib.error.HTTPError as error:
            require(error.code == 400, f"Invalid size returned HTTP {error.code}")
        else:
            raise ValueError("Invalid size was accepted")
    report = {"checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "baseUrl": args.base_url,
              "reviewedAt": catalog["reviewedAt"], "revision": catalog.get("revision"),
              "districtCounts": dict(counts), "uniquePlaces": len(items),
              "detailsVerified": len(checked_details), "forwardAndReverseMatch": True,
              "negativeChecksPassed": True, "globalSampleSizes": [20, 100]}
    output = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(output)
    print(output, end="")


if __name__ == "__main__":
    main()
