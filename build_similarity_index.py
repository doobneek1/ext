import argparse
import difflib
import html
import json
import re
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator, Optional, Tuple
UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
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
ALLOWED_FIELDS = {
    "services.description",
    "event_related_info.information",
}
RECONFIRM_GAP_DAYS = 180
RECONFIRM_GAP_MS = RECONFIRM_GAP_DAYS * 86400000
CONFIRM_DEDUPE_WINDOW_MS = 2 * 60 * 1000
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a similarity index for locationNotes edits.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python build_similarity_index.py --input locationNotes.json --output similarity_index.json\n"
            "  python build_similarity_index.py --input rtdb_updates_manifest.json \\\n"
            "    --output similarity_index.json --min-similarity 0.88\n"
            "  python build_similarity_index.py --input locationNotes.json --output similarity_index.json \\\n"
            "    --resume --checkpoint similarity_index.checkpoint.json\n"
        ),
    )
    parser.add_argument(
        "--input",
        required=True,
        help="LocationNotes JSON, updates map, manifest JSON, or chunk directory.",
    )
    parser.add_argument(
        "--output",
        required=False,
        default="",
        help="Path to write similarity index JSON (required unless --playback-only).",
    )
    parser.add_argument(
        "--base-path",
        default="/locationNotes",
        help="Base path prefix for updates maps (default: /locationNotes).",
    )
    parser.add_argument(
        "--min-similarity",
        type=float,
        default=0.88,
        help="Minimum similarity ratio to record (default: 0.88).",
    )
    parser.add_argument(
        "--match-threshold",
        type=float,
        default=0.90,
        help="Similarity ratio for non-review matches (default: 0.90).",
    )
    parser.add_argument(
        "--auto-threshold",
        type=float,
        default=0.95,
        help="Similarity ratio for auto-labeled borrowed matches (default: 0.95).",
    )
    parser.add_argument(
        "--bucket-size",
        type=int,
        default=80,
        help="Length bucket size for candidate pruning (default: 80).",
    )
    parser.add_argument(
        "--length-ratio-min",
        type=float,
        default=0.7,
        help="Minimum length ratio for candidate pruning (default: 0.70).",
    )
    parser.add_argument(
        "--same-field-only",
        action="store_true",
        help="Only compare candidates from the same field key (faster).",
    )
    parser.add_argument(
        "--max-candidates",
        type=int,
        default=0,
        help="Limit candidate comparisons per event (0 = no limit).",
    )
    parser.add_argument(
        "--resume",
        dest="resume",
        action="store_true",
        help="Resume from checkpoint and cached events if available (default when cache exists).",
    )
    parser.add_argument(
        "--no-resume",
        dest="resume",
        action="store_false",
        help="Ignore existing checkpoint/events cache and rebuild from scratch.",
    )
    parser.set_defaults(resume=None)
    parser.add_argument(
        "--checkpoint",
        default="",
        help="Checkpoint path (default: <output>.checkpoint.json).",
    )
    parser.add_argument(
        "--events-cache",
        default="",
        help="Events cache path for resume (default: <output>.events.json).",
    )
    parser.add_argument(
        "--playback-output",
        default="",
        help="Optional playback index output JSON (initial text + deltas for UI animation).",
    )
    parser.add_argument(
        "--playback-only",
        action="store_true",
        help="Generate playback index only (skip similarity matching/output).",
    )
    parser.add_argument(
        "--playback-fields",
        default="",
        help="Comma-separated field keys to include in playback (default: allowed fields).",
    )
    parser.add_argument(
        "--playback-include-after",
        action="store_true",
        help="Include full after text in playback events (default: deltas only).",
    )
    parser.add_argument(
        "--progress-every",
        type=int,
        default=5000,
        help="Print progress every N events (default: 5000).",
    )
    parser.add_argument(
        "--checkpoint-every",
        type=int,
        default=2000,
        help="Save checkpoint every N matched events (default: 2000).",
    )
    return parser.parse_args()
