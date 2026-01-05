import argparse
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DROP_FIELDS = {"ts", "userName", "pagePath", "locationId", "serviceId"}

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
ENCODED_SLASH_RE = re.compile(r"%2f", re.IGNORECASE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Remove redundant fields from locationNotes updates and map user IDs to usernames."
        )
    )
    parser.add_argument(
        "--input",
        default="",
        help=(
            "Updates JSON file, manifest JSON with chunks, a directory of chunk files, "
            "or a locationNotes export JSON."
        ),
    )
    parser.add_argument(
        "--output",
        default="",
        help="Output updates/manifest path (default adds _cleaned suffix).",
    )
    parser.add_argument(
        "--output-dir",
        default="",
        help="Output directory for cleaned chunks (manifest/dir input).",
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Overwrite input file(s) instead of writing new files.",
    )
    parser.add_argument(
        "--drop-unknown-uuids",
        action="store_true",
        help="Drop updates whose username is a UUID not present in USER_MAP.",
    )
    parser.add_argument(
        "--emit-uuid-deletes",
        action="store_true",
        help="Emit delete updates for UUID user keys that were mapped to usernames.",
    )
    parser.add_argument(
        "--emit-unknown-uuid-deletes",
        action="store_true",
        help="Emit delete updates for unknown UUID usernames (implies --drop-unknown-uuids).",
    )
    parser.add_argument(
        "--base-path",
        default="/locationNotes",
        help="Base path for updates when input is a locationNotes export.",
    )
    parser.add_argument(
        "--delete-output",
        default="",
        help="Output path for UUID delete updates (default adds _uuid_deletes suffix).",
    )
    parser.add_argument(
        "--drop-note-keys",
        default="",
        help="Comma-separated note fields to remove (e.g. before,after).",
    )
    parser.add_argument(
        "--minify-json",
        action="store_true",
        help="Minify note JSON strings after field removal.",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Clean locationNotes directly in RTDB using --db-url.",
    )
    parser.add_argument(
        "--db-url",
        default="",
        help="RTDB base URL like https://<db>.firebaseio.com (required for --live).",
    )
    parser.add_argument(
        "--token",
        default="",
        help="RTDB auth token (or set RTDB_TOKEN/FIREBASE_TOKEN env vars).",
    )
    parser.add_argument(
        "--review-first",
        nargs="?",
        const=10,
        type=int,
        default=0,
        help="When --live, write the first N updates to --review-output and exit.",
    )
    parser.add_argument(
        "--review-output",
        default="locationNotes_review_updates.json",
        help="Output path for --review-first updates.",
    )
    parser.add_argument(
        "--sleep-ms",
        type=int,
        default=0,
        help="Sleep between live node updates (milliseconds).",
    )
    return parser.parse_args()


def load_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def dump_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=True) + "\n", encoding="utf-8")


def is_uuid(value: str) -> bool:
    if not value:
        return False
    return bool(UUID_RE.match(value.strip()))


def is_encoded_key(value: str) -> bool:
    if not value:
        return False
    return bool(ENCODED_SLASH_RE.search(value))


def normalize_base_path(value: str) -> str:
    if not value:
        return ""
    return f"/{value.strip('/')}"


def resolve_token(arg_token: str) -> str:
    if arg_token:
        return arg_token
    return os.getenv("RTDB_TOKEN") or os.getenv("FIREBASE_TOKEN") or ""


def encode_rtdb_path(path: str) -> str:
    cleaned = path.strip("/")
    if not cleaned:
        return ""
    segments = [urllib.parse.quote(segment, safe="") for segment in cleaned.split("/")]
    return "/".join(segment for segment in segments if segment)


def build_rtdb_url(db_url: str, path: str, token: str, shallow: bool = False) -> str:
    base = db_url.rstrip("/")
    encoded = encode_rtdb_path(path)
    if encoded:
        url = f"{base}/{encoded}.json"
    else:
        url = f"{base}/.json"
    params = {}
    if shallow:
        params["shallow"] = "true"
    if token:
        params["auth"] = token
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    return url


