import argparse
import csv
import json
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import quote
DEFAULT_CSV = r"C:\Users\doobneek\Desktop\edits.csv"
DEFAULT_RTDB = r"C:\Users\doobneek\Downloads\doobneek-fe7b7-default-rtdb-locationNotes-export (2).json"
DEFAULT_OUTPUT = r"C:\Users\doobneek\Downloads\doobneek-fe7b7-default-rtdb-locationNotes-export (2)-with-edits.json"
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
ALLOWED_TABLES = {"services", "holiday_schedules", "event_related_info"}
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Merge edits.csv into RTDB locationNotes export."
    )
    parser.add_argument("--csv", default=DEFAULT_CSV, help="Path to edits.csv")
    parser.add_argument("--rtdb", default=DEFAULT_RTDB, help="Path to RTDB export JSON")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="Output JSON path")
    return parser.parse_args()
def is_emptyish(value: object) -> bool:
    if value is None:
        return True
    text = str(value).strip().lower()
    return text in {"", "null", "[]", "{}"}
def normalize_value(value: object) -> object:
    return None if is_emptyish(value) else value
def build_summary(label: str, before_val: object, after_val: object) -> str:
    before_text = "" if before_val is None else str(before_val).strip()
    after_text = "" if after_val is None else str(after_val).strip()
    if not before_text and after_text:
        return f"Added {label}"
    if before_text and not after_text:
        return f"Cleared {label}"
    return f"Updated {label}"
def label_from_field(field_name: str, resource_table: str) -> str:
    label = field_name.replace("_", " ").strip().title()
    if resource_table == "holiday_schedules":
        return f"Holiday {label}"
    return label
def should_include(row: dict) -> bool:
    table = row.get("resource_table") or ""
    field = row.get("field_name") or ""
    if table not in ALLOWED_TABLES:
        return False
    if table == "services" and field != "description":
        return False
    if table == "event_related_info" and field != "event":
        return False
    if table == "holiday_schedules" and field == "occasion":
        return False
    return True
def parse_changed_at(value: str) -> datetime | None:
    if not value:
        return None
    text = value.strip()
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
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt
def to_epoch_ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)
def to_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    iso = dt.isoformat()
    if iso.endswith("+00:00"):
        iso = iso.replace("+00:00", "Z")
    return iso
def build_page_path(table: str, location_id: str, service_id: str) -> str:
    if table == "services":
        suffix = "description"
    elif table == "event_related_info":
        suffix = "other-info"
    elif table == "holiday_schedules":
        suffix = "opening-hours"
    else:
        suffix = ""
    return f"/team/location/{location_id}/services/{service_id}/{suffix}".rstrip("/")
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
def main() -> int:
    args = parse_args()
    csv_path = Path(args.csv)
    rtdb_path = Path(args.rtdb)
    output_path = Path(args.output)
    if not csv_path.exists():
        print(f"CSV not found: {csv_path}")
        return 1
    if not rtdb_path.exists():
        print(f"RTDB export not found: {rtdb_path}")
        return 1
    data = json.loads(rtdb_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        print("RTDB export root is not an object.")
        return 1
    text = csv_path.read_text(encoding="utf-8", errors="replace")
    reader = csv.DictReader(text.splitlines())
    stats = {
        "rows": 0,
        "kept": 0,
        "skipped_table": 0,
        "skipped_ids": 0,
        "skipped_empty": 0,
        "skipped_time": 0,
        "added": 0,
        "collisions": 0,
        "unknown_users": 0,
    }
    for row in reader:
        stats["rows"] += 1
        if not should_include(row):
            stats["skipped_table"] += 1
            continue
        location_id = normalize_id(row.get("location_id"))
        service_id = normalize_id(row.get("service_id"))
        if is_bad_id(location_id) or is_bad_id(service_id):
            stats["skipped_ids"] += 1
            continue
        before_raw = row.get("previous_value")
        after_raw = row.get("replacement_value")
        if is_emptyish(before_raw) and is_emptyish(after_raw):
            stats["skipped_empty"] += 1
            continue
        dt = parse_changed_at(row.get("changed_at", ""))
        if not dt:
            stats["skipped_time"] += 1
            continue
        resource_table = row.get("resource_table") or ""
        field_name = row.get("field_name") or ""
        label = label_from_field(field_name, resource_table)
        before_val = normalize_value(before_raw)
        after_val = normalize_value(after_raw)
        summary = build_summary(label, before_val, after_val)
        user_id = (row.get("updated_by") or "").strip()
        user_name = USER_MAP.get(user_id, user_id)
        if user_name == user_id and user_id not in USER_MAP:
            stats["unknown_users"] += 1
        page_path = build_page_path(resource_table, location_id, service_id)
        encoded_key = quote(page_path, safe="")
        key = encoded_key if encoded_key in data or page_path not in data else page_path
        user_map = data.get(key)
        if not isinstance(user_map, dict):
            user_map = {}
            data[key] = user_map
        date_map = user_map.get(user_name)
        if not isinstance(date_map, dict):
            date_map = {}
            user_map[user_name] = date_map
        epoch_ms = to_epoch_ms(dt)
        date_key = str(epoch_ms)
        while date_key in date_map:
            epoch_ms += 1
            date_key = str(epoch_ms)
            stats["collisions"] += 1
        note_obj = {
            "type": "edit",
            "field": field_name,
            "label": label,
            "before": before_val,
            "after": after_val,
            "note": summary,
            "summary": summary,
            "ts": to_iso(dt),
            "userName": user_name,
            "pagePath": page_path,
            "locationId": location_id,
            "serviceId": service_id,
            "resourceTable": resource_table,
        }
        note_payload = json.dumps(note_obj, ensure_ascii=True)
        date_map[date_key] = note_payload
        stats["added"] += 1
        stats["kept"] += 1
    output_path.write_text(json.dumps(data, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    print("Done.")
    for key, value in stats.items():
        print(f"{key}: {value}")
    print(f"Output: {output_path}")
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