def parse_epoch_ms(value: object) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        try:
            return int(float(text))
        except ValueError:
            return None
def map_user(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    mapped = USER_MAP.get(text) or USER_MAP_LOWER.get(text.lower())
    return mapped or text
def normalize_base_path(value: str) -> str:
    if not value:
        return ""
    return f"/{value.strip('/')}"
def load_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)
def extract_locationnotes_root(data: object) -> Optional[dict]:
    if not isinstance(data, dict):
        return None
    if "locationNotes" in data and isinstance(data["locationNotes"], dict):
        return data["locationNotes"]
    if "/locationNotes" in data and isinstance(data["/locationNotes"], dict):
        return data["/locationNotes"]
    for key, value in data.items():
        if isinstance(key, str) and key.startswith("%2F") and isinstance(value, dict):
            return data
    return None
def iter_entries_from_nested(
    root: dict,
) -> Generator[Tuple[str, str, str, object], None, None]:
    for encoded_key, user_map in root.items():
        if not isinstance(encoded_key, str) or not encoded_key.startswith("%2F"):
            continue
        if not isinstance(user_map, dict):
            continue
        for user, ts_map in user_map.items():
            if not isinstance(user, str) or not isinstance(ts_map, dict):
                continue
            for timestamp, payload in ts_map.items():
                if timestamp == "_meta":
                    continue
                yield encoded_key, user, str(timestamp), payload
def iter_update_map(data: object) -> Generator[Tuple[str, object], None, None]:
    if not isinstance(data, dict):
        raise ValueError("Updates data is not an object.")
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
def extract_note_key(key: str, base_path: str) -> str:
    base = normalize_base_path(base_path)
    normalized = f"/{key.strip('/')}"
    if base and normalized.startswith(base + "/"):
        return normalized[len(base) + 1 :]
    if base and normalized == base:
        return ""
    return normalized.lstrip("/")
def decode_note_key(note_key: str) -> Tuple[str, str, str]:
    parts = note_key.strip("/").split("/")
    if len(parts) < 3:
        return "", "", ""
    date_key = parts[-1]
    user_name = parts[-2]
    encoded_key = "/".join(parts[:-2])
    return encoded_key, user_name, date_key
def parse_note_payload(value: object) -> Optional[dict]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, dict):
            return parsed
    return None
def load_entries(
    input_path: Path, base_path: str
) -> Generator[Tuple[str, str, int, dict], None, None]:
    if not input_path.is_dir():
        data = load_json(input_path)
        location_root = extract_locationnotes_root(data)
        if location_root is not None:
            for encoded_key, user, timestamp, payload in iter_entries_from_nested(
                location_root
            ):
                epoch_ms = parse_epoch_ms(timestamp)
                if epoch_ms is None:
                    continue
                note = parse_note_payload(payload)
                if note is None:
                    continue
                yield encoded_key, user, epoch_ms, note
            return
    update_iter = iter_updates(input_path) if input_path.is_dir() else iter_updates_from_file(input_path)
    for key, payload in update_iter:
        note_key = extract_note_key(key, base_path)
        encoded_key, user, timestamp = decode_note_key(note_key)
        if not encoded_key or not user or not timestamp:
            continue
        epoch_ms = parse_epoch_ms(timestamp)
        if epoch_ms is None:
            continue
        note = parse_note_payload(payload)
        if note is None:
            continue
        yield encoded_key, user, epoch_ms, note
def apply_text_delta(prev_text: str, delta: dict) -> Optional[str]:
    if not isinstance(delta, dict) or delta.get("kind") != "text-diff-v1":
        return None
    ops = delta.get("ops")
    if not isinstance(ops, list):
        return None
    text = prev_text
    try:
        for op in sorted(ops, key=lambda item: item[1], reverse=True):
            if not op:
                continue
            action = op[0]
            if action == "delete" and len(op) == 3:
                _, i1, i2 = op
                text = text[:i1] + text[i2:]
            elif action == "insert" and len(op) == 3:
                _, pos, fragment = op
                text = text[:pos] + fragment + text[pos:]
            elif action == "replace" and len(op) == 4:
                _, i1, i2, fragment = op
                text = text[:i1] + fragment + text[i2:]
    except Exception:
        return None
    return text
