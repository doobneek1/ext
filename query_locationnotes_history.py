import argparse
import difflib
import json
import re
import sys
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
    "ec712c39-d8aa-4c08-9a17-1f66bddb3605": "extension",
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
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Query locationNotes history and print conversational summaries.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python query_locationnotes_history.py --input locationNotes.json \\\n"
            "    --url \"https://gogetta.nyc/team/location/<uuid>/services/<uuid>/description\"\n"
            "  python query_locationnotes_history.py --input rtdb_updates_manifest.json \\\n"
            "    --url \"/team/location/<uuid>/questions/location-name\"\n"
            "  python query_locationnotes_history.py --input locationNotes_chunks \\\n"
            "    --url \"%2Fteam%2Flocation%2F<uuid>%2Fservices%2F<uuid>%2Fdescription\" --simpler\n"
            "  python query_locationnotes_history.py --input locationNotes.json --format json --diff \\\n"
            "    --similarity-index similarity_index.json --url \"/team/location/<uuid>\"\n"
        ),
    )
    parser.add_argument(
        "--input",
        required=True,
        help="LocationNotes JSON, updates map, manifest JSON, or chunk directory.",
    )
    parser.add_argument(
        "--url",
        default="",
        help="Target page URL, decoded path, or encoded key.",
    )
    parser.add_argument(
        "target",
        nargs="?",
        default="",
        help="Optional positional target (URL/path/encoded key) if --url omitted.",
    )
    parser.add_argument(
        "--base-path",
        default="/locationNotes",
        help="Base path prefix for updates maps (default: /locationNotes).",
    )
    parser.add_argument(
        "--simpler",
        "--simple",
        dest="simple",
        action="store_true",
        help="Use relative time phrasing instead of full timestamps.",
    )
    parser.add_argument(
        "--format",
        choices=["text", "json"],
        default="text",
        help="Output format (text or json).",
    )
    parser.add_argument(
        "--diff",
        action="store_true",
        help="Include diff segments in JSON output.",
    )
    parser.add_argument(
        "--similarity-index",
        default="",
        help="Optional similarity index JSON to annotate matches.",
    )
    parser.add_argument(
        "--max-suggestions",
        type=int,
        default=5,
        help="Max suggestions per category when no direct match is found.",
    )
    parser.add_argument(
        "--progress-every",
        type=int,
        default=50000,
        help="Print scan progress every N entries (default: 50000, 0 disables).",
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
def build_field_key(note: dict) -> str:
    resource_table = str(note.get("resourceTable") or "").strip()
    field = str(note.get("field") or "").strip()
    if resource_table and field:
        return f"{resource_table}.{field}"
    if resource_table:
        return resource_table
    return field or "unknown"
def note_has_value(note: dict) -> bool:
    return "after" in note or "delta" in note
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
def build_diff_segments(prev_text: str, new_text: str) -> list[dict]:
    segments: list[dict] = []
    matcher = difflib.SequenceMatcher(None, prev_text, new_text)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            segments.append(
                {
                    "op": "equal",
                    "text": new_text[j1:j2],
                    "a_start": i1,
                    "a_end": i2,
                    "b_start": j1,
                    "b_end": j2,
                }
            )
        elif tag == "delete":
            segments.append(
                {
                    "op": "delete",
                    "text": prev_text[i1:i2],
                    "a_start": i1,
                    "a_end": i2,
                    "b_start": None,
                    "b_end": None,
                }
            )
        elif tag == "insert":
            segments.append(
                {
                    "op": "insert",
                    "text": new_text[j1:j2],
                    "a_start": None,
                    "a_end": None,
                    "b_start": j1,
                    "b_end": j2,
                }
            )
        else:
            if i1 != i2:
                segments.append(
                    {
                        "op": "delete",
                        "text": prev_text[i1:i2],
                        "a_start": i1,
                        "a_end": i2,
                        "b_start": None,
                        "b_end": None,
                    }
                )
            if j1 != j2:
                segments.append(
                    {
                        "op": "insert",
                        "text": new_text[j1:j2],
                        "a_start": None,
                        "a_end": None,
                        "b_start": j1,
                        "b_end": j2,
                    }
                )
    return segments
def classify_note(note: dict) -> str:
    if "after" in note or "delta" in note:
        return "edit"
    summary = str(note.get("summary") or note.get("note") or "").strip().lower()
    if summary.startswith("seconded"):
        return "seconded"
    if summary.startswith("reconfirmed"):
        return "reconfirmed"
    return "confirm"
def format_value(value: object) -> str:
    return json.dumps(value, ensure_ascii=True)
def format_absolute_time(epoch_ms: int) -> str:
    dt = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc).astimezone()
    return dt.strftime("%b %d, %Y at %I:%M:%S %p")
