import argparse
import csv
import difflib
import json
import os
import random
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Tuple
from urllib.parse import quote

DEFAULT_CSV = r"C:\Users\doobneek\Desktop\doobneek-extension\01_11amjan2detailededits.csv"
DEFAULT_OUTPUT = r"C:\Users\doobneek\Desktop\doobneek-extension\locationNotes_from_01_11amjan2detailededits.json"
DEFAULT_CHUNK_SIZE_MB = 8.0
DEFAULT_CLEANUP_MAX_ROOTS = 500
RESOURCE_TABLE_KEYS = (
    "resource_table",
    "\ufeffresource_table",
    "\u00ef\u00bb\u00bfresource_table",
)
CHANGED_AT_KEYS = ("changed_at_ny", "changed_at", "changed_at_local")
NY_TZ_NAME = "America/New_York"

try:
    from zoneinfo import ZoneInfo
except Exception:
    ZoneInfo = None

NY_TZ = ZoneInfo(NY_TZ_NAME) if ZoneInfo else None

EMPTYISH = {"", "null", "none", "nan", "n/a", "[]", "{}"}
ONE_MONTH_MS = 2_592_000_000
SIX_MONTH_MS = 15_552_000_000

SERVICE_SUFFIX_MAP = {
    ("services", "description"): "description",
    ("services", "additional_info"): "other-info",
    ("services", "who_does_it_serve"): "who-does-it-serve",
    ("services", "ages_served"): "who-does-it-serve",
    ("services", "name"): "name",
    ("services", "url"): "other-info",
    ("event_related_info", "information"): "other-info",
    ("event_related_info", "event"): "other-info",
    ("holiday_schedules", None): "opening-hours",
    ("regular_schedules", None): "opening-hours",
    ("required_documents", None): "documents/proofs-required",
    ("documents_infos", "additional_info"): "documents/other-info",
    ("documents_infos", "grace_period"): "documents/grace-period",
    ("documents_infos", "recertification_time"): "documents/recertification-time",
    ("eligibility", None): "who-does-it-serve",
    ("service_languages", None): "languages",
    ("service_areas", None): "area",
}

QUESTION_SUFFIX_MAP = {
    ("locations", "name"): "location-name",
    ("locations", "description"): "location-description",
    ("locations", "additional_info"): "location-description",
    ("locations", "streetview_url"): "street-view",
    ("locations", "position"): "location-address",
    ("locations", "url"): "website",
    ("organizations", "name"): "organization-name",
    ("organizations", "url"): "website",
    ("organizations", "description"): "location-description",
    ("phones", None): "phone-number",
    ("physical_addresses", None): "location-address",
}

LABEL_OVERRIDES = {
    ("services", "additional_info"): "Other info",
    ("services", "who_does_it_serve"): "Who does it serve",
    ("services", "ages_served"): "Age requirement",
    ("event_related_info", "information"): "Other info",
    ("event_related_info", "event"): "Event tag",
    ("holiday_schedules", "opens_at"): "Opening hours",
    ("holiday_schedules", "closes_at"): "Closing hours",
    ("regular_schedules", "opens_at"): "Opening hours",
    ("regular_schedules", "closes_at"): "Closing hours",
    ("required_documents", "document"): "Required documents",
    ("documents_infos", "additional_info"): "Documents other info",
    ("documents_infos", "grace_period"): "Documents grace period",
    ("documents_infos", "recertification_time"): "Documents recertification time",
    ("service_languages", "language_id"): "Languages",
    ("service_areas", "postal_codes"): "Service area",
    ("eligibility", "description"): "Eligibility",
    ("eligibility", "eligible_values"): "Eligibility",
    ("locations", "name"): "Location name",
    ("organizations", "name"): "Organization name",
    ("organizations", "url"): "Website",
    ("phones", "number"): "Phone number",
    ("physical_addresses", "address_1"): "Location address",
}

PRUNE_NOTE_FIELDS = {
    "delta",
    "locationId",
    "pagePath",
    "prevTimestamp",
    "prevUser",
    "serviceId",
    "ts",
    "userName",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Encode detailed edits CSV into locationNotes JSON for RTDB.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python encode_detailed_edits_to_rtdb.py --csv 01_11amjan2detailededits.csv "
            "--output locationNotes.json\n"
            "  python encode_detailed_edits_to_rtdb.py --csv edits.csv --limit 500 "
            "--pagepath-report locationNotes_review_updates.json\n"
            "  python encode_detailed_edits_to_rtdb.py --csv edits.csv --merge-existing "
            "locationNotes_existing.json --output locationNotes_merged.json\n"
            "  python encode_detailed_edits_to_rtdb.py --csv edits.csv --output-mode updates "
            "--output rtdb_updates_manifest.json --chunk-size-mb 8\n"
            "  python encode_detailed_edits_to_rtdb.py --cleanup-locationnotes --db-url "
            "https://<db>.firebaseio.com --token <TOKEN> --cleanup-only\n"
        ),
    )
    parser.add_argument("--csv", default=DEFAULT_CSV, help="Path to detailed edits CSV.")
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT,
        help="Output JSON path for locationNotes payload.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process only the first N rows (0 = no limit).",
    )
    parser.add_argument(
        "--default-date",
        help="YYYY-MM-DD fallback when changed_at only has a time (e.g. 01:31.4).",
    )
    parser.add_argument(
        "--time-only-format",
        choices=["hm", "ms"],
        default="hm",
        help="Interpret time-only values as HH:MM.f (hm) or MM:SS.f (ms).",
    )
    parser.add_argument(
        "--output-mode",
        choices=["nested", "updates"],
        default="nested",
        help="nested writes locationNotes tree, updates writes leaf path PATCH map.",
    )
    parser.add_argument(
        "--base-path",
        default="/locationNotes",
        help="Base path for updates output (default: /locationNotes).",
    )
    parser.add_argument(
        "--chunk-size-mb",
        type=float,
        default=DEFAULT_CHUNK_SIZE_MB,
        help="Approx chunk size in MB for updates output (0 disables chunking).",
    )
    parser.add_argument(
        "--chunk-max-entries",
        type=int,
        default=0,
        help="Max updates per chunk in updates output (0 disables this limit).",
    )
    parser.add_argument(
        "--chunk-max-roots",
        type=int,
        default=0,
        help="Max unique keys directly under base path per chunk (0 disables).",
    )
    parser.add_argument(
        "--cleanup-locationnotes",
        action="store_true",
        help="Delete encoded keys and invocations under base path before upload.",
    )
    parser.add_argument(
        "--cleanup-json",
        default="",
        help="Optional locationNotes export JSON to drive cleanup (otherwise shallow read).",
    )
    parser.add_argument(
        "--cleanup-only",
        action="store_true",
        help="Only run cleanup and exit.",
    )
    parser.add_argument(
        "--chunks-dir",
        default="",
        help="Directory for update chunks (defaults to <output_stem>_chunks).",
    )
    parser.add_argument(
        "--merge-existing",
        default="",
        help="Existing locationNotes JSON, manifest, updates map, or chunk directory to merge.",
    )
    parser.add_argument(
        "--pagepath-report",
        default="",
        help="Write JSON report of encoded keys and page paths for review.",
    )
    parser.add_argument(
        "--upload",
        action="store_true",
        help="Upload updates to RTDB via PATCH after building output.",
    )
    parser.add_argument(
        "--db-url",
        help="RTDB base URL like https://<db>.firebaseio.com (required for --upload).",
    )
    parser.add_argument(
        "--token",
        help="RTDB auth token (or set RTDB_TOKEN/FIREBASE_TOKEN env vars).",
    )
    return parser.parse_args()


