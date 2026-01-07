import argparse
import json
import re
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
        description="Build RTDB delete updates for UUID username entries."
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Updates JSON file, manifest JSON with chunks, or a directory of chunk files.",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output JSON path for delete updates.",
    )
    parser.add_argument(
        "--include-unknown-uuids",
        action="store_true",
        help="Also delete UUID usernames not present in USER_MAP.",
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
def is_uuid(value: str) -> bool:
    if not value:
        return False
    return bool(UUID_RE.match(value.strip()))
def extract_user_from_key(key: str) -> str | None:
    parts = key.strip("/").split("/")
    if len(parts) < 4 or parts[0] != "locationNotes":
        return None
    return parts[2]
def build_delete_map(
    updates: Generator[Tuple[str, object], None, None],
    include_unknown: bool,
) -> tuple[dict, dict]:
    deletes: dict[str, object] = {}
    stats = {
        "seen": 0,
        "mapped_deletes": 0,
        "unknown_deletes": 0,
    }
    for key, _ in updates:
        stats["seen"] += 1
        user = extract_user_from_key(key)
        if not user:
            continue
        mapped = USER_MAP.get(user) or USER_MAP_LOWER.get(user.lower())
        if mapped and mapped != user:
            deletes[key] = None
            stats["mapped_deletes"] += 1
            continue
        if include_unknown and is_uuid(user):
            deletes[key] = None
            stats["unknown_deletes"] += 1
    return deletes, stats
def main() -> int:
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)
    if not input_path.exists():
        print(f"Input not found: {input_path}")
        return 1
    deletes, stats = build_delete_map(
        iter_updates(input_path),
        include_unknown=args.include_unknown_uuids,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(deletes, ensure_ascii=True) + "\n", encoding="utf-8"
    )
    print("Done.")
    print(
        f"seen={stats['seen']} "
        f"mapped_deletes={stats['mapped_deletes']} "
        f"unknown_deletes={stats['unknown_deletes']} "
        f"output={output_path}"
    )
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
