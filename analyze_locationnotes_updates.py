import argparse
import json
import os
import re
import urllib.parse
from pathlib import Path
from typing import Generator, Tuple
USER_MAP = {
    "b388b48e-e5c4-4618-b853-71972a21bdeb": "maddoxg",
    "433d1ddd-0f8d-4eab-a5c5-f803deb930e3": "kayjack",
    "a08c2aec-d851-4ae7-9078-fda567c70b39": "bishop",
    "bad22eff-a513-4028-9db6-e500e71d199a": "adamabard",
    "d793930b-d4cd-4961-b5b4-cdfca8dfc1f0": "lexlyrics",
    "fb446568-2d37-4e56-a402-04c02ab9ed78": "lexlyrics",
    "fdecefaa-6936-461c-b51e-e3cb9119948c": "tomty-test",
    "b539ae29-b908-490d-889c-2ccb312b43ad": "tomty",
    "4b29ecaf-34cb-44ab-8621-34ab1b893a85": "abdul_ayo",
    "52bbd857-b059-4047-9907-9a91d3877bc4": "ashenry",
    "338c2517-27d5-4d40-ad53-9e6ef71822a6": "doobneek",
    "364903f1-1c9a-46e9-bb3c-2884e1ba8bce": "kieshaj10",
    "3d9f45a6-3418-4415-ad08-52c5a10dc218": "gavilan",
    "283260dc-b39d-4e34-aefe-78a13934ee0f": "helena",
    "83aa7f1c-94a9-49a1-9f16-dad0d78b69e1": "liz",
    "8c77ad47-58dd-405f-a8b0-3e18d332dcbb": "ES",
    "410370eb-f81b-474e-bdce-ba0994761730": "Liz24",
    "20d73400-51ea-41c8-be17-372c673c2813": "glongino",
    "b471674a-0d9f-4c32-96e5-dbc9249398d2": "emmab",
}
USER_MAP_LOWER = {key.lower(): value for key, value in USER_MAP.items()}
UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Analyze locationNotes updates for max username/timestamp combos and unknown UUID users."
        )
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Updates JSON file, manifest JSON with chunks, or a directory of chunk files.",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=5,
        help="Show top N encoded nodes by username/timestamp combos.",
    )
    parser.add_argument(
        "--target",
        default="",
        help=(
            "Optional encoded key, decoded path, or full update path to report counts "
            "(e.g. /locationNotes/%2Fteam%2Flocation%2F.../user/ts)."
        ),
    )
    parser.add_argument(
        "--report",
        default="",
        help="Optional path to write a JSON report.",
    )
    return parser.parse_args()
def load_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)
def iter_update_map(data: object) -> Generator[Tuple[str, object], None, None]:
    if not isinstance(data, dict):
        raise ValueError("Updates file is not an object.")
    for key, value in data.items():
        yield str(key), value
def iter_updates_from_file(path: Path) -> Generator[Tuple[str, object], None, None]:
    data = load_json(path)
    if isinstance(data, dict) and "chunks" in data:
        chunks = data.get("chunks")
        if not isinstance(chunks, list):
            raise ValueError(f"Manifest chunks is not a list: {path}")
        base_dir = path.parent
        for chunk in chunks:
            chunk_path = Path(chunk)
            if not chunk_path.is_absolute():
                chunk_path = (base_dir / chunk_path).resolve()
            yield from iter_updates_from_file(chunk_path)
        return
    yield from iter_update_map(data)
def iter_updates(input_path: Path) -> Generator[Tuple[str, object], None, None]:
    if input_path.is_dir():
        for file_path in sorted(input_path.glob("*.json")):
            yield from iter_updates_from_file(file_path)
        return
    yield from iter_updates_from_file(input_path)
def parse_locationnotes_key(key: str) -> Tuple[str, str, str] | None:
    if not key:
        return None
    normalized = key.strip()
    if not normalized.startswith("/"):
        normalized = "/" + normalized
    parts = normalized.strip("/").split("/")
    if len(parts) < 4:
        return None
    if parts[0] != "locationNotes":
        return None
    user = parts[-2]
    timestamp = parts[-1]
    node = "/".join(parts[1:-2])
    return node, user, timestamp
def normalize_target(target: str) -> str | None:
    if not target:
        return None
    text = target.strip()
    if not text:
        return None
    if "locationNotes" in text:
        parsed = parse_locationnotes_key(text)
        if parsed:
            node, _, _ = parsed
            return urllib.parse.unquote(node)
    if "%2F" in text or "%2f" in text:
        return urllib.parse.unquote(text)
    if text.startswith("team/"):
        return "/" + text
    if text.startswith("/team/"):
        return text
    if text.startswith("/"):
        return text
    return text
def choose_encoded_sample(existing: str, candidate: str) -> str:
    if not existing:
        return candidate
    existing_encoded = "%2F" in existing or "%2f" in existing
    candidate_encoded = "%2F" in candidate or "%2f" in candidate
    if candidate_encoded and not existing_encoded:
        return candidate
    return existing