def http_get_json(url: str) -> tuple[int | None, object | None, str]:
    try:
        with urllib.request.urlopen(url, timeout=60) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(body), ""
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return exc.code, None, body
    except urllib.error.URLError as exc:
        return None, None, str(exc)
    except json.JSONDecodeError as exc:
        return None, None, f"Invalid JSON: {exc}"


def patch_updates(url: str, updates: dict[str, object]) -> tuple[int | None, str]:
    payload = json.dumps(updates, ensure_ascii=True).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"content-type": "application/json"},
        method="PATCH",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return exc.code, body
    except urllib.error.URLError as exc:
        return None, str(exc)


def looks_like_updates_map(data: dict) -> bool:
    for key in data.keys():
        if not isinstance(key, str):
            continue
        if key.startswith("/locationNotes/") or key.startswith("locationNotes/"):
            return True
    return False


def extract_locationnotes_root(data: object) -> dict | None:
    if not isinstance(data, dict):
        return None
    if "locationNotes" in data and isinstance(data["locationNotes"], dict):
        return data["locationNotes"]
    if "/locationNotes" in data and isinstance(data["/locationNotes"], dict):
        return data["/locationNotes"]
    if looks_like_updates_map(data):
        return None
    for key, value in data.items():
        if not isinstance(key, str):
            continue
        if key == "_meta" or is_uuid(key) or is_encoded_key(key):
            if isinstance(value, dict):
                return data
    return None


def map_user_in_key(key: str, drop_unknown_uuids: bool) -> tuple[str, bool, bool, bool]:
    parts = key.strip("/").split("/")
    if len(parts) < 4 or parts[0] != "locationNotes":
        return key, False, False, False
    user_key = parts[2]
    user_key_lower = user_key.lower()
    mapped = USER_MAP.get(user_key) or USER_MAP_LOWER.get(user_key_lower)
    if not mapped or mapped == user_key:
        unknown_uuid = is_uuid(user_key)
        if drop_unknown_uuids and unknown_uuid:
            return key, False, True, True
        return key, False, False, unknown_uuid
    parts[2] = mapped
    return "/" + "/".join(parts), True, False, False


def strip_note_fields(
    value: object, drop_fields: set[str], minify_json: bool
) -> tuple[object, int, bool]:
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return value, 0, False
        if not isinstance(parsed, dict):
            return value, 0, False
        removed = 0
        for field in list(parsed.keys()):
            if field in drop_fields:
                parsed.pop(field, None)
                removed += 1
        if not removed:
            return value, 0, False
        if minify_json:
            return json.dumps(parsed, ensure_ascii=True, separators=(",", ":")), removed, True
        return json.dumps(parsed, ensure_ascii=True), removed, True

    if isinstance(value, dict):
        removed = 0
        for field in list(value.keys()):
            if field in drop_fields:
                value.pop(field, None)
                removed += 1
        return value, removed, removed > 0

    return value, 0, False


def clean_note_value(
    value: object, drop_fields: set[str], minify_json: bool
) -> tuple[str | None, bool]:
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return None, True
        if not isinstance(parsed, dict):
            return None, True
        removed = 0
        for field in list(parsed.keys()):
            if field in drop_fields:
                parsed.pop(field, None)
                removed += 1
        if not removed:
            return value, False
        if minify_json:
            return json.dumps(parsed, ensure_ascii=True, separators=(",", ":")), True
        return json.dumps(parsed, ensure_ascii=True), True

    if isinstance(value, dict):
        parsed = dict(value)
        for field in list(parsed.keys()):
            if field in drop_fields:
                parsed.pop(field, None)
        if minify_json:
            return json.dumps(parsed, ensure_ascii=True, separators=(",", ":")), True
        return json.dumps(parsed, ensure_ascii=True), True

    return None, True


