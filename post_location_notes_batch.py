#!/usr/bin/env python3
import argparse
import csv
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request

DEFAULT_NOTE_API = "https://us-central1-streetli.cloudfunctions.net/locationNote1"
REVALIDATE_TAGS = ("<<did not revalidate>>", "<<didnt revalidate>>")


def parse_args(argv):
    parser = argparse.ArgumentParser(
        description="Post location notes in batches using locationNote1."
    )
    parser.add_argument(
        "--text-phone-csv",
        default="locations_text_phone_patched.csv",
        help="CSV with service/phone notes (default: locations_text_phone_patched.csv).",
    )
    parser.add_argument(
        "--pipeline-csv",
        default="locations_pipeline_patched.csv",
        help="CSV with location pipeline notes (default: locations_pipeline_patched.csv).",
    )
    parser.add_argument(
        "--note-api",
        default=DEFAULT_NOTE_API,
        help=f"locationNote1 endpoint (default: {DEFAULT_NOTE_API}).",
    )
    parser.add_argument(
        "--token",
        help="JWT token. If omitted, uses DOOBNEEK_JWT or JWT env var.",
    )
    parser.add_argument(
        "--notes-user",
        default="doobneek",
        help="Username for locationNotes entries (JWT user usually wins).",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=50,
        help="Number of notes per batch request (0 = no limit).",
    )
    parser.add_argument(
        "--statuses",
        default="patched,dry_run",
        help="Comma-separated patch_status values to include.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Send only the first N notes (0 = no limit).",
    )
    parser.add_argument(
        "--date",
        default="",
        help="Override note date (default: today).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show counts without POST calls.",
    )
    parser.add_argument(
        "--progress-csv",
        default="location_notes_progress.csv",
        help="CSV to record posted notes for resume support.",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip notes already recorded in the progress CSV.",
    )
    return parser.parse_args(argv)


def build_note_headers(token):
    headers = {"Content-Type": "application/json"}
    if token:
        value = token.strip()
        if not value.lower().startswith("bearer "):
            value = f"Bearer {value}"
        headers["Authorization"] = value
    return headers


def http_request(method, url, headers, payload=None, timeout=30):
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return exc.code, body
    except urllib.error.URLError as exc:
        return None, str(exc)


def parse_statuses(value):
    if not value:
        return set()
    return {item.strip().lower() for item in value.split(",") if item.strip()}


def has_revalidate_tag(text):
    if not text:
        return False
    lower = text.lower()
    return any(tag in lower for tag in REVALIDATE_TAGS)


def parse_note_batch_errors(body_text):
    if not body_text:
        return []
    try:
        data = json.loads(body_text)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, dict):
        return []
    errors = data.get("errors")
    if isinstance(errors, list):
        return errors
    results = data.get("results")
    if isinstance(results, list):
        return [
            entry
            for entry in results
            if isinstance(entry, dict) and entry.get("status") == "error"
        ]
    return []


def add_note(notes_by_location, location_id, note_text):
    if not location_id or not note_text:
        return
    note_text = note_text.strip()
    if not note_text:
        return
    entry = notes_by_location.setdefault(location_id, {"parts": [], "seen": set()})
    if note_text in entry["seen"]:
        return
    entry["seen"].add(note_text)
    entry["parts"].append(note_text)


def load_text_phone_notes(path, statuses, notes_by_location):
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            status = (row.get("patch_status") or "").strip().lower()
            if statuses and status not in statuses:
                continue
            location_id = (row.get("location_id") or "").strip()
            note_text = (row.get("note") or "").strip()
            add_note(notes_by_location, location_id, note_text)


def load_pipeline_notes(path, statuses, notes_by_location):
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            status = (row.get("patch_status") or "").strip().lower()
            if statuses and status not in statuses:
                continue
            location_id = (row.get("uuid") or "").strip()
            note_text = (row.get("patch_notes") or "").strip()
            add_note(notes_by_location, location_id, note_text)


def build_note_key(uuid, date_key, note_text):
    note_value = note_text if isinstance(note_text, str) else str(note_text or "")
    note_hash = hashlib.sha1(note_value.encode("utf-8")).hexdigest()
    note_key = f"{uuid}|{date_key}|{note_hash}"
    return note_key, note_hash