def normalize_id(value: str) -> str:
    if value is None:
        return ""
    return str(value).strip()


def is_bad_id(value: str) -> bool:
    text = normalize_id(value)
    if not text:
        return True
    if text == "<Other>":
        return True
    if text.lower() == "null":
        return True
    return False


def is_emptyish(value: object) -> bool:
    if value is None:
        return True
    text = str(value).strip().lower()
    return text in EMPTYISH


def normalize_value(value: object) -> object:
    return None if is_emptyish(value) else value


def get_row_value(row: dict, key: str, *alt_keys: str) -> str:
    if key in row:
        return row.get(key) or ""
    for alt in alt_keys:
        if alt in row:
            return row.get(alt) or ""
    for row_key in row:
        if row_key.lstrip("\ufeff") == key:
            return row.get(row_key) or ""
    return ""


def parse_bool(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    return text in {"true", "1", "yes", "y"}


TIME_ONLY_RE = re.compile(r"^(?P<a>\d{1,2}):(?P<b>\d{2})\.(?P<frac>\d+)$")


def is_ny_dst(local_dt: datetime) -> bool:
    year = local_dt.year
    march = datetime(year, 3, 1)
    first_sunday = 1 + ((6 - march.weekday()) % 7)
    second_sunday = first_sunday + 7
    dst_start = datetime(year, 3, second_sunday, 2, 0, 0)
    nov = datetime(year, 11, 1)
    first_sunday_nov = 1 + ((6 - nov.weekday()) % 7)
    dst_end = datetime(year, 11, first_sunday_nov, 2, 0, 0)
    return dst_start <= local_dt < dst_end


def coerce_ny_to_utc(local_dt: datetime) -> datetime:
    if NY_TZ:
        return local_dt.replace(tzinfo=NY_TZ).astimezone(timezone.utc)
    offset_hours = -4 if is_ny_dst(local_dt) else -5
    return (local_dt - timedelta(hours=offset_hours)).replace(tzinfo=timezone.utc)


def parse_default_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d").date()
    except ValueError:
        return None


def parse_changed_at(
    value: str,
    default_date: Optional[date] = None,
    time_only_format: str = "hm",
) -> Tuple[Optional[datetime], bool]:
    if not value:
        return None, False
    text = value.strip()
    match = TIME_ONLY_RE.match(text)
    if match:
        if not default_date:
            return None, True
        part_a = int(match.group("a"))
        part_b = int(match.group("b"))
        frac = match.group("frac")
        micro = int((frac + "000000")[:6])
        if time_only_format == "ms":
            minutes = part_a
            seconds = part_b
            hours = minutes // 60
            minutes = minutes % 60
        else:
            hours = part_a
            minutes = part_b
            seconds = 0
        dt = datetime(
            default_date.year,
            default_date.month,
            default_date.day,
            hours,
            minutes,
            seconds,
            micro,
        )
        return coerce_ny_to_utc(dt), True
    try:
        dt = datetime.fromisoformat(text.replace(" ", "T"))
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S"):
            try:
                dt = datetime.strptime(text, fmt)
                break
            except ValueError:
                dt = None
        if dt is None:
            return None, False
    if dt.tzinfo is None:
        dt = coerce_ny_to_utc(dt)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt, False


def to_epoch_ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


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


def to_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    iso = dt.isoformat()
    if iso.endswith("+00:00"):
        iso = iso.replace("+00:00", "Z")
    return iso


def build_summary(label: str, before_val: object, after_val: object) -> str:
    before_text = "" if before_val is None else str(before_val).strip()
    after_text = "" if after_val is None else str(after_val).strip()
    if not before_text and after_text:
        return f"Added {label}"
    if before_text and not after_text:
        return f"Cleared {label}"
    return f"Updated {label}"


def build_action(before_val: object, after_val: object) -> str:
    if is_emptyish(before_val) and not is_emptyish(after_val):
        return "create"
    if not is_emptyish(before_val) and is_emptyish(after_val):
        return "delete"
    return "update"


def build_confirmation_summary(label: str, kind: str) -> str:
    prefix = "Seconded" if kind == "seconded" else "Reconfirmed"
    cleaned = (label or "").strip()
    if cleaned:
        return f"{prefix} {cleaned}"
    return prefix


def build_confirmation_note(note: dict, kind: str) -> dict:
    updated = dict(note)
    updated.pop("before", None)
    updated.pop("after", None)
    summary = build_confirmation_summary(updated.get("label", ""), kind)
    updated["note"] = summary
    updated["summary"] = summary
    updated["copyedit"] = True
    return updated


def make_note_entry(event: dict, note: dict, anchor: Optional[dict] = None) -> dict:
    return {
        "encoded_key": event["encoded_key"],
        "user_name": event["user_name"],
        "epoch_ms": event["epoch_ms"],
        "note": note,
        "anchor": anchor,
        "row_index": event["row_index"],
        "dropped": False,
    }


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


def should_use_delta(new_text: str, delta: dict) -> bool:
    after_size = len(json.dumps(new_text, ensure_ascii=True))
    delta_size = len(json.dumps(delta, ensure_ascii=True))
    return delta_size < after_size


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


def label_from_field(field_name: str, resource_table: str) -> str:
    key = (resource_table, field_name)
    if key in LABEL_OVERRIDES:
        return LABEL_OVERRIDES[key]
    label = field_name.replace("_", " ").strip().title() if field_name else ""
    if label:
        return label
    return resource_table.replace("_", " ").strip().title()


def lookup_service_suffix(resource_table: str, field_name: str) -> Optional[str]:
    key = (resource_table, field_name)
    if key in SERVICE_SUFFIX_MAP:
        return SERVICE_SUFFIX_MAP[key]
    key = (resource_table, None)
    return SERVICE_SUFFIX_MAP.get(key)


def lookup_question_suffix(resource_table: str, field_name: str) -> Optional[str]:
    key = (resource_table, field_name)
    if key in QUESTION_SUFFIX_MAP:
        return QUESTION_SUFFIX_MAP[key]
    key = (resource_table, None)
    return QUESTION_SUFFIX_MAP.get(key)


def build_page_path(
    resource_table: str,
    field_name: str,
    location_id: str,
    service_id: str,
) -> Optional[str]:
    if is_bad_id(location_id):
        return None

    if not is_bad_id(service_id):
        suffix = lookup_service_suffix(resource_table, field_name)
        if suffix:
            return f"/team/location/{location_id}/services/{service_id}/{suffix}"
        return f"/team/location/{location_id}/services"

    if resource_table == "service_at_locations":
        return f"/team/location/{location_id}/services"

    question = lookup_question_suffix(resource_table, field_name)
    if question:
        return f"/team/location/{location_id}/questions/{question}"

    return f"/team/location/{location_id}"


def normalize_base_path(value: str) -> str:
    if not value:
        return ""
    return f"/{value.strip('/')}"


def build_update_path(base_path: str, encoded_key: str, user_name: str, date_key: str) -> str:
    base = normalize_base_path(base_path)
    if not base:
        return f"/{encoded_key}/{user_name}/{date_key}"
    return f"{base}/{encoded_key}/{user_name}/{date_key}"


def estimate_kv_size(key: str, value: object) -> int:
    return len(json.dumps(key, ensure_ascii=True)) + len(json.dumps(value, ensure_ascii=True)) + 2


class UpdateChunkWriter:
    def __init__(
        self,
        output_dir: Path,
        chunk_size_bytes: int,
        max_entries: int = 0,
        max_roots: int = 0,
    ) -> None:
        self.output_dir = output_dir
        self.chunk_size_bytes = chunk_size_bytes
        self.max_entries = max_entries
        self.max_roots = max_roots
        self.current: dict[str, object] = {}
        self.current_size = 2
        self.current_entries = 0
        self.current_roots: set[str] = set()
        self.chunk_index = 0
        self.chunks: list[Path] = []

    def add(self, key: str, value: str, root_key: Optional[str] = None) -> None:
        entry_size = estimate_kv_size(key, value)
        would_exceed_size = (
            self.chunk_size_bytes
            and self.current
            and self.current_size + entry_size > self.chunk_size_bytes
        )
        would_exceed_entries = (
            self.max_entries and self.current and self.current_entries >= self.max_entries
        )
        would_exceed_roots = False
        if (
            self.max_roots
            and self.current
            and root_key is not None
            and root_key not in self.current_roots
            and len(self.current_roots) >= self.max_roots
        ):
            would_exceed_roots = True
        if would_exceed_size or would_exceed_entries or would_exceed_roots:
            self.flush()
        self.current[key] = value
        self.current_size += entry_size
        self.current_entries += 1
        if root_key is not None:
            self.current_roots.add(root_key)

    def flush(self) -> None:
        if not self.current:
            return
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.chunk_index += 1
        chunk_path = self.output_dir / f"rtdb_updates_{self.chunk_index:03d}.json"
        chunk_path.write_text(
            json.dumps(self.current, ensure_ascii=True) + "\n",
            encoding="utf-8",
        )
        self.chunks.append(chunk_path)
        self.current = {}
        self.current_size = 2
        self.current_entries = 0
        self.current_roots = set()


def resolve_token(arg_token: Optional[str]) -> str:
    if arg_token:
        return arg_token
    return os.getenv("RTDB_TOKEN") or os.getenv("FIREBASE_TOKEN") or ""


def build_patch_url(db_url: str, token: str) -> str:
    base = db_url.rstrip("/")
    url = f"{base}/.json"
    if token:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}{urllib.parse.urlencode({'auth': token})}"
    return url