def flatten_locationnotes_export(
    root: dict, base_path: str
) -> tuple[dict[str, object], dict[str, int]]:
    updates: dict[str, object] = {}
    stats = {
        "export_roots": 0,
        "export_encoded_roots": 0,
        "export_entries": 0,
        "export_skipped_roots": 0,
        "export_skipped_entries": 0,
    }
    base = normalize_base_path(base_path)

    for encoded_key, encoded_value in root.items():
        stats["export_roots"] += 1
        if not isinstance(encoded_key, str):
            stats["export_skipped_roots"] += 1
            continue
        if encoded_key == "_meta" or is_uuid(encoded_key) or not is_encoded_key(encoded_key):
            stats["export_skipped_roots"] += 1
            continue
        if not isinstance(encoded_value, dict):
            stats["export_skipped_roots"] += 1
            continue
        stats["export_encoded_roots"] += 1

        for user_key, user_value in encoded_value.items():
            if not isinstance(user_key, str):
                stats["export_skipped_entries"] += 1
                continue
            if user_key == "_meta":
                stats["export_skipped_entries"] += 1
                continue
            if not isinstance(user_value, dict):
                stats["export_skipped_entries"] += 1
                continue
            for ts_key, note_value in user_value.items():
                if ts_key == "_meta":
                    stats["export_skipped_entries"] += 1
                    continue
                timestamp = str(ts_key)
                update_key = f"{base}/{encoded_key}/{user_key}/{timestamp}" if base else (
                    f"/{encoded_key}/{user_key}/{timestamp}"
                )
                updates[update_key] = note_value
                stats["export_entries"] += 1

    return updates, stats


def transform_updates_map(
    updates: dict,
    drop_unknown_uuids: bool,
    drop_fields: set[str],
    minify_json: bool,
    emit_uuid_deletes: bool,
    emit_unknown_uuid_deletes: bool,
) -> tuple[dict, dict, dict]:
    stats = {
        "entries": 0,
        "mapped_users": 0,
        "unknown_uuids": 0,
        "dropped_unknown_uuids": 0,
        "notes_changed": 0,
        "fields_removed": 0,
        "collisions": 0,
        "parse_errors": 0,
        "uuid_deletes": 0,
        "unknown_uuid_deletes": 0,
    }
    new_updates: dict[str, object] = {}
    delete_updates: dict[str, object] = {}

    for key, value in updates.items():
        stats["entries"] += 1
        new_key, mapped, dropped, unknown_uuid = map_user_in_key(
            str(key), drop_unknown_uuids
        )
        if mapped:
            stats["mapped_users"] += 1
            if emit_uuid_deletes:
                delete_updates[str(key)] = None
        if unknown_uuid:
            stats["unknown_uuids"] += 1
            if emit_unknown_uuid_deletes:
                delete_updates[str(key)] = None
                stats["unknown_uuid_deletes"] += 1
        if dropped:
            stats["dropped_unknown_uuids"] += 1
            continue

        new_value, removed, changed = strip_note_fields(
            value, drop_fields, minify_json
        )
        if changed:
            stats["notes_changed"] += 1
        stats["fields_removed"] += removed

        if new_key in new_updates and new_key != key:
            stats["collisions"] += 1
            new_key = key
        new_updates[new_key] = new_value

    stats["uuid_deletes"] = len(delete_updates)
    return new_updates, stats, delete_updates


def process_updates_file(
    input_path: Path,
    output_path: Path,
    in_place: bool,
    drop_unknown_uuids: bool,
    drop_fields: set[str],
    minify_json: bool,
    emit_uuid_deletes: bool,
    emit_unknown_uuid_deletes: bool,
) -> tuple[dict, dict]:
    updates = load_json(input_path)
    if not isinstance(updates, dict):
        raise ValueError(f"Updates file is not an object: {input_path}")
    new_updates, stats, delete_updates = transform_updates_map(
        updates,
        drop_unknown_uuids,
        drop_fields,
        minify_json,
        emit_uuid_deletes,
        emit_unknown_uuid_deletes,
    )
    target = input_path if in_place else output_path
    dump_json(target, new_updates)
    stats["file"] = str(target)
    return stats, delete_updates


def resolve_output_path(input_path: Path, output_path: str) -> Path:
    if output_path:
        return Path(output_path)
    return input_path.with_name(f"{input_path.stem}_cleaned{input_path.suffix}")