def humanize_delta(delta_ms: int) -> str:
    seconds = abs(delta_ms) / 1000.0
    if seconds < 60:
        value = int(round(seconds))
        unit = "second"
    elif seconds < 3600:
        value = int(round(seconds / 60))
        unit = "minute"
    elif seconds < 86400:
        value = int(round(seconds / 3600))
        unit = "hour"
    elif seconds < 2592000:
        value = int(round(seconds / 86400))
        unit = "day"
    elif seconds < 31536000:
        value = int(round(seconds / 2592000))
        unit = "month"
    else:
        value = int(round(seconds / 31536000))
        unit = "year"
    suffix = "later" if delta_ms >= 0 else "earlier"
    if value == 1:
        return f"{value} {unit} {suffix}"
    return f"{value} {unit}s {suffix}"
def format_time(epoch_ms: int, prev_ms: Optional[int], simple: bool) -> str:
    if simple and prev_ms is not None:
        return humanize_delta(epoch_ms - prev_ms)
    return f"on {format_absolute_time(epoch_ms)}"
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
def path_shape(path: str) -> str:
    parts = path.strip("/").split("/")
    shaped = []
    for part in parts:
        if UUID_RE.match(part):
            shaped.append("<uuid>")
        else:
            shaped.append(part)
    return "/" + "/".join(shaped)
def resolve_target(raw: str, base_path: str) -> Tuple[str, str]:
    text = (raw or "").strip()
    if not text:
        return "", ""
    if "://" in text:
        parsed = urllib.parse.urlparse(text)
        text = parsed.path
    if text.endswith("/") and len(text) > 1:
        text = text.rstrip("/")
    if "locationNotes" in text:
        note_key = extract_note_key(text, base_path)
        encoded_key, _, _ = decode_note_key(note_key)
        if encoded_key:
            return encoded_key, urllib.parse.unquote(encoded_key)
    lower = text.lower()
    if "%2f" in lower:
        idx = lower.find("%2f")
        candidate = text[idx:]
        if "/" in candidate:
            candidate = candidate.split("/")[0]
        encoded_key = candidate
        return encoded_key, urllib.parse.unquote(encoded_key)
    if not text.startswith("/"):
        text = "/" + text
    return urllib.parse.quote(text, safe=""), text