def build_shallow_url(db_url: str, path: str, token: str) -> str:
    base = db_url.rstrip("/")
    cleaned = path.strip("/")
    url = f"{base}/{cleaned}.json?shallow=true"
    if token:
        url = f"{url}&{urllib.parse.urlencode({'auth': token})}"
    return url


def patch_payload(url: str, payload: bytes) -> Tuple[Optional[int], str]:
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


def load_locationnotes_root(json_path: Path) -> dict[str, object]:
    with json_path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if (
        isinstance(data, dict)
        and "locationNotes" in data
        and isinstance(data["locationNotes"], dict)
    ):
        return data["locationNotes"]
    if isinstance(data, dict):
        return data
    return {}


def extract_locationnotes_root(data: object) -> dict | None:
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
        if (
            not isinstance(encoded_key, str)
            or not encoded_key.startswith("%2F")
            or not isinstance(encoded_value, dict)
        ):
            stats["export_skipped_roots"] += 1
            continue
        stats["export_encoded_roots"] += 1
        for user_key, user_value in encoded_value.items():
            if not isinstance(user_key, str) or not isinstance(user_value, dict):
                stats["export_skipped_entries"] += 1
                continue
            for ts_key, note_value in user_value.items():
                if ts_key == "_meta":
                    stats["export_skipped_entries"] += 1
                    continue
                timestamp = str(ts_key)
                update_key = (
                    f"{base}/{encoded_key}/{user_key}/{timestamp}"
                    if base
                    else f"/{encoded_key}/{user_key}/{timestamp}"
                )
                updates[update_key] = note_value
                stats["export_entries"] += 1
    return updates, stats