def process_manifest(
    manifest_path: Path,
    output_path: Path,
    output_dir: Path,
    in_place: bool,
    drop_unknown_uuids: bool,
    drop_fields: set[str],
    minify_json: bool,
    emit_uuid_deletes: bool,
    emit_unknown_uuid_deletes: bool,
) -> tuple[list[dict], dict]:
    manifest = load_json(manifest_path)
    if not isinstance(manifest, dict) or "chunks" not in manifest:
        raise ValueError(f"Manifest is missing chunks: {manifest_path}")

    chunks = manifest.get("chunks")
    if not isinstance(chunks, list):
        raise ValueError(f"Manifest chunks is not a list: {manifest_path}")

    base_dir = manifest_path.parent
    stats_list = []
    new_chunks = []
    delete_updates: dict[str, object] = {}

    for chunk in chunks:
        chunk_rel = Path(chunk)
        chunk_in = (base_dir / chunk_rel).resolve()
        if in_place:
            chunk_out = chunk_in
        else:
            chunk_out = (output_dir / chunk_rel).resolve()
        stats, deletes = process_updates_file(
            chunk_in,
            chunk_out,
            in_place,
            drop_unknown_uuids,
            drop_fields,
            minify_json,
            emit_uuid_deletes,
            emit_unknown_uuid_deletes,
        )
        stats_list.append(stats)
        if deletes:
            delete_updates.update(deletes)
        if not in_place:
            rel = os.path.relpath(chunk_out, output_path.parent)
            new_chunks.append(str(Path(rel)))

    if not in_place:
        manifest_out = {
            "basePath": manifest.get("basePath", "/locationNotes"),
            "chunks": new_chunks,
        }
        dump_json(output_path, manifest_out)

    return stats_list, delete_updates


def process_directory(
    input_dir: Path,
    output_dir: Path,
    in_place: bool,
    drop_unknown_uuids: bool,
    drop_fields: set[str],
    minify_json: bool,
    emit_uuid_deletes: bool,
    emit_unknown_uuid_deletes: bool,
) -> tuple[list[dict], dict]:
    files = sorted(input_dir.glob("*.json"))
    stats_list = []
    delete_updates: dict[str, object] = {}
    for file_path in files:
        output_path = file_path if in_place else output_dir / file_path.name
        stats, deletes = process_updates_file(
            file_path,
            output_path,
            in_place,
            drop_unknown_uuids,
            drop_fields,
            minify_json,
            emit_uuid_deletes,
            emit_unknown_uuid_deletes,
        )
        stats_list.append(stats)
        if deletes:
            delete_updates.update(deletes)
    return stats_list, delete_updates


def process_locationnotes_export(
    root: dict,
    output_path: Path,
    base_path: str,
    drop_unknown_uuids: bool,
    drop_fields: set[str],
    minify_json: bool,
    emit_uuid_deletes: bool,
    emit_unknown_uuid_deletes: bool,
) -> tuple[dict, dict]:
    updates, export_stats = flatten_locationnotes_export(root, base_path)
    new_updates, stats, delete_updates = transform_updates_map(
        updates,
        drop_unknown_uuids,
        drop_fields,
        minify_json,
        emit_uuid_deletes,
        emit_unknown_uuid_deletes,
    )
    dump_json(output_path, new_updates)
    stats["file"] = str(output_path)
    stats.update(export_stats)
    return stats, delete_updates


def build_full_update_key(
    base_path: str, encoded_key: str, user_key: str | None = None, ts_key: str | None = None
) -> str:
    parts = [encoded_key]
    if user_key is not None:
        parts.append(user_key)
    if ts_key is not None:
        parts.append(ts_key)
    base = normalize_base_path(base_path)
    suffix = "/".join(part.strip("/") for part in parts if part is not None)
    if base:
        return f"{base}/{suffix}"
    return f"/{suffix}"