def collect_details_for_key(
    input_path: Path, target_decoded: str
) -> Tuple[int, set[str], set[str]]:
    total = 0
    users: set[str] = set()
    timestamps: set[str] = set()
    for key, _ in iter_updates(input_path):
        parsed = parse_locationnotes_key(key)
        if not parsed:
            continue
        node, user, timestamp = parsed
        decoded = urllib.parse.unquote(node)
        if decoded != target_decoded:
            continue
        total += 1
        users.add(user)
        timestamps.add(timestamp)
    return total, users, timestamps
def main() -> int:
    args = parse_args()
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Input not found: {input_path}")
        return 1
    target_decoded = normalize_target(args.target)
    counts: dict[str, int] = {}
    encoded_samples: dict[str, str] = {}
    total_updates = 0
    non_locationnotes = 0
    uuid_mapped: dict[str, int] = {}
    uuid_unmapped: dict[str, int] = {}
    target_users: set[str] = set()
    target_timestamps: set[str] = set()
    target_count = 0
    for key, _ in iter_updates(input_path):
        total_updates += 1
        parsed = parse_locationnotes_key(key)
        if not parsed:
            non_locationnotes += 1
            continue
        node, user, timestamp = parsed
        decoded = urllib.parse.unquote(node)
        counts[decoded] = counts.get(decoded, 0) + 1
        encoded_samples[decoded] = choose_encoded_sample(
            encoded_samples.get(decoded, ""), node
        )
        user_lower = user.lower()
        if UUID_RE.match(user_lower):
            if user_lower in USER_MAP_LOWER:
                uuid_mapped[user_lower] = uuid_mapped.get(user_lower, 0) + 1
            else:
                uuid_unmapped[user_lower] = uuid_unmapped.get(user_lower, 0) + 1
        if target_decoded and decoded == target_decoded:
            target_count += 1
            target_users.add(user)
            target_timestamps.add(timestamp)
    top_n = max(int(args.top or 0), 0)
    top_items = (
        sorted(counts.items(), key=lambda item: item[1], reverse=True)[:top_n]
        if top_n
        else []
    )
    top_detail = None
    if top_items:
        top_key = top_items[0][0]
        if target_decoded and top_key == target_decoded:
            top_detail = {
                "decoded": top_key,
                "encoded": urllib.parse.quote(top_key, safe=""),
                "count": target_count,
                "unique_users": len(target_users),
                "unique_timestamps": len(target_timestamps),
                "users": sorted(target_users),
            }
        else:
            detail_count, detail_users, detail_timestamps = collect_details_for_key(
                input_path, top_key
            )
            top_detail = {
                "decoded": top_key,
                "encoded": urllib.parse.quote(top_key, safe=""),
                "count": detail_count,
                "unique_users": len(detail_users),
                "unique_timestamps": len(detail_timestamps),
                "users": sorted(detail_users),
            }
    report = {
        "input": str(input_path),
        "total_updates": total_updates,
        "non_locationnotes": non_locationnotes,
        "unique_nodes": len(counts),
        "top_nodes": [
            {
                "decoded": key,
                "encoded": urllib.parse.quote(key, safe=""),
                "count": count,
            }
            for key, count in top_items
        ],
        "target": None,
        "top_detail": top_detail,
        "uuid_users": {
            "mapped_total": sum(uuid_mapped.values()),
            "unmapped_total": sum(uuid_unmapped.values()),
            "mapped_unique": sorted(uuid_mapped.keys()),
            "unmapped_unique": sorted(uuid_unmapped.keys()),
        },
    }
    if target_decoded:
        report["target"] = {
            "decoded": target_decoded,
            "encoded": urllib.parse.quote(target_decoded, safe=""),
            "count": target_count,
            "unique_users": len(target_users),
            "unique_timestamps": len(target_timestamps),
            "users": sorted(target_users),
        }
    print(
        f"Updates: total={total_updates} non_locationnotes={non_locationnotes} "
        f"unique_nodes={len(counts)}"
    )
    if top_items:
        print("Top nodes by username/timestamp combos:")
        for key, count in top_items:
            encoded = urllib.parse.quote(key, safe="")
            print(f"- {count} combos: {encoded} ({key})")
    if target_decoded:
        print(
            f"Target: {urllib.parse.quote(target_decoded, safe='')} "
            f"count={target_count} unique_users={len(target_users)} "
            f"unique_timestamps={len(target_timestamps)}"
        )
    print(
        "UUID users: "
        f"mapped_total={sum(uuid_mapped.values())} "
        f"unmapped_total={sum(uuid_unmapped.values())}"
    )
    if uuid_unmapped:
        print("Unmapped UUID usernames:")
        for user_id in sorted(uuid_unmapped.keys()):
            print(f"- {user_id}")
    if args.report:
        report_path = Path(args.report)
        report_path.write_text(
            json.dumps(report, ensure_ascii=True, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Report: {report_path}")
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