def load_processed_keys(path):
    processed = set()
    if not path or not os.path.exists(path):
        return processed
    with open(path, "r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            status = (row.get("status") or "").strip().lower()
            if status != "ok":
                continue
            note_key = (row.get("note_key") or "").strip()
            if note_key:
                processed.add(note_key)
    return processed


def main(argv):
    args = parse_args(argv)
    token = args.token or os.getenv("DOOBNEEK_JWT") or os.getenv("JWT")
    if not token and not args.dry_run:
        print("Missing token. Provide --token or set DOOBNEEK_JWT/JWT.", file=sys.stderr)
        return 2

    statuses = parse_statuses(args.statuses)
    notes_by_location = {}
    load_text_phone_notes(args.text_phone_csv, statuses, notes_by_location)
    load_pipeline_notes(args.pipeline_csv, statuses, notes_by_location)

    today = args.date.strip() if args.date else time.strftime("%Y-%m-%d")
    processed_keys = load_processed_keys(args.progress_csv) if args.resume else set()
    resume_skipped = 0
    batch_size = max(int(args.batch_size or 0), 0)
    if batch_size <= 0:
        batch_size = len(notes_by_location) or 1

    items = []
    for location_id, entry in notes_by_location.items():
        note_text = " | ".join(entry["parts"]).strip()
        if not note_text:
            continue
        if not has_revalidate_tag(note_text):
            note_text = f"{note_text} <<did not revalidate>>"
        note_key, note_hash = build_note_key(location_id, today, note_text)
        if args.resume and note_key in processed_keys:
            resume_skipped += 1
            continue
        items.append(
            {
                "uuid": location_id,
                "userName": args.notes_user,
                "date": today,
                "note": note_text,
                "_note_key": note_key,
                "_note_hash": note_hash,
            }
        )

    if args.limit and len(items) > args.limit:
        items = items[: args.limit]

    print(
        f"Notes ready: {len(items)} (batch_size={batch_size}, statuses={sorted(statuses)}, "
        f"resume_skipped={resume_skipped})"
    )
    if args.dry_run:
        return 0

    progress_fields = [
        "note_key",
        "uuid",
        "date",
        "note_hash",
        "status",
        "error",
        "timestamp",
        "note",
    ]
    progress_writer = None
    progress_handle = None

    def write_progress(entry):
        nonlocal progress_writer, progress_handle
        if args.dry_run or not args.progress_csv:
            return
        if progress_writer is None:
            exists = os.path.exists(args.progress_csv)
            progress_handle = open(
                args.progress_csv, "a" if exists else "w", newline="", encoding="utf-8"
            )
            progress_writer = csv.DictWriter(progress_handle, fieldnames=progress_fields)
            if not exists:
                progress_writer.writeheader()
        progress_writer.writerow(entry)
        progress_handle.flush()

    headers = build_note_headers(token)
    for idx in range(0, len(items), batch_size):
        batch = items[idx : idx + batch_size]
        payload_batch = [
            {
                "uuid": item["uuid"],
                "userName": item["userName"],
                "date": item["date"],
                "note": item["note"],
            }
            for item in batch
        ]
        status, body = http_request(
            "POST",
            args.note_api,
            headers=headers,
            payload={"batch": payload_batch},
            timeout=30,
        )
        if status is None or status >= 300:
            print(f"[ERROR] POST batch {idx}: {status} {body}")
            error_text = f"{status} {body}".strip()
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            for item in batch:
                write_progress(
                    {
                        "note_key": item["_note_key"],
                        "uuid": item["uuid"],
                        "date": item["date"],
                        "note_hash": item["_note_hash"],
                        "status": "error",
                        "error": error_text,
                        "timestamp": timestamp,
                        "note": item["note"],
                    }
                )
            return 1
        errors = parse_note_batch_errors(body)
        if errors:
            error_map = {}
            for entry in errors:
                if not isinstance(entry, dict):
                    continue
                idx_value = entry.get("index")
                uuid_value = entry.get("uuid")
                error_text = entry.get("error") or entry.get("message") or "note_error"
                if isinstance(idx_value, int):
                    error_map[idx_value] = error_text
                elif uuid_value:
                    for i, item in enumerate(batch):
                        if item["uuid"] == uuid_value:
                            error_map[i] = error_text
                            break
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            for i, item in enumerate(batch):
                error_text = error_map.get(i, "")
                write_progress(
                    {
                        "note_key": item["_note_key"],
                        "uuid": item["uuid"],
                        "date": item["date"],
                        "note_hash": item["_note_hash"],
                        "status": "error" if error_text else "ok",
                        "error": error_text,
                        "timestamp": timestamp,
                        "note": item["note"],
                    }
                )
            print(f"[ERROR] batch returned {len(errors)} errors")
            print(json.dumps(errors[:5], ensure_ascii=True))
            return 1
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        for item in batch:
            write_progress(
                {
                    "note_key": item["_note_key"],
                    "uuid": item["uuid"],
                    "date": item["date"],
                    "note_hash": item["_note_hash"],
                    "status": "ok",
                    "error": "",
                    "timestamp": timestamp,
                    "note": item["note"],
                }
            )
        print(f"[OK] batch {idx} ({len(batch)} notes)")
    if progress_handle:
        progress_handle.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