def to_relative_update_key(full_key: str, base_path: str) -> str:
    base = normalize_base_path(base_path)
    normalized = f"/{full_key.strip('/')}"
    if base and normalized.startswith(base + "/"):
        return normalized[len(base) + 1 :]
    if base and normalized == base:
        return ""
    return normalized.lstrip("/")


def build_live_updates_for_node(
    encoded_key: str,
    node_data: dict,
    base_path: str,
    drop_fields: set[str],
    minify_json: bool,
) -> tuple[dict[str, object], dict[str, int]]:
    updates: dict[str, object] = {}
    stats = {
        "node_users": 0,
        "node_updates": 0,
        "node_deletes": 0,
        "node_invalid_notes": 0,
        "node_mapped_users": 0,
        "node_unknown_uuid_users": 0,
        "node_non_dict_users": 0,
    }

    user_keys = [key for key in node_data.keys() if isinstance(key, str)]
    for user_key in sorted(user_keys):
        if user_key == "_meta":
            continue
        stats["node_users"] += 1
        user_value = node_data.get(user_key)
        user_lower = user_key.lower()
        mapped_user = USER_MAP.get(user_key) or USER_MAP_LOWER.get(user_lower)
        user_is_uuid = is_uuid(user_key)

        if user_is_uuid and mapped_user and mapped_user != user_key:
            stats["node_mapped_users"] += 1
            target_map = node_data.get(mapped_user)
            if not isinstance(target_map, dict):
                target_map = {}
            if isinstance(user_value, dict):
                ts_keys = [key for key in user_value.keys() if isinstance(key, str)]
                for ts_key in sorted(ts_keys):
                    if ts_key == "_meta":
                        continue
                    if ts_key in target_map:
                        continue
                    note_value = user_value.get(ts_key)
                    cleaned, changed = clean_note_value(
                        note_value, drop_fields, minify_json
                    )
                    if cleaned is None:
                        stats["node_invalid_notes"] += 1
                        continue
                    if changed or cleaned is not None:
                        full_key = build_full_update_key(
                            base_path, encoded_key, mapped_user, ts_key
                        )
                        updates[full_key] = cleaned
                        stats["node_updates"] += 1
            else:
                stats["node_non_dict_users"] += 1

            delete_key = build_full_update_key(base_path, encoded_key, user_key, None)
            updates[delete_key] = None
            stats["node_deletes"] += 1
            continue

        if user_is_uuid and (not mapped_user or mapped_user == user_key):
            stats["node_unknown_uuid_users"] += 1
            delete_key = build_full_update_key(base_path, encoded_key, user_key, None)
            updates[delete_key] = None
            stats["node_deletes"] += 1
            continue

        if not isinstance(user_value, dict):
            stats["node_non_dict_users"] += 1
            delete_key = build_full_update_key(base_path, encoded_key, user_key, None)
            updates[delete_key] = None
            stats["node_deletes"] += 1
            continue

        ts_keys = [key for key in user_value.keys() if isinstance(key, str)]
        for ts_key in sorted(ts_keys):
            if ts_key == "_meta":
                continue
            note_value = user_value.get(ts_key)
            cleaned, changed = clean_note_value(note_value, drop_fields, minify_json)
            full_key = build_full_update_key(base_path, encoded_key, user_key, ts_key)
            if cleaned is None:
                updates[full_key] = None
                stats["node_invalid_notes"] += 1
                stats["node_deletes"] += 1
            elif changed:
                updates[full_key] = cleaned
                stats["node_updates"] += 1

    return updates, stats