def build_text_delta_ops(prev_text: str, new_text: str) -> list[list[object]]:
    matcher = difflib.SequenceMatcher(None, prev_text, new_text)
    ops: list[list[object]] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        if tag == "delete":
            ops.append(["delete", i1, i2])
        elif tag == "insert":
            ops.append(["insert", i1, new_text[j1:j2]])
        else:
            ops.append(["replace", i1, i2, new_text[j1:j2]])
    return ops
def build_text_delta(prev_text: str, new_text: str) -> dict:
    return {"kind": "text-diff-v1", "ops": build_text_delta_ops(prev_text, new_text)}
def build_field_key(note: dict) -> str:
    field_key = str(note.get("fieldKey") or note.get("field_key") or "").strip()
    if field_key:
        return field_key
    resource_table = str(
        note.get("resourceTable")
        or note.get("resource_table")
        or note.get("resource")
        or note.get("table")
        or ""
    ).strip()
    field = str(
        note.get("field")
        or note.get("field_name")
        or note.get("fieldName")
        or ""
    ).strip()
    if resource_table and field:
        return f"{resource_table}.{field}"
    if resource_table:
        return resource_table
    return field or "unknown"
def event_key_for(
    epoch_ms: int,
    user: str,
    field_key: str,
    location_id: str = "",
    service_id: str = "",
) -> str:
    user_name = map_user(user)
    parts = [str(epoch_ms), user_name, field_key]
    if location_id:
        parts.append(location_id)
    if service_id:
        parts.append(service_id)
    return "|".join(parts)
def extract_location_id(path: str) -> str:
    parts = path.strip("/").split("/")
    for idx, part in enumerate(parts[:-1]):
        if part == "location":
            candidate = parts[idx + 1]
            if UUID_RE.match(candidate):
                return candidate
    return ""
def extract_service_id(path: str) -> str:
    parts = path.strip("/").split("/")
    for idx, part in enumerate(parts[:-1]):
        if part == "services":
            candidate = parts[idx + 1]
            if UUID_RE.match(candidate):
                return candidate
    return ""
URL_RE = re.compile(r"https?://\S+")
EMAIL_RE = re.compile(r"\b[\w\.-]+@[\w\.-]+\.\w+\b")
PHONE_RE = re.compile(r"\b(?:\+?1[\s\-\(\)]*)?(?:\(?\d{3}\)?[\s\-\)]*)\d{3}[\s\-]*\d{4}\b")
TAG_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")
def normalize_similarity_text(text: str) -> str:
    cleaned = html.unescape(text or "")
    cleaned = TAG_RE.sub(" ", cleaned)
    cleaned = cleaned.replace("mailto:", " ")
    cleaned = cleaned.replace("tel:", " ")
    cleaned = cleaned.lower()
    cleaned = URL_RE.sub("<URL>", cleaned)
    cleaned = EMAIL_RE.sub("<EMAIL>", cleaned)
    cleaned = PHONE_RE.sub("<PHONE>", cleaned)
    cleaned = WHITESPACE_RE.sub(" ", cleaned).strip()
    return cleaned
def parse_playback_fields(value: str, include_all_by_default: bool = False) -> Optional[set[str]]:
    if not value:
        return None if include_all_by_default else set(ALLOWED_FIELDS)
    lowered = value.strip().lower()
    if lowered in {"all", "*"}:
        return None
    fields = {item.strip() for item in value.split(",") if item.strip()}
    return fields or (None if include_all_by_default else set(ALLOWED_FIELDS))