def load_updates_source(path: Path) -> dict[str, object]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and "chunks" in data:
        updates: dict[str, object] = {}
        base_dir = path.parent
        for chunk in data.get("chunks", []):
            chunk_path = (base_dir / Path(chunk)).resolve()
            if not chunk_path.exists():
                continue
            chunk_data = json.loads(chunk_path.read_text(encoding="utf-8"))
            if isinstance(chunk_data, dict):
                updates.update(chunk_data)
        return updates
    if isinstance(data, dict):
        locationnotes_root = extract_locationnotes_root(data)
        if locationnotes_root is not None:
            updates, _ = flatten_locationnotes_export(locationnotes_root, "/locationNotes")
            return updates
    return data if isinstance(data, dict) else {}


def load_existing_updates(source: str) -> dict[str, object]:
    if not source:
        return {}
    path = Path(source)
    if not path.exists():
        return {}
    if path.is_dir():
        updates: dict[str, object] = {}
        for file_path in sorted(path.glob("*.json")):
            chunk = json.loads(file_path.read_text(encoding="utf-8"))
            if isinstance(chunk, dict):
                updates.update(chunk)
        return updates
    return load_updates_source(path)


def extract_note_key(key: str, base_path: str) -> str:
    base = normalize_base_path(base_path)
    normalized = f"/{key.strip('/')}"
    if base and normalized.startswith(base + "/"):
        return normalized[len(base) + 1 :]
    if base and normalized == base:
        return ""
    return normalized.lstrip("/")


def parse_note_payload(value: object) -> dict | None:
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


def note_has_value(note: dict) -> bool:
    return "after" in note or "delta" in note


def sanitize_note_for_event(
    note: dict, before_val: object, after_val: object
) -> tuple[dict, Optional[int]]:
    cleaned = {key: value for key, value in note.items() if key not in PRUNE_NOTE_FIELDS}
    reconfirmed_on = parse_epoch_ms(cleaned.pop("reconfirmedOn", None))
    if "type" not in cleaned:
        cleaned["type"] = "edit"
    if "resourceTable" not in cleaned:
        cleaned["resourceTable"] = note.get("resource_table", "")
    if "field" not in cleaned:
        cleaned["field"] = ""
    if not cleaned.get("label"):
        cleaned["label"] = label_from_field(
            cleaned.get("field", ""), cleaned.get("resourceTable", "")
        )
    if "action" not in cleaned:
        cleaned["action"] = build_action(before_val, after_val)
    cleaned["before"] = before_val
    cleaned["after"] = after_val
    if "note" not in cleaned or "summary" not in cleaned:
        summary = build_summary(cleaned.get("label", ""), before_val, after_val)
        cleaned.setdefault("note", summary)
        cleaned.setdefault("summary", summary)
    if "copyedit" not in cleaned:
        cleaned["copyedit"] = False
    return cleaned, reconfirmed_on


def decode_note_key(note_key: str) -> tuple[str, str, str]:
    parts = note_key.strip("/").split("/")
    if len(parts) < 3:
        return "", "", ""
    date_key = parts[-1]
    user_name = parts[-2]
    encoded_key = "/".join(parts[:-2])
    return encoded_key, user_name, date_key


def build_note_signature(note: dict) -> tuple:
    return (
        note.get("resourceTable"),
        note.get("field"),
        note.get("action"),
        note.get("before"),
        note.get("after"),
    )


def build_event_from_note(
    encoded_key: str, user_name: str, epoch_ms: int, note: dict, row_index: int
) -> dict:
    return {
        "encoded_key": encoded_key,
        "user_name": user_name,
        "epoch_ms": epoch_ms,
        "note": note,
        "signature": build_note_signature(note),
        "row_index": row_index,
    }


