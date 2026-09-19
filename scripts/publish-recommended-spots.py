#!/usr/bin/env python3
"""Publish a versioned catalog and place records, then verify every S3 download.

Requires boto3 and standard AWS credentials. Existing, different objects are never overwritten.
Example: python scripts/publish-recommended-spots.py --bucket YOUR_BUCKET --publish
"""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREFIX = "catalogs/recommended-spots/2026-09-19-v1/"
DISTRICTS = {"110", "130", "150", "170", "190", "210", "230", "720", "730", "750", "760", "770", "780", "790", "800", "810", "820", "830"}


def payloads():
    catalog_bytes = (ROOT / "backend/src/main/resources/recommended-gangwon-spots.json").read_bytes()
    source_bytes = (ROOT / "docs/assets/recommended-spot-sources.json").read_bytes()
    catalog, source = json.loads(catalog_bytes), json.loads(source_bytes)
    keys = lambda places: [(p["sigungu"], p["title"]) for p in places]
    assert catalog["version"] == source["version"] == 1
    assert len(catalog["places"]) == len(set(keys(catalog["places"]))) == 360
    assert keys(catalog["places"]) == keys(source["places"])
    assert {p["sigungu"] for p in catalog["places"]} == DISTRICTS
    assert len({p["contentId"] for p in source["places"]}) == 360
    for district in DISTRICTS:
        assert sum(p["sigungu"] == district for p in catalog["places"]) == 20
    objects = {"catalog.json": catalog_bytes, "sources.json": source_bytes}
    for place in source["places"]:
        assert place["region"] == "51" and isinstance(place["contentId"], int) and place["contentId"] > 0
        objects[f"places/{place['sigungu']}/{place['contentId']}.json"] = (
            json.dumps(place, ensure_ascii=False, indent=2) + "\n").encode()
    return objects


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--prefix", default=PREFIX)
    parser.add_argument("--publish", action="store_true", help="Write objects; omitted means local validation only")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    assert args.prefix.startswith("catalogs/recommended-spots/") and args.prefix.endswith("/")
    objects = payloads()
    if not args.publish:
        print(json.dumps({"objects": len(objects), "places": 360, "mode": "dry-run"}))
        return

    import boto3
    from botocore.exceptions import ClientError
    s3 = boto3.client("s3")

    def publish(item):
        name, content = item
        key = args.prefix + name
        sha = hashlib.sha256(content).hexdigest()
        try:
            current = s3.get_object(Bucket=args.bucket, Key=key)["Body"].read()
            if current != content:
                raise RuntimeError("Existing object differs; choose a new version prefix: " + key)
            state = "already-present"
        except ClientError as error:
            if error.response["Error"]["Code"] not in {"NoSuchKey", "404"}:
                raise
            s3.put_object(Bucket=args.bucket, Key=key, Body=content,
                          ContentType="application/json; charset=utf-8", IfNoneMatch="*",
                          CacheControl="private, max-age=31536000, immutable",
                          ChecksumSHA256=base64.b64encode(bytes.fromhex(sha)).decode(),
                          Metadata={"sha256": sha})
            state = "uploaded"
        downloaded = s3.get_object(Bucket=args.bucket, Key=key)
        actual = downloaded["Body"].read()
        assert actual == content and hashlib.sha256(actual).hexdigest() == sha, key
        assert downloaded["ContentType"] == "application/json; charset=utf-8", key
        return {"key": key, "bytes": len(actual), "sha256": sha, "state": state, "downloadVerified": True}

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(publish, objects.items()))
    report = {"bucket": args.bucket, "prefix": args.prefix, "placeCount": 360,
              "objectCount": len(results), "allDownloadsVerified": True, "objects": results}
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "objects"}))


if __name__ == "__main__":
    main()