def classify_note_kind(note: dict, has_text_payload: bool) -> str:
    if has_text_payload:
        return "edit"
    summary = str(note.get("summary") or note.get("note") or "").strip().lower()
    if summary.startswith("seconded"):
        return "seconded"
    if summary.startswith("reconfirmed"):
        return "reconfirmed"
    return "confirm"
def coerce_playback_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=True)
    except Exception:
        return str(value)
def encode_playback_field_key(field_key: str) -> str:
    return urllib.parse.quote(field_key, safe="").replace(".", "%2E")
def default_checkpoint_path(output: str) -> str:
    return f"{output}.checkpoint.json"
def default_events_cache_path(output: str) -> str:
    return f"{output}.events.json"
def load_checkpoint(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return {}
    return data
def save_checkpoint(path: Path, payload: dict) -> None:
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=True) + "\n", encoding="utf-8")
    tmp_path.replace(path)
def load_events_cache(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, dict):
        events = payload.get("events")
        if isinstance(events, list):
            return events
    if isinstance(payload, list):
        return payload
    return []
def save_events_cache(path: Path, events: list[dict]) -> None:
    payload = {
        "schemaVersion": "1.1",
        "events": events,
    }
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=True) + "\n", encoding="utf-8")
    tmp_path.replace(path)
def normalize_cached_events(events: list[dict]) -> list[dict]:
    normalized: list[dict] = []
    for event in events:
        if not isinstance(event, dict):
            continue
        timestamp_ms = parse_epoch_ms(event.get("timestampMs"))
        if timestamp_ms is None:
            continue
        field_key = str(event.get("fieldKey") or "")
        if not field_key:
            continue
        user = map_user(event.get("user"))
        location_id = str(event.get("locationId") or "")
        if not location_id:
            page_path = event.get("pagePath")
            if page_path:
                location_id = extract_location_id(str(page_path))
            else:
                encoded_key = event.get("encodedKey")
                if encoded_key:
                    decoded = urllib.parse.unquote(str(encoded_key))
                    location_id = extract_location_id(decoded)
        normalized_text = event.get("normalizedText")
        if normalized_text is None:
            normalized_text = ""
        normalized_event = {
            "timestampMs": timestamp_ms,
            "locationId": location_id,
            "fieldKey": field_key,
            "user": user,
            "normalizedText": normalized_text,
        }
        service_id = str(event.get("serviceId") or "")
        if not service_id and field_key.startswith("services."):
            page_path = event.get("pagePath")
            if page_path:
                service_id = extract_service_id(str(page_path))
            else:
                encoded_key = event.get("encodedKey")
                if encoded_key:
                    decoded = urllib.parse.unquote(str(encoded_key))
                    service_id = extract_service_id(decoded)
        if service_id:
            normalized_event["serviceId"] = service_id
        normalized.append(normalized_event)
    return normalized
def build_checkpoint_payload(
    last_index: int, matches: dict, seen_pairs: set[tuple[str, str]]
) -> dict:
    return {
        "lastIndex": last_index,
        "matches": matches,
        "seenPairs": [f"{a}|{b}" for a, b in sorted(seen_pairs)],
    }