def build_events_from_updates(
    updates: dict[str, object], base_path: str, start_index: int
) -> tuple[dict[str, list[dict]], int, dict[str, int]]:
    stats = {
        "existing_updates": 0,
        "existing_entries": 0,
        "existing_events": 0,
        "existing_confirmations": 0,
        "existing_reconfirmed": 0,
        "existing_bad_keys": 0,
        "existing_bad_timestamp": 0,
        "existing_bad_payload": 0,
        "existing_delta_failed": 0,
        "existing_missing_anchor": 0,
    }
    raw_entries_by_key: dict[str, list[dict]] = {}
    row_index = start_index

    for update_key in sorted(updates.keys()):
        stats["existing_updates"] += 1
        note_key = extract_note_key(update_key, base_path)
        encoded_key, user_name, date_key = decode_note_key(note_key)
        if not encoded_key or not user_name or not date_key:
            stats["existing_bad_keys"] += 1
            continue
        epoch_ms = parse_epoch_ms(date_key)
        if epoch_ms is None:
            stats["existing_bad_timestamp"] += 1
            continue
        payload = parse_note_payload(updates[update_key])
        if payload is None:
            stats["existing_bad_payload"] += 1
            continue
        row_index += 1
        raw_entries_by_key.setdefault(encoded_key, []).append(
            {
                "encoded_key": encoded_key,
                "user_name": user_name,
                "epoch_ms": epoch_ms,
                "note": payload,
                "row_index": row_index,
            }
        )
        stats["existing_entries"] += 1

    events_by_key: dict[str, list[dict]] = {}
    for encoded_key, raw_entries in raw_entries_by_key.items():
        raw_entries.sort(key=lambda item: (item["epoch_ms"], item["row_index"]))
        prev_after_value = None
        edit_events: list[dict] = []
        events_by_epoch: dict[int, list[dict]] = {}
        reconfirmed_queue: list[dict] = []

        for entry in raw_entries:
            note = entry["note"]
            if not note_has_value(note):
                continue
            after_val = None
            if "delta" in note:
                if isinstance(prev_after_value, str):
                    after_val = apply_text_delta(prev_after_value, note.get("delta"))
                if after_val is None and "after" in note:
                    after_val = note.get("after")
                if after_val is None:
                    stats["existing_delta_failed"] += 1
                    continue
            else:
                after_val = note.get("after")
            before_val = note.get("before") if "before" in note else prev_after_value
            cleaned_note, reconfirmed_on = sanitize_note_for_event(
                note, before_val, after_val
            )
            signature = build_note_signature(cleaned_note)
            event = {
                "encoded_key": encoded_key,
                "user_name": entry["user_name"],
                "epoch_ms": entry["epoch_ms"],
                "note": cleaned_note,
                "signature": signature,
                "row_index": entry["row_index"],
            }
            edit_events.append(event)
            events_by_epoch.setdefault(entry["epoch_ms"], []).append(event)
            if reconfirmed_on is not None:
                reconfirmed_queue.append(
                    {
                        "epoch_ms": reconfirmed_on,
                        "user_name": entry["user_name"],
                        "signature": signature,
                        "note": cleaned_note,
                    }
                )
            prev_after_value = after_val

        for event in edit_events:
            events_by_key.setdefault(encoded_key, []).append(event)
            stats["existing_events"] += 1

        for reconfirmed in reconfirmed_queue:
            row_index += 1
            synthetic_note = dict(reconfirmed["note"])
            synthetic_note.pop("reconfirmedOn", None)
            events_by_key.setdefault(encoded_key, []).append(
                {
                    "encoded_key": encoded_key,
                    "user_name": reconfirmed["user_name"],
                    "epoch_ms": reconfirmed["epoch_ms"],
                    "note": synthetic_note,
                    "signature": reconfirmed["signature"],
                    "row_index": row_index,
                }
            )
            stats["existing_reconfirmed"] += 1

        for entry in raw_entries:
            note = entry["note"]
            if note_has_value(note):
                continue
            prev_ts = parse_epoch_ms(note.get("prevTimestamp"))
            anchor_event = None
            if prev_ts is not None:
                candidates = events_by_epoch.get(prev_ts)
                if candidates:
                    for candidate in candidates:
                        candidate_note = candidate["note"]
                        if (
                            candidate_note.get("resourceTable")
                            == note.get("resourceTable")
                            and candidate_note.get("field") == note.get("field")
                            and candidate_note.get("action") == note.get("action")
                        ):
                            anchor_event = candidate
                            break
                    if anchor_event is None:
                        anchor_event = candidates[0]
            if anchor_event is None:
                for candidate in reversed(edit_events):
                    if candidate["epoch_ms"] <= entry["epoch_ms"]:
                        anchor_event = candidate
                        break
            if anchor_event is None:
                stats["existing_missing_anchor"] += 1
                continue
            row_index += 1
            synthetic_note = dict(anchor_event["note"])
            synthetic_note.pop("reconfirmedOn", None)
            events_by_key.setdefault(encoded_key, []).append(
                {
                    "encoded_key": encoded_key,
                    "user_name": entry["user_name"],
                    "epoch_ms": entry["epoch_ms"],
                    "note": synthetic_note,
                    "signature": anchor_event["signature"],
                    "row_index": row_index,
                }
            )
            stats["existing_confirmations"] += 1

    return events_by_key, row_index, stats


def build_pagepath_report(entries_by_key: dict[str, list[dict]]) -> dict:
    items: list[dict] = []
    for encoded_key, entries in entries_by_key.items():
        page_path = urllib.parse.unquote(encoded_key)
        url = f"https://gogetta.nyc{page_path}"
        action_counts: dict[tuple, int] = {}
        for entry in entries:
            note = entry["note"]
            signature = (
                note.get("resourceTable"),
                note.get("field"),
                note.get("action"),
            )
            action_counts[signature] = action_counts.get(signature, 0) + 1
        actions = [
            {
                "resourceTable": resource_table,
                "field": field,
                "action": action,
                "count": count,
            }
            for (resource_table, field, action), count in sorted(action_counts.items())
        ]
        items.append(
            {
                "encodedKey": encoded_key,
                "pagePath": page_path,
                "url": url,
                "count": len(entries),
                "actions": actions,
            }
        )
    items.sort(key=lambda item: item["pagePath"])
    return {"baseUrl": "https://gogetta.nyc", "items": items}


def fetch_locationnotes_keys(db_url: str, token: str) -> list[str]:
    url = build_shallow_url(db_url, "locationNotes", token)
    try:
        with urllib.request.urlopen(url, timeout=60) as resp:
            body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(f"Cleanup failed to read locationNotes keys: {exc.code} {body}")
        return []
    except urllib.error.URLError as exc:
        print(f"Cleanup failed to read locationNotes keys: {exc}")
        return []
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        print("Cleanup failed to parse locationNotes keys.")
        return []
    if not isinstance(data, dict):
        return []
    return [key for key in data.keys() if isinstance(key, str)]


