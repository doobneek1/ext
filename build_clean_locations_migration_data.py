#!/usr/bin/env python3
import argparse
import csv
import json
import os
import sys


def default_output_dir():
    here = os.path.abspath(os.path.dirname(__file__))
    return os.path.abspath(
        os.path.join(here, "..", "streetlives-api", "sequelize", "migrations", "data")
    )


def parse_args(argv):
    parser = argparse.ArgumentParser(
        description="Build migration data JSON files from patched CSVs."
    )
    parser.add_argument(
        "--text-phone-csv",
        default="locations_text_phone_patched.csv",
        help="CSV with service/phone updates.",
    )
    parser.add_argument(
        "--pipeline-csv",
        default="locations_pipeline_patched.csv",
        help="CSV with location pipeline updates.",
    )
    parser.add_argument(
        "--output-dir",
        default=default_output_dir(),
        help="Directory to write migration JSON data files.",
    )
    parser.add_argument(
        "--text-phone-json",
        default="20260112-clean-text-phones.json",
        help="Output filename for service/phone updates JSON.",
    )
    parser.add_argument(
        "--pipeline-json",
        default="20260112-location-pipeline.json",
        help="Output filename for location updates JSON.",
    )
    parser.add_argument(
        "--statuses",
        default="patched",
        help="Comma-separated patch_status values to include.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print counts without writing files.",
    )
    return parser.parse_args(argv)


def parse_statuses(value):
    if not value:
        return set()
    return {item.strip().lower() for item in value.split(",") if item.strip()}


def load_json_payload(raw):
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def merge_payload(target, payload):
    if not isinstance(payload, dict):
        return
    for key, value in payload.items():
        if value is None:
            continue
        target[key] = value


def build_text_phone_updates(path, statuses):
    service_updates = {}
    phone_updates = {}
    service_order = []
    phone_order = []
    invalid_payloads = 0

    if not os.path.exists(path):
        return [], [], invalid_payloads

    with open(path, "r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            status = (row.get("patch_status") or "").strip().lower()
            if statuses and status not in statuses:
                continue
            target = (row.get("target") or "").strip().lower()
            payload = load_json_payload((row.get("payload") or "").strip())
            if payload is None:
                invalid_payloads += 1
                continue
            location_id = (row.get("location_id") or "").strip()

            if target == "service_update":
                service_id = (row.get("service_id") or "").strip()
                if not service_id:
                    continue
                entry = service_updates.get(service_id)
                if not entry:
                    entry = {
                        "service_id": service_id,
                        "location_id": location_id,
                        "payload": {},
                    }
                    service_updates[service_id] = entry
                    service_order.append(service_id)
                if location_id:
                    entry["location_id"] = location_id
                merge_payload(entry["payload"], payload)
            elif target == "phone_number":
                phone_id = (row.get("phone_id") or "").strip()
                if not phone_id:
                    continue
                entry = phone_updates.get(phone_id)
                if not entry:
                    entry = {
                        "phone_id": phone_id,
                        "location_id": location_id,
                        "payload": {},
                    }
                    phone_updates[phone_id] = entry
                    phone_order.append(phone_id)
                if location_id:
                    entry["location_id"] = location_id
                merge_payload(entry["payload"], payload)

    service_list = [
        entry
        for service_id in service_order
        if (entry := service_updates.get(service_id))
        and entry.get("payload")
    ]
    phone_list = [
        entry
        for phone_id in phone_order
        if (entry := phone_updates.get(phone_id))
        and entry.get("payload")
    ]
    return service_list, phone_list, invalid_payloads


def build_pipeline_updates(path, statuses):
    location_updates = {}
    location_order = []
    invalid_payloads = 0

    if not os.path.exists(path):
        return [], invalid_payloads

    with open(path, "r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            status = (row.get("patch_status") or "").strip().lower()
            if statuses and status not in statuses:
                continue
            uuid = (row.get("uuid") or "").strip()
            if not uuid:
                continue
            payload = load_json_payload((row.get("payload") or "").strip())
            if payload is None:
                invalid_payloads += 1
                continue

            entry = location_updates.get(uuid)
            if not entry:
                entry = {"location_id": uuid, "payload": {}, "patch_status": status}
                location_updates[uuid] = entry
                location_order.append(uuid)

            if status == "patched":
                entry["patch_status"] = "patched"
            elif not entry.get("patch_status"):
                entry["patch_status"] = status

            merge_payload(entry["payload"], payload)

    location_list = [
        entry
        for uuid in location_order
        if (entry := location_updates.get(uuid))
        and entry.get("payload")
    ]
    return location_list, invalid_payloads


def write_json(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=True, indent=2)
        handle.write("\n")


def main(argv):
    args = parse_args(argv)
    statuses = parse_statuses(args.statuses)

    service_updates, phone_updates, text_errors = build_text_phone_updates(
        args.text_phone_csv, statuses
    )
    location_updates, pipeline_errors = build_pipeline_updates(
        args.pipeline_csv, statuses
    )

    print(
        "Service/phone updates:",
        len(service_updates),
        "services,",
        len(phone_updates),
        "phones",
    )
    print("Location updates:", len(location_updates))
    if text_errors or pipeline_errors:
        print(
            "Skipped invalid payloads:",
            text_errors + pipeline_errors,
            f"(text/phone={text_errors}, pipeline={pipeline_errors})",
        )

    if args.dry_run:
        return 0

    output_dir = os.path.abspath(args.output_dir)
    text_path = os.path.join(output_dir, args.text_phone_json)
    pipeline_path = os.path.join(output_dir, args.pipeline_json)

    write_json(
        text_path,
        {"serviceUpdates": service_updates, "phoneUpdates": phone_updates},
    )
    write_json(pipeline_path, {"locationUpdates": location_updates})

    print("Wrote:", text_path)
    print("Wrote:", pipeline_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