def build_playback_pages(
    entries_by_key: dict[str, list[dict]],
    playback_fields: Optional[set[str]],
    include_after: bool,
) -> dict[str, dict]:
    pages: dict[str, dict] = {}
    for encoded_key, entries in entries_by_key.items():
        entries.sort(key=lambda item: item["epoch_ms"])
        decoded_path = urllib.parse.unquote(encoded_key)
        location_id = extract_location_id(decoded_path)
        service_id = extract_service_id(decoded_path)
        field_states: dict[str, dict] = {}
        for entry in entries:
            note = entry["note"]
            field_key = build_field_key(note)
            if playback_fields is not None and field_key not in playback_fields:
                continue
            state = field_states.setdefault(
                field_key,
                {
                    "current_text": None,
                    "initial": None,
                    "events": [],
                    "last_text_change_ms": None,
                    "last_event_index": None,
                },
            )
            prev_text = state["current_text"]
            has_after = "after" in note
            has_delta = "delta" in note
            has_text_payload = has_after or has_delta
            new_text = None
            if has_after:
                new_text = coerce_playback_text(note.get("after"))
            elif has_delta:
                base_text = prev_text if isinstance(prev_text, str) else coerce_playback_text(prev_text)
                new_text = apply_text_delta(base_text, note.get("delta"))
                if new_text is None:
                    new_text = base_text
            elif prev_text is not None:
                new_text = prev_text if isinstance(prev_text, str) else coerce_playback_text(prev_text)
            if new_text is None:
                continue
            if not isinstance(new_text, str):
                new_text = coerce_playback_text(new_text)
            has_prev_text = isinstance(prev_text, str)
            text_changed = isinstance(new_text, str) and (not has_prev_text or new_text != prev_text)
            user = map_user(entry["user"])
            event_id = event_key_for(
                entry["epoch_ms"],
                user,
                field_key,
                location_id,
                service_id if field_key.startswith("services.") else "",
            )
            kind = classify_note_kind(note, has_text_payload)
            if kind == "edit" and not text_changed and has_prev_text:
                kind = "confirm"
            if kind == "confirm":
                last_change = state.get("last_text_change_ms")
                if last_change is not None and entry["epoch_ms"] - last_change >= RECONFIRM_GAP_MS:
                    kind = "reconfirmed"
            summary = note.get("summary") or note.get("note") or ""
            event_payload = {
                "eventId": event_id,
                "timestampMs": entry["epoch_ms"],
                "user": user,
                "field": note.get("field"),
                "resourceTable": note.get("resourceTable"),
                "action": note.get("action"),
                "label": note.get("label"),
                "summary": summary,
                "kind": kind,
                "fieldKey": field_key,
                "pagePath": decoded_path,
                "locationId": location_id or None,
            }
            if service_id and field_key.startswith("services."):
                event_payload["serviceId"] = service_id
            if state["initial"] is None:
                initial_event = dict(event_payload)
                if include_after:
                    initial_event["after"] = new_text
                state["initial"] = {"text": new_text, "event": initial_event}
                state["current_text"] = new_text
                state["last_text_change_ms"] = entry["epoch_ms"]
                continue
            delta = build_text_delta(
                prev_text if isinstance(prev_text, str) else "",
                new_text,
            )
            if has_delta or has_after or text_changed:
                event_payload["delta"] = delta
            if include_after:
                event_payload["after"] = new_text
            if not text_changed:
                last_index = state.get("last_event_index")
                if last_index is not None:
                    last_event = state["events"][last_index]
                    if (
                        last_event
                        and last_event.get("user") == user
                        and last_event.get("fieldKey") == field_key
                        and last_event.get("kind") == kind
                        and entry["epoch_ms"] - last_event.get("timestampMs", 0) <= CONFIRM_DEDUPE_WINDOW_MS
                    ):
                        state["events"][last_index] = event_payload
                        continue
            state["events"].append(event_payload)
            state["last_event_index"] = len(state["events"]) - 1
            if text_changed:
                state["current_text"] = new_text
                state["last_text_change_ms"] = entry["epoch_ms"]
        fields_payload: dict[str, dict] = {}
        for field_key, state in field_states.items():
            if not state.get("initial"):
                continue
            encoded_field_key = encode_playback_field_key(field_key)
            fields_payload[encoded_field_key] = {
                "fieldKey": field_key,
                "initial": state["initial"],
                "events": state["events"],
            }
        if fields_payload:
            pages[encoded_key] = {
                "pagePath": decoded_path,
                "locationId": location_id or None,
                "serviceId": service_id or None,
                "fields": fields_payload,
            }
    return pages