def derive_cleanup_keys(
    root: dict[str, object], assume_invocations: bool
) -> Tuple[list[str], list[str]]:
    encoded_keys: list[str] = []
    invocation_keys: list[str] = []
    for key, value in root.items():
        if not isinstance(key, str):
            continue
        if key.startswith("%2F"):
            encoded_keys.append(key)
            continue
        if assume_invocations:
            invocation_keys.append(key)
        elif isinstance(value, dict) and "invocations" in value:
            invocation_keys.append(key)
    return encoded_keys, invocation_keys


def iter_patch_chunks(
    items: list[tuple[str, object, Optional[str]]],
    chunk_size_bytes: int,
    max_entries: int,
    max_roots: int,
):
    chunk: dict[str, object] = {}
    size = 2
    entries = 0
    roots: set[str] = set()
    for key, value, root_key in items:
        entry_size = estimate_kv_size(key, value)
        would_exceed_size = (
            chunk_size_bytes and chunk and size + entry_size > chunk_size_bytes
        )
        would_exceed_entries = max_entries and chunk and entries >= max_entries
        would_exceed_roots = False
        if max_roots and chunk and root_key is not None:
            if root_key not in roots and len(roots) >= max_roots:
                would_exceed_roots = True
        if would_exceed_size or would_exceed_entries or would_exceed_roots:
            yield chunk
            chunk = {}
            size = 2
            entries = 0
            roots = set()
        chunk[key] = value
        size += entry_size
        entries += 1
        if root_key is not None:
            roots.add(root_key)
    if chunk:
        yield chunk


def cleanup_locationnotes(
    db_url: str,
    token: str,
    base_path: str,
    cleanup_json: str,
    chunk_size_bytes: int,
    max_entries: int,
    max_roots: int,
) -> bool:
    root: dict[str, object]
    assume_invocations = True
    if cleanup_json:
        json_path = Path(cleanup_json)
        if not json_path.exists():
            print(f"Cleanup JSON not found: {json_path}")
            return False
        root = load_locationnotes_root(json_path)
        assume_invocations = False
    else:
        keys = fetch_locationnotes_keys(db_url, token)
        root = {key: None for key in keys}
    encoded_keys, invocation_keys = derive_cleanup_keys(root, assume_invocations)
    if not encoded_keys and not invocation_keys:
        print("Cleanup: no matching locationNotes entries found.")
        return True

    items: list[tuple[str, object, Optional[str]]] = []
    for key in encoded_keys:
        items.append((f"{base_path}/{key}", None, key))
    for key in invocation_keys:
        items.append((f"{base_path}/{key}/invocations", None, key))

    url = build_patch_url(db_url, token)
    total_updates = len(items)
    print(
        "Cleanup: deleting "
        f"{len(encoded_keys)} encoded keys and clearing invocations for "
        f"{len(invocation_keys)} UUIDs ({total_updates} updates)."
    )
    for idx, chunk in enumerate(
        iter_patch_chunks(items, chunk_size_bytes, max_entries, max_roots), start=1
    ):
        payload = json.dumps(chunk, ensure_ascii=True).encode("utf-8")
        status, body = patch_payload(url, payload)
        print(f"Cleanup {idx}: {len(chunk)} updates -> {status}")
        if status is None or status >= 300:
            print(f"Cleanup failed: {body}")
            return False
    print("Cleanup done.")
    return True