def load_similarity_index(path: str) -> dict[str, dict]:
    if not path:
        return {}
    index_path = Path(path)
    if not index_path.exists():
        return {}
    data = json.loads(index_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return {}
    fields = data.get("fields", {})
    if not isinstance(fields, dict):
        return {}
    matches: dict[str, dict] = {}
    for field_key, field_payload in fields.items():
        if not isinstance(field_payload, dict):
            continue
        match_map = field_payload.get("matches", {})
        if not isinstance(match_map, dict):
            continue
        for event_id, match_info in match_map.items():
            if not isinstance(match_info, dict):
                continue
            payload = dict(match_info)
            payload.setdefault("fieldKey", field_key)
            matches[str(event_id)] = payload
    return matches
def build_timeline_events(
    entries: list[dict],
    decoded_path: str,
    similarity_lookup: dict[str, dict],
    include_diff: bool,
    simple: bool,
) -> list[dict]:
    entries.sort(key=lambda item: item["epoch_ms"])
    field_states: dict[str, dict] = {}
    events: list[dict] = []
    location_id = extract_location_id(decoded_path)
    service_id = extract_service_id(decoded_path)
    for entry in entries:
        note = entry["note"]
        user = map_user(entry["user"])
        epoch_ms = entry["epoch_ms"]
        kind = classify_note(note)
        field_key = build_field_key(note)
        state = field_states.setdefault(
            field_key,
            {"version": 0, "current_text": None, "prev_text": None, "last_user": None},
        )
        from_version = state["version"]
        to_version = from_version
        prev_text = state["current_text"]
        prev_prev_text = state["prev_text"]
        new_text = None
        gap = False
        segments = None
        is_revert = False
        if kind == "edit":
            to_version = from_version + 1
            if "after" in note:
                new_text = note.get("after")
            elif "delta" in note and isinstance(prev_text, str):
                new_text = apply_text_delta(prev_text, note.get("delta"))
                if new_text is None:
                    gap = True
            else:
                gap = True
            if include_diff:
                if isinstance(prev_text, str) and isinstance(new_text, str):
                    segments = build_diff_segments(prev_text, new_text)
                elif isinstance(new_text, str) and prev_text is None:
                    segments = [
                        {
                            "op": "insert",
                            "text": new_text,
                            "a_start": None,
                            "a_end": None,
                            "b_start": 0,
                            "b_end": len(new_text),
                        }
                    ]
                    gap = True
            if prev_prev_text is not None and new_text == prev_prev_text:
                if new_text != prev_text:
                    is_revert = True
        event_key = event_key_for(
            epoch_ms,
            user,
            field_key,
            location_id,
            service_id if field_key.startswith("services.") else "",
        )
        event = {
            "eventId": event_key,
            "timestampMs": epoch_ms,
            "user": user,
            "field": note.get("field"),
            "resourceTable": note.get("resourceTable"),
            "action": note.get("action"),
            "label": note.get("label"),
            "kind": kind,
            "fromVersion": from_version,
            "toVersion": to_version,
            "locationId": location_id or None,
            "pagePath": decoded_path,
            "fieldKey": field_key,
        }
        if service_id and field_key.startswith("services."):
            event["serviceId"] = service_id
        if kind == "edit":
            if prev_text is not None:
                event["before"] = prev_text
            if new_text is not None:
                event["after"] = new_text
            event["gap"] = gap
            event["isRevert"] = is_revert
            if include_diff and segments is not None:
                event["segments"] = segments
        else:
            event["gap"] = gap
        if event_key in similarity_lookup:
            event["similarity"] = similarity_lookup[event_key]
        events.append(event)
        if kind == "edit":
            state["prev_text"] = prev_text
            state["current_text"] = new_text
            state["version"] = to_version
            state["last_user"] = user
        reconfirmed_on = parse_epoch_ms(note.get("reconfirmedOn"))
        if reconfirmed_on is not None and reconfirmed_on > epoch_ms:
            recon_event_key = event_key_for(
                reconfirmed_on,
                user,
                field_key,
                location_id,
                service_id if field_key.startswith("services.") else "",
            )
            events.append(
                {
                    "eventId": recon_event_key,
                    "timestampMs": reconfirmed_on,
                    "user": user,
                    "field": note.get("field"),
                    "resourceTable": note.get("resourceTable"),
                    "action": note.get("action"),
                    "label": note.get("label"),
                    "kind": "reconfirmed_on",
                    "fromVersion": to_version,
                    "toVersion": to_version,
                    "locationId": location_id or None,
                    "pagePath": decoded_path,
                    "fieldKey": field_key,
                    "sourceEventId": event_key,
                }
            )
    events.sort(key=lambda item: item["timestampMs"])
    if simple:
        prev_ms = None
        for event in events:
            event["relativeTime"] = format_time(event["timestampMs"], prev_ms, True)
            prev_ms = event["timestampMs"]
    return events
def render_history(entries: list[dict], simple: bool) -> None:
    events: list[dict] = []
    for entry in entries:
        note = entry["note"]
        kind = classify_note(note)
        events.append(
            {
                "epoch_ms": entry["epoch_ms"],
                "user": entry["user"],
                "note": note,
                "kind": kind,
                "order": 0,
            }
        )
        reconfirmed_on = parse_epoch_ms(note.get("reconfirmedOn"))
        if reconfirmed_on is not None and reconfirmed_on > entry["epoch_ms"]:
            events.append(
                {
                    "epoch_ms": reconfirmed_on,
                    "user": entry["user"],
                    "note": note,
                    "kind": "reconfirmed_on",
                    "order": 2,
                }
            )
    priority = {"edit": 0, "seconded": 1, "reconfirmed": 1, "confirm": 1}
    events.sort(
        key=lambda item: (
            item["epoch_ms"],
            priority.get(item["kind"], 1),
            item["order"],
        )
    )
    current_after = None
    last_edit_user = None
    prev_event_ms = None
    for event in events:
        note = event["note"]
        user = event["user"]
        kind = event["kind"]
        time_phrase = format_time(event["epoch_ms"], prev_event_ms, simple)
        if kind == "edit":
            action = str(note.get("action") or "update").lower()
            label = str(note.get("label") or note.get("field") or "field").lower()
            before_val = current_after
            after_val = note.get("after")
            if after_val is None and "delta" in note and isinstance(current_after, str):
                after_val = apply_text_delta(current_after, note.get("delta"))
            change_text = "value unavailable"
            if before_val is None and after_val is not None:
                change_text = format_value(after_val)
            elif before_val is not None and after_val is None:
                change_text = f"~~{format_value(before_val)}~~ -> null"
            elif before_val is not None and after_val is not None:
                if before_val == after_val:
                    change_text = format_value(after_val)
                else:
                    change_text = f"~~{format_value(before_val)}~~ -> {format_value(after_val)}"
            if action == "create":
                line = f"{user} created this {label} {time_phrase}: {change_text}"
            elif action == "delete":
                line = f"{user} cleared this {label} {time_phrase}: {change_text}"
            else:
                if last_edit_user and last_edit_user != user:
                    line = (
                        f"{user} edited {last_edit_user}'s work {time_phrase}: "
                        f"{change_text}"
                    )
                else:
                    line = f"{user} edited this {label} {time_phrase}: {change_text}"
            print(line)
            if after_val is not None:
                current_after = after_val
                last_edit_user = user
        elif kind == "seconded":
            anchor_user = note.get("prevUser") or last_edit_user
            if anchor_user:
                line = f"{user} seconded {anchor_user}'s edit {time_phrase}."
            else:
                line = f"{user} seconded the edit {time_phrase}."
            print(line)
        elif kind in {"reconfirmed", "reconfirmed_on"}:
            line = f"{user} reconfirmed the edit {time_phrase}."
            print(line)
        else:
            line = f"{user} confirmed the edit {time_phrase}."
            print(line)
        prev_event_ms = event["epoch_ms"]
def main() -> int:
    args = parse_args()
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Input not found: {input_path}")
        return 1
    target_raw = args.url or args.target
    encoded_target, decoded_target = resolve_target(target_raw, args.base_path)
    if not encoded_target:
        print("Missing target URL or path.")
        return 1
    entries_for_target: list[dict] = []
    key_stats: dict[str, dict] = {}
    similarity_lookup = load_similarity_index(args.similarity_index)
    scanned = 0
    for encoded_key, user, epoch_ms, note in load_entries(input_path, args.base_path):
        scanned += 1
        if args.progress_every and scanned % args.progress_every == 0:
            print(f"Scanned {scanned} entries...", file=sys.stderr)
        mapped_user = map_user(user)
        decoded = urllib.parse.unquote(encoded_key)
        stats = key_stats.get(encoded_key)
        if not stats:
            stats = {
                "decoded": decoded,
                "shape": path_shape(decoded),
                "location_id": extract_location_id(decoded),
                "count": 0,
            }
            key_stats[encoded_key] = stats
        stats["count"] += 1
        if encoded_key == encoded_target:
            entries_for_target.append(
                {
                    "encoded_key": encoded_key,
                    "user": mapped_user,
                    "epoch_ms": epoch_ms,
                    "note": note,
                }
            )
    decoded_target = decoded_target or urllib.parse.unquote(encoded_target)
    target_payload = {
        "encodedKey": encoded_target,
        "pagePath": decoded_target,
        "url": f"https://gogetta.nyc{decoded_target}",
    }
    if entries_for_target:
        entries_for_target.sort(key=lambda item: item["epoch_ms"])
        if args.format == "json":
            timeline = build_timeline_events(
                entries_for_target,
                decoded_target,
                similarity_lookup,
                args.diff,
                args.simple,
            )
            output = {"found": True, "target": target_payload, "timeline": timeline}
            print(json.dumps(output, ensure_ascii=True, indent=2))
        else:
            render_history(entries_for_target, args.simple)
        return 0
    if args.format != "json":
        print(f"No edits found for: {decoded_target}")
    target_location_id = extract_location_id(decoded_target)
    target_shape = path_shape(decoded_target)
    by_shape = [
        (encoded_key, stats)
        for encoded_key, stats in key_stats.items()
        if stats["shape"] == target_shape
    ]
    by_location = []
    if target_location_id:
        by_location = [
            (encoded_key, stats)
            for encoded_key, stats in key_stats.items()
            if stats["location_id"] == target_location_id
        ]
    by_shape = sorted(by_shape, key=lambda item: (-item[1]["count"], item[1]["decoded"]))
    by_location = sorted(
        by_location, key=lambda item: (-item[1]["count"], item[1]["decoded"])
    )
    max_suggestions = max(1, args.max_suggestions)
    if args.format == "json":
        output = {
            "found": False,
            "target": target_payload,
            "suggestions": {
                "samePageType": [
                    {
                        "pagePath": stats["decoded"],
                        "count": stats["count"],
                    }
                    for _, stats in by_shape[:max_suggestions]
                ],
                "sameLocation": [
                    {
                        "pagePath": stats["decoded"],
                        "count": stats["count"],
                    }
                    for _, stats in by_location[:max_suggestions]
                ],
            },
        }
        print(json.dumps(output, ensure_ascii=True, indent=2))
        return 2
    if by_shape:
        print(f"Top candidates with same page type ({target_shape}):")
        for _, stats in by_shape[:max_suggestions]:
            print(f"- {stats['decoded']} ({stats['count']} edits)")
    if by_location:
        print(f"Top candidates for location {target_location_id}:")
        for _, stats in by_location[:max_suggestions]:
            print(f"- {stats['decoded']} ({stats['count']} edits)")
    return 2
if __name__ == "__main__":
    raise SystemExit(main())