def run_live_cleanup(
    db_url: str,
    token: str,
    base_path: str,
    drop_fields: set[str],
    minify_json: bool,
    review_first: int,
    review_output: str,
    sleep_ms: int,
) -> int:
    base = normalize_base_path(base_path)
    if not base:
        print("Missing --base-path for live cleanup.")
        return 2
    shallow_url = build_rtdb_url(db_url, base, token, shallow=True)
    status, data, err = http_get_json(shallow_url)
    if status is None or status >= 300 or not isinstance(data, dict):
        detail = err or f"HTTP {status}"
        print(f"Failed to read locationNotes keys: {detail}")
        return 2

    encoded_keys = []
    for key in data.keys():
        if not isinstance(key, str):
            continue
        if key == "_meta":
            continue
        if is_uuid(key):
            continue
        if not is_encoded_key(key):
            continue
        encoded_keys.append(key)

    total_nodes = 0
    total_updates = 0
    total_deletes = 0
    total_invalid_notes = 0
    total_mapped_users = 0
    total_unknown_uuid_users = 0
    total_non_dict_users = 0
    total_skipped_nodes = 0
    review_updates: dict[str, object] = {}
    review_limit = max(0, int(review_first or 0))

    patch_url = build_rtdb_url(db_url, base, token, shallow=False)
    for encoded_key in sorted(encoded_keys):
        total_nodes += 1
        node_url = build_rtdb_url(db_url, f"{base}/{encoded_key}", token, shallow=False)
        status, node_data, err = http_get_json(node_url)
        if status is None or status >= 300:
            detail = err or f"HTTP {status}"
            print(f"[ERROR] {encoded_key}: {detail}")
            return 2
        if node_data is None:
            print(f"[SKIP] {encoded_key}: empty node")
            total_skipped_nodes += 1
            continue
        if not isinstance(node_data, dict):
            print(f"[SKIP] {encoded_key}: non-object node")
            total_skipped_nodes += 1
            continue

        updates, stats = build_live_updates_for_node(
            encoded_key, node_data, base, drop_fields, minify_json
        )
        if not updates:
            continue

        total_updates += stats["node_updates"]
        total_deletes += stats["node_deletes"]
        total_invalid_notes += stats["node_invalid_notes"]
        total_mapped_users += stats["node_mapped_users"]
        total_unknown_uuid_users += stats["node_unknown_uuid_users"]
        total_non_dict_users += stats["node_non_dict_users"]

        if review_limit:
            for key, value in updates.items():
                if len(review_updates) >= review_limit:
                    break
                review_updates[key] = value
            if len(review_updates) >= review_limit:
                break
            continue

        relative_updates = {
            to_relative_update_key(key, base): value for key, value in updates.items()
        }
        status, body = patch_updates(patch_url, relative_updates)
        if status is None or status >= 300:
            print(f"[ERROR] {encoded_key}: PATCH {status} {body}")
            return 2
        if sleep_ms:
            time.sleep(max(0, sleep_ms) / 1000.0)

    if review_limit:
        output_path = Path(review_output)
        dump_json(output_path, review_updates)
        print(
            f"Review updates: {output_path} entries={len(review_updates)} "
            f"nodes_scanned={total_nodes}"
        )
        return 0

    print(
        "Live cleanup done. "
        f"nodes_scanned={total_nodes} updates={total_updates} deletes={total_deletes} "
        f"invalid_notes={total_invalid_notes} mapped_users={total_mapped_users} "
        f"unknown_uuid_users={total_unknown_uuid_users} non_dict_users={total_non_dict_users} "
        f"skipped_nodes={total_skipped_nodes}"
    )
    return 0


def resolve_delete_output_path(
    input_path: Path,
    output_path: Path | None,
    output_dir: Path | None,
    explicit: str,
) -> Path:
    if explicit:
        return Path(explicit)
    if output_path:
        return output_path.with_name(
            f"{output_path.stem}_uuid_deletes{output_path.suffix}"
        )
    base_dir = output_dir or input_path
    return base_dir / "uuid_user_deletes.json"