def main() -> int:
    args = parse_args()
    csv_path = Path(args.csv)
    output_path = Path(args.output)

    if not csv_path.exists():
        print(f"CSV not found: {csv_path}")
        return 1

    default_date = parse_default_date(args.default_date)
    if args.default_date and not default_date:
        print("Invalid --default-date. Expected YYYY-MM-DD.")
        return 2

    if args.upload and args.output_mode != "updates":
        print("Upload is only supported with --output-mode updates.")
        return 2

    if args.cleanup_locationnotes:
        if not args.db_url:
            print("Missing --db-url for cleanup.")
            return 2
        token = resolve_token(args.token)
        max_entries = max(0, args.chunk_max_entries or 0)
        max_roots = max(0, args.chunk_max_roots or 0) or DEFAULT_CLEANUP_MAX_ROOTS
        chunk_size_bytes = 0
        if args.chunk_size_mb and args.chunk_size_mb > 0:
            chunk_size_bytes = int(args.chunk_size_mb * 1024 * 1024)
        ok = cleanup_locationnotes(
            args.db_url,
            token,
            normalize_base_path(args.base_path),
            args.cleanup_json,
            chunk_size_bytes,
            max_entries,
            max_roots,
        )
        if not ok:
            return 3
        if args.cleanup_only:
            return 0

    notes = {}
    updates = None
    chunk_writer = None
    chunk_size_bytes = 0

    if args.output_mode == "updates":
        max_entries = max(0, args.chunk_max_entries or 0)
        max_roots = max(0, args.chunk_max_roots or 0)
        use_chunk_writer = (
            (args.chunk_size_mb and args.chunk_size_mb > 0) or max_entries or max_roots
        )
        if use_chunk_writer:
            if args.chunk_size_mb and args.chunk_size_mb > 0:
                chunk_size_bytes = int(args.chunk_size_mb * 1024 * 1024)
            chunk_dir = (
                Path(args.chunks_dir)
                if args.chunks_dir
                else output_path.parent / f"{output_path.stem}_chunks"
            )
            chunk_writer = UpdateChunkWriter(
                chunk_dir,
                chunk_size_bytes,
                max_entries=max_entries,
                max_roots=max_roots,
            )
        else:
            updates = {}

    stats = {
        "rows": 0,
        "added": 0,
        "existing_updates": 0,
        "existing_entries": 0,
        "existing_events": 0,
        "existing_confirmations": 0,
        "existing_reconfirmed": 0,
        "existing_bad_keys": 0,
        "existing_bad_timestamp": 0,
        "existing_bad_payload": 0,
        "existing_delta_failed": 0,
        "existing_missing_anchor": 0,
        "skipped_ids": 0,
        "skipped_empty": 0,
        "skipped_time": 0,
        "time_only": 0,
        "time_only_skipped": 0,
        "skipped_no_page": 0,
        "collisions": 0,
        "consolidated": 0,
        "seconded": 0,
        "reconfirmations": 0,
        "reconfirmed_on": 0,
        "reconfirmation_replaced": 0,
        "chunks": 0,
    }
    events_by_key: dict[str, list[dict]] = {}
    event_counter = 0

    if args.merge_existing:
        existing_updates = load_existing_updates(args.merge_existing)
        if existing_updates:
            existing_events, event_counter, existing_stats = build_events_from_updates(
                existing_updates, args.base_path, event_counter
            )
            for key, events in existing_events.items():
                events_by_key.setdefault(key, []).extend(events)
            for key, value in existing_stats.items():
                stats[key] = stats.get(key, 0) + value

    with open(csv_path, newline="", encoding="cp1252", errors="replace") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            stats["rows"] += 1
            if args.limit and stats["rows"] > args.limit:
                break

            resource_table = get_row_value(
                row, "resource_table", *RESOURCE_TABLE_KEYS[1:]
            ).strip()
            field_name = (row.get("field_name") or "").strip()
            location_id = normalize_id(row.get("location_id"))
            service_id = normalize_id(row.get("service_id"))

            if is_bad_id(location_id):
                stats["skipped_ids"] += 1
                continue

            before_raw = row.get("previous_value")
            after_raw = row.get("replacement_value")
            if is_emptyish(before_raw) and is_emptyish(after_raw):
                stats["skipped_empty"] += 1
                continue

            changed_at_raw = get_row_value(row, "changed_at_ny", *CHANGED_AT_KEYS[1:])
            dt, time_only = parse_changed_at(
                changed_at_raw,
                default_date=default_date,
                time_only_format=args.time_only_format,
            )
            if time_only:
                stats["time_only"] += 1
            if not dt:
                if time_only:
                    stats["time_only_skipped"] += 1
                stats["skipped_time"] += 1
                continue

            page_path = build_page_path(resource_table, field_name, location_id, service_id)
            if not page_path:
                stats["skipped_no_page"] += 1
                continue

            before_val = normalize_value(before_raw)
            after_val = normalize_value(after_raw)
            label = label_from_field(field_name, resource_table)
            summary = build_summary(label, before_val, after_val)
            action = build_action(before_raw, after_raw)

            user_name = (row.get("editor") or "").strip() or "unknown"
            copyedit = parse_bool(row.get("copyedit_flag"))

            encoded_key = quote(page_path, safe="")
            base_epoch_ms = to_epoch_ms(dt)

            note = {
                "type": "edit",
                "field": field_name,
                "label": label,
                "before": before_val,
                "after": after_val,
                "note": summary,
                "summary": summary,
                "resourceTable": resource_table,
                "action": action,
                "copyedit": copyedit,
            }
            signature = (resource_table, field_name, action, before_val, after_val)
            event_counter += 1
            event = {
                "encoded_key": encoded_key,
                "user_name": user_name,
                "epoch_ms": base_epoch_ms,
                "note": note,
                "signature": signature,
                "row_index": event_counter,
            }
            events_by_key.setdefault(encoded_key, []).append(event)

    entries: list[dict] = []
    for encoded_key, events in events_by_key.items():
        events.sort(key=lambda item: (item["epoch_ms"], item["row_index"]))
        current_signature = None
        anchor_entry = None
        anchor_epoch_ms = None
        anchor_user = None
        user_seconded_entries: dict[str, dict] = {}
        user_reconfirm_entries: dict[str, dict] = {}

        for event in events:
            signature = event["signature"]
            if current_signature is None or signature != current_signature:
                anchor_entry = make_note_entry(event, event["note"])
                entries.append(anchor_entry)
                current_signature = signature
                anchor_epoch_ms = event["epoch_ms"]
                anchor_user = event["user_name"]
                user_seconded_entries = {}
                user_reconfirm_entries = {}
                continue

            if anchor_epoch_ms is None or anchor_entry is None or anchor_user is None:
                continue

            delta_ms = event["epoch_ms"] - anchor_epoch_ms
            if delta_ms <= SIX_MONTH_MS:
                if event["user_name"] == anchor_user:
                    stats["consolidated"] += 1
                    if delta_ms >= ONE_MONTH_MS:
                        existing = anchor_entry["note"].get("reconfirmedOn")
                        if existing is None or event["epoch_ms"] > existing:
                            anchor_entry["note"]["reconfirmedOn"] = event["epoch_ms"]
                            stats["reconfirmed_on"] += 1
                    continue

                if delta_ms < ONE_MONTH_MS:
                    stats["consolidated"] += 1
                    continue

                existing_entry = user_seconded_entries.get(event["user_name"])
                if existing_entry:
                    stats["consolidated"] += 1
                    existing = existing_entry["note"].get("reconfirmedOn")
                    if existing is None or event["epoch_ms"] > existing:
                        existing_entry["note"]["reconfirmedOn"] = event["epoch_ms"]
                        stats["reconfirmed_on"] += 1
                    continue

                note = build_confirmation_note(event["note"], "seconded")
                entry = make_note_entry(event, note, anchor=anchor_entry)
                entry["note"]["prevTimestamp"] = anchor_epoch_ms
                if anchor_user != event["user_name"]:
                    entry["note"]["prevUser"] = anchor_user
                entries.append(entry)
                user_seconded_entries[event["user_name"]] = entry
                stats["seconded"] += 1
                continue

            note = build_confirmation_note(event["note"], "reconfirmed")
            entry = make_note_entry(event, note, anchor=anchor_entry)
            entry["note"]["prevTimestamp"] = anchor_epoch_ms
            if anchor_user != event["user_name"]:
                entry["note"]["prevUser"] = anchor_user
            existing_entry = user_reconfirm_entries.get(event["user_name"])
            if existing_entry:
                existing_entry["dropped"] = True
                stats["reconfirmation_replaced"] += 1
            entries.append(entry)
            user_reconfirm_entries[event["user_name"]] = entry
            stats["reconfirmations"] += 1

    entries = [entry for entry in entries if not entry["dropped"]]
    stats["added"] = len(entries)

    used_date_keys: dict[tuple[str, str], set[str]] = {}
    for entry in entries:
        encoded_key = entry["encoded_key"]
        user_name = entry["user_name"]
        base_epoch_ms = entry["epoch_ms"]
        epoch_ms = base_epoch_ms
        date_key = str(epoch_ms)
        key_set = used_date_keys.setdefault((encoded_key, user_name), set())
        attempts = 0
        while date_key in key_set:
            attempts += 1
            if attempts <= 20:
                epoch_ms = base_epoch_ms + random.randint(1, 999)
            else:
                epoch_ms += 1
            date_key = str(epoch_ms)
            stats["collisions"] += 1
        key_set.add(date_key)
        if epoch_ms != base_epoch_ms:
            entry["epoch_ms"] = epoch_ms
        entry["date_key"] = date_key

    for entry in entries:
        anchor = entry.get("anchor")
        if anchor and "prevTimestamp" in entry["note"]:
            entry["note"]["prevTimestamp"] = anchor["epoch_ms"]

    entries_by_key: dict[str, list[dict]] = {}
    for entry in entries:
        entries_by_key.setdefault(entry["encoded_key"], []).append(entry)

    for key_entries in entries_by_key.values():
        key_entries.sort(key=lambda item: (item["epoch_ms"], item["row_index"]))
        prev_entry = None
        prev_after_value = None
        for entry in key_entries:
            if prev_entry is None:
                note = entry["note"]
                note.pop("before", None)
                if "after" in note:
                    prev_after_value = note.get("after")
                prev_entry = entry
                continue
            note = entry["note"]
            if "prevTimestamp" not in note:
                note["prevTimestamp"] = prev_entry["epoch_ms"]
                if prev_entry["user_name"] != entry["user_name"]:
                    note["prevUser"] = prev_entry["user_name"]
            note.pop("before", None)
            has_after = "after" in note
            current_after = note.get("after") if has_after else None
            if (
                has_after
                and isinstance(current_after, str)
                and isinstance(prev_after_value, str)
            ):
                delta = build_text_delta(prev_after_value, current_after)
                if should_use_delta(current_after, delta):
                    note["delta"] = delta
                    note.pop("after", None)
            if has_after:
                prev_after_value = current_after
            prev_entry = entry

    if args.pagepath_report:
        report_path = Path(args.pagepath_report)
        report_data = build_pagepath_report(entries_by_key)
        report_path.write_text(
            json.dumps(report_data, ensure_ascii=True, indent=2) + "\n",
            encoding="utf-8",
        )

    for entry in entries:
        note_payload = json.dumps(entry["note"], ensure_ascii=True)
        encoded_key = entry["encoded_key"]
        user_name = entry["user_name"]
        date_key = entry["date_key"]

        if args.output_mode == "nested":
            user_map = notes.get(encoded_key)
            if not isinstance(user_map, dict):
                user_map = {}
                notes[encoded_key] = user_map

            date_map = user_map.get(user_name)
            if not isinstance(date_map, dict):
                date_map = {}
                user_map[user_name] = date_map

            date_map[date_key] = note_payload
        else:
            update_path = build_update_path(
                args.base_path, encoded_key, user_name, date_key
            )
            if chunk_writer:
                chunk_writer.add(update_path, note_payload, root_key=encoded_key)
            else:
                updates[update_path] = note_payload

    if args.output_mode == "nested":
        output_path.write_text(
            json.dumps(notes, ensure_ascii=True, indent=2) + "\n",
            encoding="utf-8",
        )
    else:
        if chunk_writer:
            chunk_writer.flush()
            stats["chunks"] = len(chunk_writer.chunks)
            manifest = {
                "basePath": normalize_base_path(args.base_path),
                "chunks": [str(path) for path in chunk_writer.chunks],
            }
            output_path.write_text(
                json.dumps(manifest, ensure_ascii=True, indent=2) + "\n",
                encoding="utf-8",
            )
        else:
            output_path.write_text(
                json.dumps(updates, ensure_ascii=True, indent=2) + "\n",
                encoding="utf-8",
            )

        if args.upload:
            if not args.db_url:
                print("Missing --db-url for upload.")
                return 2
            token = resolve_token(args.token)
            url = build_patch_url(args.db_url, token)
            if chunk_writer:
                for idx, chunk_path in enumerate(chunk_writer.chunks, start=1):
                    payload = chunk_path.read_bytes()
                    status, body = patch_payload(url, payload)
                    print(f"Upload {idx}/{len(chunk_writer.chunks)}: {chunk_path} -> {status}")
                    if status is None or status >= 300:
                        print(f"Upload failed: {body}")
                        return 3
            else:
                payload = output_path.read_bytes()
                status, body = patch_payload(url, payload)
                print(f"Upload: {output_path} -> {status}")
                if status is None or status >= 300:
                    print(f"Upload failed: {body}")
                    return 3
            print("Upload done.")

    if stats["time_only"] and not default_date:
        print("Detected time-only changed_at values. Re-run with --default-date YYYY-MM-DD.")
    print("Done.")
    for key, value in stats.items():
        print(f"{key}: {value}")
    print(f"Output: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