def main() -> int:
    args = parse_args()
    if not args.playback_only and not args.output:
        print("Missing --output (required unless --playback-only).")
        return 1
    if args.playback_only and not args.playback_output:
        print("Playback-only mode requires --playback-output.")
        return 1
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Input not found: {input_path}")
        return 1
    if args.playback_only:
        entries_by_key: dict[str, list[dict]] = {}
        entries_seen = 0
        for encoded_key, user, epoch_ms, note in load_entries(input_path, args.base_path):
            entries_seen += 1
            entries_by_key.setdefault(encoded_key, []).append(
                {
                    "encoded_key": encoded_key,
                    "user": user,
                    "epoch_ms": epoch_ms,
                    "note": note,
                }
            )
            if args.progress_every and entries_seen % args.progress_every == 0:
                print(f"Scanned {entries_seen} entries...")
        playback_fields = parse_playback_fields(
            args.playback_fields,
            include_all_by_default=True,
        )
        playback_pages = build_playback_pages(
            entries_by_key,
            playback_fields,
            args.playback_include_after,
        )
        playback_output = {
            "schemaVersion": "1.0",
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "pages": playback_pages,
        }
        Path(args.playback_output).write_text(
            json.dumps(playback_output, ensure_ascii=True) + "\n", encoding="utf-8"
        )
        print(f"Wrote playback index: {args.playback_output}")
        return 0
    checkpoint_path = Path(
        args.checkpoint or default_checkpoint_path(args.output)
    )
    events_cache_path = Path(
        args.events_cache or default_events_cache_path(args.output)
    )
    resume_enabled = args.resume
    if resume_enabled is None:
        resume_enabled = checkpoint_path.exists() or events_cache_path.exists()
        if resume_enabled:
            print("Auto-resume enabled (cache/checkpoint detected).")
    events: list[dict] = []
    entries_by_key: dict[str, list[dict]] = {}
    playback_fields = parse_playback_fields(
        args.playback_fields,
        include_all_by_default=bool(args.playback_output),
    )
    needs_entries_by_key = bool(args.playback_output)
    if resume_enabled and events_cache_path.exists() and not needs_entries_by_key:
        events = load_events_cache(events_cache_path)
        events = normalize_cached_events(events)
        events.sort(key=lambda item: item.get("timestampMs", 0))
        print(f"Loaded events cache: {events_cache_path} ({len(events)} events)")
    else:
        entries_seen = 0
        for encoded_key, user, epoch_ms, note in load_entries(input_path, args.base_path):
            entries_seen += 1
            entries_by_key.setdefault(encoded_key, []).append(
                {
                    "encoded_key": encoded_key,
                    "user": user,
                    "epoch_ms": epoch_ms,
                    "note": note,
                }
            )
            if args.progress_every and entries_seen % args.progress_every == 0:
                print(f"Scanned {entries_seen} entries...")
        events_seen = 0
        for encoded_key, entries in entries_by_key.items():
            entries.sort(key=lambda item: item["epoch_ms"])
            decoded_path = urllib.parse.unquote(encoded_key)
            location_id = extract_location_id(decoded_path)
            service_id = extract_service_id(decoded_path)
            field_states: dict[str, dict] = {}
            for entry in entries:
                note = entry["note"]
                field_key = build_field_key(note)
                if field_key not in ALLOWED_FIELDS:
                    continue
                if "after" not in note and "delta" not in note:
                    continue
                state = field_states.setdefault(
                    field_key, {"version": 0, "current_text": None}
                )
                prev_text = state["current_text"]
                new_text = None
                if "after" in note:
                    new_text = note.get("after")
                elif isinstance(prev_text, str):
                    new_text = apply_text_delta(prev_text, note.get("delta"))
                if not isinstance(new_text, str) or not new_text.strip():
                    state["current_text"] = new_text
                    state["version"] += 1
                    continue
                version = state["version"] + 1
                user = map_user(entry["user"])
                normalized_text = normalize_similarity_text(new_text)
                event = {
                    "timestampMs": entry["epoch_ms"],
                    "locationId": location_id,
                    "fieldKey": field_key,
                    "user": user,
                    "normalizedText": normalized_text,
                }
                if service_id and field_key.startswith("services."):
                    event["serviceId"] = service_id
                events.append(event)
                state["current_text"] = new_text
                state["version"] = version
                events_seen += 1
                if args.progress_every and events_seen % args.progress_every == 0:
                    print(f"Built {events_seen} events...")
        events.sort(key=lambda item: item["timestampMs"])
        save_events_cache(events_cache_path, events)
        print(f"Wrote events cache: {events_cache_path} ({len(events)} events)")
    buckets: dict[int, list[int]] = {}
    matches: dict[str, dict] = {field_key: {} for field_key in ALLOWED_FIELDS}
    seen_pairs: set[tuple[str, str]] = set()
    bucket_size = max(10, args.bucket_size)
    start_index = 0
    if resume_enabled and checkpoint_path.exists():
        checkpoint = load_checkpoint(checkpoint_path)
        start_index = int(checkpoint.get("lastIndex", -1)) + 1
        loaded_matches = checkpoint.get("matches", {})
        if isinstance(loaded_matches, dict):
            for field_key, match_map in loaded_matches.items():
                if field_key not in matches:
                    matches[field_key] = {}
                if isinstance(match_map, dict):
                    matches[field_key].update(match_map)
        loaded_pairs = checkpoint.get("seenPairs", [])
        if isinstance(loaded_pairs, list):
            for item in loaded_pairs:
                if isinstance(item, list) and len(item) == 2:
                    seen_pairs.add((str(item[0]), str(item[1])))
                elif isinstance(item, str) and "|" in item:
                    left, right = item.split("|", 1)
                    seen_pairs.add((left, right))
        if start_index > 0:
            print(f"Resuming from event index {start_index}/{len(events)}")
            for idx in range(0, min(start_index, len(events))):
                text = events[idx]["normalizedText"]
                bucket = len(text) // bucket_size if text is not None else 0
                buckets.setdefault(bucket, []).append(idx)
                if args.progress_every and (idx + 1) % args.progress_every == 0:
                    print(f"Rebuilt buckets for {idx + 1} events...")
    processed_since_checkpoint = 0
    total_events = len(events)
    last_completed_index = start_index - 1
    try:
        for idx in range(start_index, total_events):
            event = events[idx]
            target_text = event["normalizedText"]
            target_len = len(target_text)
            if not target_text or not event["locationId"]:
                bucket = target_len // bucket_size
                buckets.setdefault(bucket, []).append(idx)
                last_completed_index = idx
                continue
            bucket = target_len // bucket_size
            candidate_indices: list[int] = []
            for offset in (-1, 0, 1):
                candidate_indices.extend(buckets.get(bucket + offset, []))
            if args.max_candidates and len(candidate_indices) > args.max_candidates:
                candidate_indices = candidate_indices[-args.max_candidates :]
            best = None
            best_ratio = 0.0
            best_source = None
            for cand_idx in candidate_indices:
                source = events[cand_idx]
                if not source["locationId"] or source["locationId"] == event["locationId"]:
                    continue
                if args.same_field_only and source["fieldKey"] != event["fieldKey"]:
                    continue
                source_text = source["normalizedText"]
                if not source_text:
                    continue
                if source_text == target_text:
                    best_ratio = 1.0
                    best_source = source
                    best = 1.0
                    break
                min_len = min(len(source_text), target_len)
                max_len = max(len(source_text), target_len)
                if max_len and (min_len / max_len) < args.length_ratio_min:
                    continue
                ratio = difflib.SequenceMatcher(None, target_text, source_text).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_source = source
                    best = ratio
                if best_ratio >= 1.0:
                    break
                if best is not None and best_ratio >= args.min_similarity and best_source:
                    pair_key = (best_source["locationId"], event["locationId"])
                    if pair_key not in seen_pairs:
                        match_type = "review"
                        confidence_band = "review"
                        if best_ratio >= args.auto_threshold:
                            match_type = "borrowed_from"
                            confidence_band = "high"
                        elif best_ratio >= args.match_threshold:
                            match_type = "similar_to"
                            confidence_band = "medium"
                        match_scope = (
                            "cross-field"
                            if best_source["fieldKey"] != event["fieldKey"]
                            else "same-field"
                        )
                        source_payload = {
                            "locationId": best_source["locationId"],
                            "timestampMs": best_source["timestampMs"],
                            "user": map_user(best_source["user"]),
                            "fieldKey": best_source["fieldKey"],
                        }
                        if best_source.get("serviceId"):
                            source_payload["serviceId"] = best_source["serviceId"]
                        match_info = {
                            "matchType": match_type,
                            "confidence": round(best_ratio, 4),
                            "confidenceBand": confidence_band,
                            "matchScope": match_scope,
                            "source": source_payload,
                        }
                        field_key = event["fieldKey"]
                        event_key = event_key_for(
                            event.get("timestampMs") or 0,
                            event.get("user") or "",
                            field_key,
                            str(event.get("locationId") or ""),
                            str(event.get("serviceId") or ""),
                        )
                        matches[field_key][event_key] = match_info
                        seen_pairs.add(pair_key)
            buckets.setdefault(bucket, []).append(idx)
            last_completed_index = idx
            processed_since_checkpoint += 1
            if args.checkpoint_every and processed_since_checkpoint >= args.checkpoint_every:
                checkpoint_payload = build_checkpoint_payload(
                    idx, matches, seen_pairs
                )
                save_checkpoint(checkpoint_path, checkpoint_payload)
                processed_since_checkpoint = 0
                print(f"Checkpoint saved at index {idx} -> {checkpoint_path}")
            if args.progress_every and (idx + 1) % args.progress_every == 0:
                percent = (idx + 1) / total_events * 100 if total_events else 100
                print(f"Matched {idx + 1}/{total_events} events ({percent:.1f}%)")
    except KeyboardInterrupt:
        if last_completed_index >= start_index:
            checkpoint_payload = build_checkpoint_payload(
                last_completed_index, matches, seen_pairs
            )
            save_checkpoint(checkpoint_path, checkpoint_payload)
            print(
                "Interrupted. Checkpoint saved at index "
                f"{last_completed_index} -> {checkpoint_path}"
            )
        raise
    except Exception:
        if last_completed_index >= start_index:
            checkpoint_payload = build_checkpoint_payload(
                last_completed_index, matches, seen_pairs
            )
            save_checkpoint(checkpoint_path, checkpoint_payload)
            print(
                "Error encountered. Checkpoint saved at index "
                f"{last_completed_index} -> {checkpoint_path}"
            )
        raise
    output = {
        "schemaVersion": "1.1",
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "fields": {
            field_key: {"matches": match_map} for field_key, match_map in matches.items()
        },
        "thresholds": {
            "minSimilarity": args.min_similarity,
            "matchThreshold": args.match_threshold,
            "autoThreshold": args.auto_threshold,
        },
    }
    Path(args.output).write_text(
        json.dumps(output, ensure_ascii=True, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Wrote similarity index: {args.output}")
    if args.playback_output:
        if not entries_by_key:
            print("Playback output requested but no entries loaded; re-run without resume cache.")
            return 1
        playback_pages = build_playback_pages(
            entries_by_key,
            playback_fields,
            args.playback_include_after,
        )
        playback_output = {
            "schemaVersion": "1.0",
            "generatedAt": output["generatedAt"],
            "pages": playback_pages,
        }
        Path(args.playback_output).write_text(
            json.dumps(playback_output, ensure_ascii=True) + "\n", encoding="utf-8"
        )
        print(f"Wrote playback index: {args.playback_output}")
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