def main() -> int:
    args = parse_args()
    if args.live:
        if not args.db_url:
            print("Missing --db-url for live cleanup.")
            return 1
        token = resolve_token(args.token)
        drop_fields = set(DROP_FIELDS)
        if args.drop_note_keys:
            for field in args.drop_note_keys.split(","):
                field = field.strip()
                if field:
                    drop_fields.add(field)
        return run_live_cleanup(
            db_url=args.db_url,
            token=token,
            base_path=args.base_path,
            drop_fields=drop_fields,
            minify_json=args.minify_json,
            review_first=args.review_first,
            review_output=args.review_output,
            sleep_ms=args.sleep_ms,
        )

    if not args.input:
        print("Missing --input. Provide --input or use --live with --db-url.")
        return 1

    input_path = Path(args.input)

    if not input_path.exists():
        print(f"Input not found: {input_path}")
        return 1

    drop_unknown_uuids = bool(args.drop_unknown_uuids or args.emit_unknown_uuid_deletes)
    emit_unknown_uuid_deletes = bool(args.emit_unknown_uuid_deletes)

    drop_fields = set(DROP_FIELDS)
    if args.drop_note_keys:
        for field in args.drop_note_keys.split(","):
            field = field.strip()
            if field:
                drop_fields.add(field)

    delete_updates: dict[str, object] = {}
    delete_output: Path | None = None
    output_path: Path | None = None
    output_dir: Path | None = None

    if input_path.is_dir():
        output_dir = input_path if args.in_place else Path(
            args.output_dir or f"{input_path}_cleaned"
        )
        stats_list, delete_updates = process_directory(
            input_path,
            output_dir,
            args.in_place,
            drop_unknown_uuids,
            drop_fields,
            args.minify_json,
            args.emit_uuid_deletes,
            emit_unknown_uuid_deletes,
        )
    else:
        data = load_json(input_path)
        if isinstance(data, dict) and "chunks" in data:
            output_path = resolve_output_path(input_path, args.output)
            output_dir = (
                input_path.parent
                if args.in_place
                else Path(args.output_dir or f"{output_path.stem}_chunks")
            )
            stats_list, delete_updates = process_manifest(
                input_path,
                output_path,
                output_dir,
                args.in_place,
                drop_unknown_uuids,
                drop_fields,
                args.minify_json,
                args.emit_uuid_deletes,
                emit_unknown_uuid_deletes,
            )
        else:
            locationnotes_root = extract_locationnotes_root(data)
            output_path = (
                input_path if args.in_place else resolve_output_path(input_path, args.output)
            )
            if locationnotes_root is not None:
                stats, delete_updates = process_locationnotes_export(
                    locationnotes_root,
                    output_path,
                    args.base_path,
                    drop_unknown_uuids,
                    drop_fields,
                    args.minify_json,
                    args.emit_uuid_deletes,
                    emit_unknown_uuid_deletes,
                )
            else:
                stats, delete_updates = process_updates_file(
                    input_path,
                    output_path,
                    args.in_place,
                    drop_unknown_uuids,
                    drop_fields,
                    args.minify_json,
                    args.emit_uuid_deletes,
                    emit_unknown_uuid_deletes,
                )
            stats_list = [stats]

    if (args.emit_uuid_deletes or emit_unknown_uuid_deletes) and delete_updates:
        delete_output = resolve_delete_output_path(
            input_path, output_path, output_dir, args.delete_output
        )
        dump_json(delete_output, delete_updates)

    print("Done.")
    for stats in stats_list:
        line = (
            f"{stats.get('file')}: entries={stats.get('entries')}, "
            f"mapped_users={stats.get('mapped_users')}, "
            f"unknown_uuids={stats.get('unknown_uuids')}, "
            f"dropped_unknown_uuids={stats.get('dropped_unknown_uuids')}, "
            f"notes_changed={stats.get('notes_changed')}, "
            f"fields_removed={stats.get('fields_removed')}, "
            f"collisions={stats.get('collisions')}, "
            f"uuid_deletes={stats.get('uuid_deletes')}"
        )
        if "unknown_uuid_deletes" in stats:
            line += f", unknown_uuid_deletes={stats.get('unknown_uuid_deletes')}"
        if "export_roots" in stats:
            line += (
                f", export_roots={stats.get('export_roots')}, "
                f"export_encoded_roots={stats.get('export_encoded_roots')}, "
                f"export_entries={stats.get('export_entries')}, "
                f"export_skipped_roots={stats.get('export_skipped_roots')}, "
                f"export_skipped_entries={stats.get('export_skipped_entries')}"
            )
        print(line)
    if delete_output:
        print(f"UUID delete updates: {delete_output} entries={len(delete_updates)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
