#!/usr/bin/env python3
import argparse
import csv
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
DEFAULT_LOCATION_API = "https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations"
DEFAULT_SERVICE_API = "https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/services"
DEFAULT_PHONE_API = "https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/phones"
DEFAULT_NOTE_API = "https://locationnote1-iygwucy2fa-uc.a.run.app"
DEFAULT_NOTE_BASE_URL = "https://doobneek-fe7b7-default-rtdb.firebaseio.com/"
REQUEST_DELAY_MIN = 0.0
REQUEST_DELAY_MAX = 0.0
EVENT_OCCASION = "COVID19"
BULLET = "\u2022"
EMPTY_VALUES = {"", "null", "none", "nan", "na", "n/a"}
ANCHOR_RE = re.compile(r"(<a\b[^>]*>.*?</a>)", re.IGNORECASE | re.DOTALL)
BROKEN_CLOSE_ANCHOR_RE = re.compile(
    r"</a(?=\s|$|[<\)\]\}\.,;:!?])",
    re.IGNORECASE,
)
BR_RE = re.compile(r"<br\s*\/?>", re.IGNORECASE)
EMAIL_OR_URL_RE = re.compile(
    r"(?P<email>[\w.+-]+@[\w.-]+\.\w{2,})|(?P<url>\b[^\s<>()|]+\.[^\s<>()|]+)",
    re.IGNORECASE,
)
PHONE_RE = re.compile(
    r"(?<!\d)(?P<num>\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})"
    r"(?P<ext>\s*(?:x|ext\.?|extension)\s*\d+)?",
    re.IGNORECASE,
)
EXT_WORD_RE = re.compile(r"^\s*(?:ext\.?|extension|#)\b", re.IGNORECASE)
EXT_COMMA_RE = re.compile(r"^\s*(?:,|;)\s*\d+")
EXT_SPACE_DIGITS_RE = re.compile(r"^\s+\d+")
def parse_args(argv):
    parser = argparse.ArgumentParser(
        description="Clean service/location text and phone numbers from issue CSV."
    )
    parser.add_argument(
        "--csv",
        default="locationswissuesignoreinvalidemailflag1.csv",
        help="Input CSV file with text/phone issues.",
    )
    parser.add_argument(
        "--token",
        help="JWT token. If omitted, uses DOOBNEEK_JWT or JWT env var.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generate payloads without PATCH calls or NOTE_API writes.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process only the first N text rows (0 = no limit).",
    )
    parser.add_argument(
        "--fast",
        action="store_true",
        help="Skip API comparisons and use CSV values for faster runs.",
    )
    parser.add_argument(
        "--delay-min",
        type=float,
        default=0.5,
        help="Minimum seconds to sleep before each network request (0 to disable).",
    )
    parser.add_argument(
        "--delay-max",
        type=float,
        default=1.5,
        help="Maximum seconds to sleep before each network request (0 to disable).",
    )
    parser.add_argument(
        "--notes-user",
        default="doobneek",
        help="Username for locationNotes entries.",
    )
    parser.add_argument(
        "--note-api",
        default=DEFAULT_NOTE_API,
        help=f"NOTE_API endpoint (default: {DEFAULT_NOTE_API}).",
    )
    parser.add_argument(
        "--note-base-url",
        default=DEFAULT_NOTE_BASE_URL,
        help="Base URL for locationNotes reads.",
    )
    parser.add_argument(
        "--location-api",
        default=DEFAULT_LOCATION_API,
        help=f"Locations API base (default: {DEFAULT_LOCATION_API}).",
    )
    parser.add_argument(
        "--service-api",
        default=DEFAULT_SERVICE_API,
        help=f"Services API base (default: {DEFAULT_SERVICE_API}).",
    )
    parser.add_argument(
        "--phone-api",
        default=DEFAULT_PHONE_API,
        help=f"Phones API base (default: {DEFAULT_PHONE_API}).",
    )
    parser.add_argument(
        "--patched-csv",
        default="locations_text_phone_patched.csv",
        help="CSV report of patched rows.",
    )
    parser.add_argument(
        "--flagged-csv",
        default="locations_text_phone_flagged.csv",
        help="CSV report of flagged/unpatched rows.",
    )
    parser.add_argument(
        "--flag-combo-limit",
        type=int,
        default=0,
        help="In dry-run, keep only the first row per unique reason combination (0 = no limit).",
    )
    parser.add_argument(
        "--patch-limit",
        type=int,
        default=0,
        help="Stop after applying N patches (0 = no limit).",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip patch keys already recorded in the progress CSV.",
    )
    parser.add_argument(
        "--progress-csv",
        default="locations_text_phone_progress.csv",
        help="CSV path to record attempted patches.",
    )
    return parser.parse_args(argv)
def normalize_header(text):
    return (text or "").strip().lower()
def build_header_map(headers):
    mapping = {}
    for header in headers or []:
        key = normalize_header(header)
        if key and key not in mapping:
            mapping[key] = header
    return mapping
def is_empty(value):
    if value is None:
        return True
    if isinstance(value, str):
        return normalize_header(value) in EMPTY_VALUES
    return False
def get_value(row, header_map, *candidates):
    for candidate in candidates:
        key = normalize_header(candidate)
        header = header_map.get(key)
        if not header:
            continue
        value = row.get(header)
        if is_empty(value):
            continue
        if isinstance(value, str):
            return value.strip()
        return str(value)
    return ""
def split_semicolon_list(value):
    if not value:
        return []
    return [item.strip() for item in str(value).split(";") if item.strip()]
def set_request_delay(min_seconds, max_seconds):
    global REQUEST_DELAY_MIN, REQUEST_DELAY_MAX
    min_value = max(float(min_seconds or 0), 0.0)
    max_value = max(float(max_seconds or 0), min_value)
    REQUEST_DELAY_MIN = min_value
    REQUEST_DELAY_MAX = max_value
def maybe_sleep_before_request():
    if REQUEST_DELAY_MAX <= 0:
        return
    if REQUEST_DELAY_MIN >= REQUEST_DELAY_MAX:
        time.sleep(REQUEST_DELAY_MAX)
        return
    time.sleep(random.uniform(REQUEST_DELAY_MIN, REQUEST_DELAY_MAX))
def http_request(method, url, headers, payload=None, timeout=30):
    maybe_sleep_before_request()
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
def http_get_json(url, timeout=30):
    maybe_sleep_before_request()
    req = urllib.request.Request(url, headers={"accept": "application/json, text/plain, */*"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))
def build_headers(token, is_json=True):
    headers = {"accept": "application/json, text/plain, */*"}
    if token:
        headers["authorization"] = token
    if is_json:
        headers["content-type"] = "application/json"
    return headers
def build_note_headers(token):
    headers = {"Content-Type": "application/json"}
    if token:
        value = token.strip()
        if not value.lower().startswith("bearer "):
            value = f"Bearer {value}"
        headers["Authorization"] = value
    return headers
def is_auth_error(status, body):
    if status in (401, 403):
        return True
    if isinstance(body, str) and "expired" in body.lower() and "token" in body.lower():
        return True
    return False
def normalize_http_body(body, limit=500):
    if body is None:
        return ""
    text = " ".join(str(body).replace("\r", " ").replace("\n", " ").split())
    if len(text) > limit:
        return text[:limit] + "..."
    return text
def format_http_error(method, url, status, body, limit=500):
    status_label = "no_status" if status is None else str(status)
    body_text = normalize_http_body(body, limit=limit)
    if body_text:
        return f"{method} {url} -> {status_label} {body_text}"
    return f"{method} {url} -> {status_label}"
def normalize_raw_text(text):
    if text is None:
        return ""
    value = str(text)
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = value.replace("\\n", "\n")
    value = value.replace("\u00e2\u20ac\u00a2", BULLET)
    value = value.replace("\u00c2\u2022", BULLET)
    return value
def trim_excess_blank_lines(text):
    lines = text.split("\n")
    while lines and lines[-1].strip() == "":
        lines.pop()
    cleaned = []
    blank_count = 0
    for line in lines:
        if line.strip() == "":
            blank_count += 1
            if blank_count <= 2:
                cleaned.append("")
            continue
        blank_count = 0
        cleaned.append(line)
    return "\n".join(cleaned)
def repair_anchor_markup(text):
    value = text
    value = BROKEN_CLOSE_ANCHOR_RE.sub("</a>", value)
    value = re.sub(
        r'href=\s*(tel|sms|mailto):\"?([^\s\">]+)\"?',
        r'href="\1:\2"',
        value,
        flags=re.IGNORECASE,
    )
    return value
def has_unbalanced_anchors(text):
    if BROKEN_CLOSE_ANCHOR_RE.search(text):
        return True
    opens = len(re.findall(r"<a\b", text, flags=re.IGNORECASE))
    closes = len(re.findall(r"</a>", text, flags=re.IGNORECASE))
    return opens != closes
def normalize_line(line):
    value = (line or "").strip()
    if not value:
        return ""
    value = re.sub(r"^(?:&nbsp;|&emsp;|\s)+", "", value)
    value = re.sub(r"^[\u2022\-\u2013*]\s*", "", value)
    return value.strip()
def normalize_url(raw_url):
    if not raw_url:
        return None
    trimmed = raw_url.strip()
    if not trimmed:
        return None
    if not re.match(r"^https?://", trimmed, re.IGNORECASE):
        trimmed = f"https://{trimmed}"
    try:
        parsed = urllib.parse.urlparse(trimmed)
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"}:
        return None
    host = parsed.hostname or ""
    if not host or "." not in host:
        return None
    segments = [seg for seg in host.split(".") if seg]
    if len(segments) < 2:
        return None
    tld = segments[-1]
    sld = segments[-2] if len(segments) >= 2 else ""
    if not re.match(r"^[a-z]{2,24}$", tld, re.IGNORECASE):
        return None
    if len(sld) < 2:
        return None
    return parsed
def url_display(parsed):
    host = parsed.hostname or ""
    display = host + (parsed.path or "")
    if parsed.query:
        display += "?" + parsed.query
    if parsed.fragment:
        display += "#" + parsed.fragment
    return display.replace("www.", "", 1)
def split_trailing_punct(text):
    trailing = ""
    while text and text[-1] in ".,;:!?":
        trailing = text[-1] + trailing
        text = text[:-1]
    return text, trailing
def linkify_phones(segment):
    output = []
    flags = []
    last = 0
    for match in PHONE_RE.finditer(segment):
        start, end = match.span()
        output.append(segment[last:start])
        num = match.group("num")
        ext = match.group("ext") or ""
        before = segment[max(0, start - 6):start].lower()
        if before.endswith("tel:") or before.endswith("sms:"):
            output.append(segment[start:end])
            flags.append("phone_scheme_prefix")
            last = end
            continue
        if not ext:
            after = segment[end:]
            if (
                EXT_WORD_RE.match(after)
                or EXT_COMMA_RE.match(after)
                or EXT_SPACE_DIGITS_RE.match(after)
            ):
                output.append(segment[start:end])
                flags.append("phone_ext_ambiguous")
                last = end
                continue
        digits = re.sub(r"\D", "", num)
        if len(digits) == 11 and digits.startswith("1"):
            digits = digits[1:]
        if len(digits) != 10:
            output.append(segment[start:end])
            flags.append("phone_digits_length")
            last = end
            continue
        ext_digits = ""
        if ext:
            ext_digits = re.sub(r"\D", "", ext)
            if not ext_digits:
                output.append(segment[start:end])
                flags.append("phone_ext_missing")
                last = end
                continue
        formatted = f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
        if ext_digits:
            anchor = f'<a href="tel:{digits},{ext_digits}">{formatted} x{ext_digits}</a>'
        else:
            anchor = f'<a href="tel:{digits}">{formatted}</a>'
        output.append(anchor)
        last = end
    output.append(segment[last:])
    return "".join(output), flags
def linkify_plain(segment):
    output = []
    flags = []
    pos = 0
    for match in EMAIL_OR_URL_RE.finditer(segment):
        start, end = match.span()
        if start > pos:
            linked, phone_flags = linkify_phones(segment[pos:start])
            output.append(linked)
            flags.extend(phone_flags)
        if match.group("email"):
            email, trailing = split_trailing_punct(match.group("email"))
            output.append(f'<a href="mailto:{email}">{email}</a>{trailing}')
        else:
            raw_url = match.group("url")
            raw_url, trailing = split_trailing_punct(raw_url)
            parsed = normalize_url(raw_url)
            if not parsed:
                output.append(raw_url + trailing)
            else:
                display = url_display(parsed)
                attrs = [f'href="{parsed.geturl()}"']
                if not parsed.hostname.endswith("yourpeer.nyc"):
                    attrs.append('target="_blank"')
                    attrs.append('rel="noopener noreferrer"')
                output.append(f"<a {' '.join(attrs)}>{display}</a>{trailing}")
        pos = end
    if pos < len(segment):
        linked, phone_flags = linkify_phones(segment[pos:])
        output.append(linked)
        flags.extend(phone_flags)
    return "".join(output), flags
def linkify_line(line):
    parts = ANCHOR_RE.split(line)
    output = []
    flags = []
    for part in parts:
        if part.lower().startswith("<a "):
            output.append(part)
            continue
        linked, part_flags = linkify_plain(part)
        output.append(linked)
        flags.extend(part_flags)
    return "".join(output), flags
def clean_text(raw_text, source):
    flags = []
    normalized = normalize_raw_text(raw_text)
    normalized = repair_anchor_markup(normalized)
    if has_unbalanced_anchors(normalized):
        flags.append("broken_html")
    normalized = BR_RE.sub("\n<br>", normalized)
    normalized = re.sub(
        rf"([^\r\n])\s*{re.escape(BULLET)}\s+",
        rf"\1\n{BULLET} ",
        normalized,
    )
    normalized = re.sub(rf"^\s*{re.escape(BULLET)}", BULLET, normalized, flags=re.MULTILINE)
    normalized = trim_excess_blank_lines(normalized)
    lines = normalized.split("\n")
    non_empty_lines = sum(1 for line in lines if line.strip())
    if non_empty_lines == 0:
        return "", flags
    should_add_bullets = non_empty_lines > 1
    output_lines = []
    pending_break = False
    for idx, line in enumerate(lines):
        raw = line.strip()
        if not raw:
            if pending_break:
                output_lines.append({"text": "<br>", "skip_linkify": True})
            pending_break = True
            continue
        if raw.lower().startswith("<br>"):
            after = raw[4:].lstrip()
            if after.startswith(BULLET):
                raw = "<br>" + after[len(BULLET) :].lstrip()
        elif raw.startswith(BULLET):
            raw = raw[len(BULLET) :].lstrip()
        is_first = idx == 0
        already_bullet = raw.startswith("<br>&emsp;—") or raw.startswith("<br>")
        had_pending_break = pending_break
        pending_break = False
        if not already_bullet and not (is_first and raw.endswith(":")):
            if raw.startswith("-"):
                raw = f"<br>&emsp;— {raw[1:].strip()}"
            elif had_pending_break:
                raw = f"<br>{raw}"
            elif should_add_bullets:
                raw = f"{BULLET} {raw}"
        output_lines.append({"text": raw, "skip_linkify": False})
    rendered = []
    for entry in output_lines:
        if entry["skip_linkify"]:
            rendered.append(entry["text"])
            continue
        linked, line_flags = linkify_line(entry["text"])
        rendered.append(linked)
        flags.extend(line_flags)
    return "\n".join(rendered), flags
def find_service_event_info(service):
    infos = service.get("EventRelatedInfos")
    if not isinstance(infos, list):
        return None
    for info in infos:
        if info.get("event") == EVENT_OCCASION:
            return info
    return None
def find_location_event_info(location):
    infos = location.get("EventRelatedInfos")
    if not isinstance(infos, list):
        return None
    for info in infos:
        if info.get("event") == EVENT_OCCASION and not info.get("service_id"):
            return info
    for info in infos:
        if not info.get("service_id"):
            return info
    return None
def build_service_link(location_id, service_id, suffix):
    return f"https://gogetta.nyc/team/location/{location_id}/services/{service_id}/{suffix}"
def build_location_link(location_id):
    return f"https://gogetta.nyc/team/location/{location_id}"
def build_phone_link(location_id, phone_id):
    return (
        f"https://gogetta.nyc/team/location/{location_id}/questions/phone-number/{phone_id}"
    )
def fetch_existing_note(note_base_url, uuid, user_name, date_key, timeout=20):
    maybe_sleep_before_request()
    base = note_base_url.rstrip("/") + "/"
    url = f"{base}locationNotes/{uuid}/{user_name}/{date_key}.json"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return ""
        return ""
    except Exception:
        return ""
    if isinstance(data, str):
        return data.strip()
    return ""
def contains_revalidate_tag(note_text):
    lower = note_text.lower()
    return "<<did not revalidate>>" in lower or "<<didnt revalidate>>" in lower
def main(argv):
    args = parse_args(argv)
    set_request_delay(args.delay_min, args.delay_max)
    token = args.token or os.getenv("DOOBNEEK_JWT") or os.getenv("JWT")
    if not token and not args.dry_run:
        print("Missing token. Provide --token or set DOOBNEEK_JWT/JWT.", file=sys.stderr)
        return 2
    text_rows = {}
    phone_number_ids = {}
    phone_extension_ids = {}
    phone_number_values = {}
    phone_extension_values = {}
    phone_id_locations = {}
    with open(args.csv, "r", encoding="cp1252", newline="") as handle:
        reader = csv.DictReader(handle)
        header_map = build_header_map(reader.fieldnames or [])
        for row in reader:
            source = get_value(row, header_map, "source")
            location_id = get_value(row, header_map, "location_id")
            service_id = get_value(row, header_map, "service_id")
            text = get_value(row, header_map, "text")
            if location_id:
                bad_phone_ids = split_semicolon_list(
                    get_value(row, header_map, "bad_phone_ids")
                )
                bad_phone_numbers = split_semicolon_list(
                    get_value(row, header_map, "bad_phone_numbers")
                )
                if bad_phone_ids:
                    phone_number_ids.setdefault(location_id, set()).update(bad_phone_ids)
                    for idx, phone_id in enumerate(bad_phone_ids):
                        phone_id_locations.setdefault(phone_id, location_id)
                        if idx < len(bad_phone_numbers):
                            phone_number_values.setdefault(phone_id, bad_phone_numbers[idx])
                bad_extension_ids = split_semicolon_list(
                    get_value(row, header_map, "bad_extension_ids")
                )
                bad_phone_extensions = split_semicolon_list(
                    get_value(row, header_map, "bad_phone_extensions")
                )
                if bad_extension_ids:
                    phone_extension_ids.setdefault(location_id, set()).update(bad_extension_ids)
                    for idx, phone_id in enumerate(bad_extension_ids):
                        phone_id_locations.setdefault(phone_id, location_id)
                        if idx < len(bad_phone_extensions):
                            phone_extension_values.setdefault(phone_id, bad_phone_extensions[idx])
            if not source or not text:
                continue
            key = (location_id, service_id, source)
            if key not in text_rows:
                text_rows[key] = {
                    "location_id": location_id,
                    "service_id": service_id,
                    "source": source,
                    "text": text,
                }
    location_cache = {}
    text_updates = {}
    location_updates = {}
    phone_updates = []
    note_updates = {}
    patched_count = 0
    flagged_count = 0
    patched_writer = None
    patched_handle = None
    flagged_writer = None
    flagged_handle = None
    patched_fields = [
        "location_id",
        "service_id",
        "phone_id",
        "source",
        "target",
        "patch_status",
        "edit_url",
        "excel_link",
        "payload",
        "note",
    ]
    flagged_fields = [
        "location_id",
        "service_id",
        "phone_id",
        "source",
        "target",
        "reason",
        "url",
        "excel_link",
        "text_excerpt",
    ]
    progress_fields = [
        "patch_key",
        "location_id",
        "service_id",
        "phone_id",
        "target",
        "edit_url",
        "excel_link",
        "status",
        "note",
        "timestamp",
    ]
    flag_combo_limit = max(int(args.flag_combo_limit or 0), 0)
    limit_flags = args.dry_run and flag_combo_limit > 0
    seen_flag_combos = set()
    patch_limit = max(int(args.patch_limit or 0), 0)
    patch_count = 0
    stop_processing = False
    stop_reason = ""
    stop_patch_key = ""
    stop_for_error = False
    progress_writer = None
    progress_handle = None
    processed_keys = set()
    append_reports = bool(args.resume)
    def build_excel_link(url):
        if not url:
            return ""
        return f'=HYPERLINK("{url}")'
    def open_report_writer(path, fieldnames, append):
        exists = os.path.exists(path)
        file_empty = not exists or os.path.getsize(path) == 0
        mode = "a" if append and exists else "w"
        handle = open(path, mode, newline="", encoding="utf-8")
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        if mode == "w" or file_empty:
            writer.writeheader()
            handle.flush()
        return writer, handle
    def write_patched(row):
        nonlocal patched_writer, patched_handle, patched_count
        if patched_writer is None:
            patched_writer, patched_handle = open_report_writer(
                args.patched_csv, patched_fields, append_reports
            )
        patched_writer.writerow(row)
        patched_handle.flush()
        patched_count += 1
    def write_flagged(row):
        nonlocal flagged_writer, flagged_handle, flagged_count
        if flagged_writer is None:
            flagged_writer, flagged_handle = open_report_writer(
                args.flagged_csv, flagged_fields, append_reports
            )
        flagged_writer.writerow(row)
        flagged_handle.flush()
        flagged_count += 1
    def add_flagged(row):
        if limit_flags:
            reason = row.get("reason") or ""
            if reason in seen_flag_combos:
                return
            if len(seen_flag_combos) >= flag_combo_limit:
                return
            seen_flag_combos.add(reason)
        if "url" in row and "excel_link" not in row:
            row["excel_link"] = build_excel_link(row.get("url"))
        write_flagged(row)
    def make_patch_key(kind, entity_id, target=""):
        if target:
            return f"{kind}:{entity_id}:{target}"
        return f"{kind}:{entity_id}"
    def build_edit_url(location_id, service_id, phone_id, target, payload=None):
        if phone_id or target in {"phone_number", "phone_extension"}:
            if location_id and phone_id:
                return build_phone_link(location_id, phone_id)
            if location_id:
                return f"https://gogetta.nyc/team/location/{location_id}/questions/phone-number"
            return ""
        if service_id:
            if "other" in (target or ""):
                return build_service_link(location_id, service_id, "other-info")
            if "description" in (target or ""):
                return build_service_link(location_id, service_id, "description")
            if payload:
                if "description" in payload:
                    return build_service_link(location_id, service_id, "description")
                if "eventRelatedInfo" in payload:
                    return build_service_link(location_id, service_id, "other-info")
            return build_service_link(location_id, service_id, "description")
        if location_id:
            return build_location_link(location_id)
        return ""
    def load_processed_keys():
        if not args.resume or not os.path.exists(args.progress_csv):
            return
        with open(args.progress_csv, "r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                key = (row.get("patch_key") or "").strip()
                status = (row.get("status") or "").strip().lower()
                if key and status in {"patched", "dry_run"}:
                    processed_keys.add(key)
    def write_progress(entry):
        nonlocal progress_writer, progress_handle
        if args.dry_run:
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
    load_processed_keys()
    def load_location(location_id):
        if location_id in location_cache:
            return location_cache[location_id]
        url = f"{args.location_api}/{location_id}"
        try:
            data = http_get_json(url)
        except Exception as exc:
            data = {"_error": str(exc)}
        location_cache[location_id] = data
        return data
    processed = 0
    for key in sorted(text_rows.keys()):
        if args.limit and processed >= args.limit:
            break
        processed += 1
        row = text_rows[key]
        location_id = row["location_id"]
        service_id = row["service_id"]
        source = row["source"].strip().lower()
        if source not in {"event", "service"} or not location_id:
            continue
        if not service_id:
            reason = "location_event_not_supported" if source == "event" else "missing_service_id"
            target = "service_other_info" if source == "event" else "service_description"
            csv_text = normalize_raw_text(row["text"])
            add_flagged(
                {
                    "location_id": location_id,
                    "service_id": service_id,
                    "phone_id": "",
                    "source": source,
                    "target": target,
                    "reason": reason,
                    "url": build_location_link(location_id),
                    "text_excerpt": csv_text[:200],
                }
            )
            continue
        if args.fast:
            target = "service_description" if source == "service" else "service_other_info"
            csv_text = normalize_raw_text(row["text"])
            cleaned, flags = clean_text(csv_text, "service" if source == "service" else "event")
            if flags:
                add_flagged(
                    {
                        "location_id": location_id,
                        "service_id": service_id,
                        "phone_id": "",
                        "source": source,
                        "target": target,
                        "reason": ";".join(sorted(set(flags))),
                        "url": (
                            build_service_link(location_id, service_id, "description")
                            if service_id and source == "service"
                            else build_service_link(location_id, service_id, "other-info")
                            if service_id
                            else build_location_link(location_id)
                        ),
                        "text_excerpt": csv_text[:200],
                    }
                )
                continue
            if cleaned == csv_text:
                continue
            update = text_updates.setdefault(service_id, {"location_id": location_id})
            if source == "service":
                update["description"] = cleaned
            else:
                update["eventRelatedInfo"] = {"event": EVENT_OCCASION, "information": cleaned}
            continue
        location_data = load_location(location_id)
        if not isinstance(location_data, dict) or location_data.get("_error"):
            add_flagged(
                {
                    "location_id": location_id,
                    "service_id": service_id,
                    "phone_id": "",
                    "source": source,
                    "target": "location",
                    "reason": f"location_fetch_error:{location_data.get('_error')}",
                    "url": build_location_link(location_id),
                    "text_excerpt": "",
                }
            )
            continue
        current_text = ""
        target = ""
        if service_id:
            services = location_data.get("Services") or []
            service = next((svc for svc in services if svc.get("id") == service_id), None)
            if not service:
                add_flagged(
                    {
                        "location_id": location_id,
                        "service_id": service_id,
                        "phone_id": "",
                        "source": source,
                        "target": "service",
                        "reason": "service_not_found",
                        "url": build_service_link(location_id, service_id, "description"),
                        "text_excerpt": "",
                    }
                )
                continue
            if source == "service":
                current_text = service.get("description") or ""
                target = "service_description"
            else:
                info = find_service_event_info(service)
                current_text = (info or {}).get("information") or ""
                target = "service_other_info"
        csv_text = normalize_raw_text(row["text"])
        api_text = normalize_raw_text(current_text)
        if csv_text != api_text:
            add_flagged(
                {
                    "location_id": location_id,
                    "service_id": service_id,
                    "phone_id": "",
                    "source": source,
                    "target": target,
                    "reason": "api_mismatch",
                    "url": (
                        build_service_link(location_id, service_id, "description")
                        if service_id and source == "service"
                        else build_service_link(location_id, service_id, "other-info")
                        if service_id
                        else build_location_link(location_id)
                    ),
                    "text_excerpt": csv_text[:200],
                }
            )
            continue
        cleaned, flags = clean_text(csv_text, "service" if source == "service" else "event")
        if flags:
            add_flagged(
                {
                    "location_id": location_id,
                    "service_id": service_id,
                    "phone_id": "",
                    "source": source,
                    "target": target,
                    "reason": ";".join(sorted(set(flags))),
                    "url": (
                        build_service_link(location_id, service_id, "description")
                        if service_id and source == "service"
                        else build_service_link(location_id, service_id, "other-info")
                        if service_id
                        else build_location_link(location_id)
                    ),
                    "text_excerpt": csv_text[:200],
                }
            )
            continue
        if cleaned == api_text:
            continue
        update = text_updates.setdefault(service_id, {"location_id": location_id})
        if source == "service":
            update["description"] = cleaned
        else:
            update["eventRelatedInfo"] = {"event": EVENT_OCCASION, "information": cleaned}
    if args.fast:
        for phone_id, number in phone_number_values.items():
            location_id = phone_id_locations.get(phone_id, "")
            if not number:
                add_flagged(
                    {
                        "location_id": location_id,
                        "service_id": "",
                        "phone_id": phone_id,
                        "source": "phone",
                        "target": "phone_number",
                        "reason": "missing_phone_number",
                        "url": build_phone_link(location_id, phone_id) if location_id else "",
                        "text_excerpt": "",
                    }
                )
                continue
            digits = re.sub(r"\D", "", number)
            if len(digits) == 11 and digits.startswith("1"):
                digits = digits[1:]
            if len(digits) != 10:
                add_flagged(
                    {
                        "location_id": location_id,
                        "service_id": "",
                        "phone_id": phone_id,
                        "source": "phone",
                        "target": "phone_number",
                        "reason": "phone_digits_length",
                        "url": build_phone_link(location_id, phone_id) if location_id else "",
                        "text_excerpt": number,
                    }
                )
                continue
            if digits == number:
                continue
            phone_updates.append(
                {
                    "location_id": location_id,
                    "phone_id": phone_id,
                    "payload": {"number": digits},
                    "target": "phone_number",
                }
            )
    else:
        for location_id, phone_ids in phone_number_ids.items():
            location_data = load_location(location_id)
            phones = location_data.get("Phones") or []
            phone_map = {phone.get("id"): phone for phone in phones if phone.get("id")}
            for phone_id in sorted(phone_ids):
                phone = phone_map.get(phone_id)
                if not phone:
                    add_flagged(
                        {
                            "location_id": location_id,
                            "service_id": "",
                            "phone_id": phone_id,
                            "source": "phone",
                            "target": "phone_number",
                            "reason": "phone_not_found",
                            "url": build_phone_link(location_id, phone_id),
                            "text_excerpt": "",
                        }
                    )
                    continue
                number = phone.get("number") or ""
                digits = re.sub(r"\D", "", number)
                if len(digits) == 11 and digits.startswith("1"):
                    digits = digits[1:]
                if len(digits) != 10:
                    add_flagged(
                        {
                            "location_id": location_id,
                            "service_id": "",
                            "phone_id": phone_id,
                            "source": "phone",
                            "target": "phone_number",
                            "reason": "phone_digits_length",
                            "url": build_phone_link(location_id, phone_id),
                            "text_excerpt": number,
                        }
                    )
                    continue
                if digits == number:
                    continue
                phone_updates.append(
                    {
                        "location_id": location_id,
                        "phone_id": phone_id,
                        "payload": {"number": digits},
                        "target": "phone_number",
                    }
                )
    if args.fast:
        for phone_id, extension in phone_extension_values.items():
            location_id = phone_id_locations.get(phone_id, "")
            digits = re.sub(r"\D", "", str(extension))
            if not digits:
                add_flagged(
                    {
                        "location_id": location_id,
                        "service_id": "",
                        "phone_id": phone_id,
                        "source": "phone",
                        "target": "phone_extension",
                        "reason": "extension_missing_digits",
                        "url": build_phone_link(location_id, phone_id) if location_id else "",
                        "text_excerpt": str(extension),
                    }
                )
                continue
            if digits == extension:
                continue
            phone_updates.append(
                {
                    "location_id": location_id,
                    "phone_id": phone_id,
                    "payload": {"extension": digits},
                    "target": "phone_extension",
                }
            )
    else:
        for location_id, phone_ids in phone_extension_ids.items():
            location_data = load_location(location_id)
            phones = location_data.get("Phones") or []
            phone_map = {phone.get("id"): phone for phone in phones if phone.get("id")}
            for phone_id in sorted(phone_ids):
                phone = phone_map.get(phone_id)
                if not phone:
                    add_flagged(
                        {
                            "location_id": location_id,
                            "service_id": "",
                            "phone_id": phone_id,
                            "source": "phone",
                            "target": "phone_extension",
                            "reason": "phone_not_found",
                            "url": build_phone_link(location_id, phone_id),
                            "text_excerpt": "",
                        }
                    )
                    continue
                extension = phone.get("extension") or ""
                digits = re.sub(r"\D", "", str(extension))
                if not digits:
                    add_flagged(
                        {
                            "location_id": location_id,
                            "service_id": "",
                            "phone_id": phone_id,
                            "source": "phone",
                            "target": "phone_extension",
                            "reason": "extension_missing_digits",
                            "url": build_phone_link(location_id, phone_id),
                            "text_excerpt": str(extension),
                        }
                    )
                    continue
                if digits == extension:
                    continue
                phone_updates.append(
                    {
                        "location_id": location_id,
                        "phone_id": phone_id,
                        "payload": {"extension": digits},
                        "target": "phone_extension",
                    }
                )
    sorted_phone_updates = sorted(
        phone_updates, key=lambda item: (item["phone_id"], item["target"])
    )
    patch_keys = []
    for service_id in sorted(text_updates):
        patch_keys.append(make_patch_key("service", service_id, "service_update"))
    for location_id in sorted(location_updates):
        patch_keys.append(make_patch_key("location", location_id, "location_update"))
    for entry in sorted_phone_updates:
        patch_keys.append(make_patch_key("phone", entry["phone_id"], entry["target"]))
    total_patch_candidates = len(patch_keys)
    pending_patch_candidates = sum(
        1 for key in patch_keys if not (args.resume and key in processed_keys)
    )
    resume_skipped = total_patch_candidates - pending_patch_candidates if args.resume else 0
    run_total = pending_patch_candidates
    if patch_limit and run_total > patch_limit:
        run_total = patch_limit
    remaining_patches = run_total
    limit_label = str(patch_limit) if patch_limit else "none"
    if total_patch_candidates:
        if args.resume:
            print(
                f"[PLAN] patches_total={total_patch_candidates} "
                f"pending={pending_patch_candidates} resume_skipped={resume_skipped} "
                f"run_total={run_total} run_limit={limit_label}"
            )
        else:
            print(
                f"[PLAN] patches_total={total_patch_candidates} "
                f"pending={pending_patch_candidates} run_total={run_total} "
                f"run_limit={limit_label}"
            )
    else:
        print("[PLAN] patches_total=0")
    def record_note(location_id, note_text):
        if not note_text:
            return
        note_updates.setdefault(location_id, []).append(note_text)
    def summarize_service_change(service_id, label):
        return f"service {service_id} {label} cleaned"
    def summarize_location_change(label):
        return f"location {label} cleaned"
    def summarize_phone_change(phone_id, label):
        return f"phone {phone_id} {label} cleaned"
    def note_remaining(patch_key):
        nonlocal remaining_patches
        if remaining_patches <= 0:
            return
        remaining_patches -= 1
        print(f"[PATCH] {patch_key} (remaining {remaining_patches})")
    for service_id in sorted(text_updates):
        if stop_processing:
            break
        patch_key = make_patch_key("service", service_id, "service_update")
        if args.resume and patch_key in processed_keys:
            continue
        if patch_limit and patch_count >= patch_limit:
            stop_processing = True
            break
        patch_count += 1
        note_remaining(patch_key)
        update = text_updates[service_id]
        location_id = update["location_id"]
        payload = {}
        notes = []
        if "description" in update:
            payload["description"] = update["description"]
            notes.append(summarize_service_change(service_id, "description"))
        if "eventRelatedInfo" in update:
            payload["eventRelatedInfo"] = update["eventRelatedInfo"]
            notes.append(summarize_service_change(service_id, "other-info"))
        patch_status = "dry_run"
        error_note = ""
        if not args.dry_run:
            url = f"{args.service_api}/{service_id}"
            status, body = http_request(
                "PATCH", url, headers=build_headers(token, is_json=True), payload=payload
            )
            if status is None or status >= 300:
                error_note = format_http_error("PATCH", url, status, body)
                if is_auth_error(status, body):
                    patch_status = "auth_error"
                    print(f"[AUTH] {patch_key}: {error_note}")
                else:
                    patch_status = "error"
                    print(f"[ERROR] {patch_key}: {error_note}")
                add_flagged(
                    {
                        "location_id": location_id,
                        "service_id": service_id,
                        "phone_id": "",
                        "source": "service",
                        "target": "service_update",
                        "reason": f"patch_error:{error_note}",
                        "url": build_service_link(location_id, service_id, "description"),
                        "text_excerpt": "",
                    }
                )
            else:
                patch_status = "patched"
        edit_url = build_edit_url(location_id, service_id, "", "service_update", payload)
        note_for_reports = " | ".join(notes)
        if error_note:
            note_for_reports = f"{note_for_reports} | {error_note}" if note_for_reports else error_note
        write_patched(
            {
                "location_id": location_id,
                "service_id": service_id,
                "phone_id": "",
                "source": "service",
                "target": "service_update",
                "patch_status": patch_status,
                "edit_url": edit_url,
                "excel_link": build_excel_link(edit_url),
                "payload": json.dumps(payload, ensure_ascii=True),
                "note": note_for_reports,
            }
        )
        if not args.dry_run:
            write_progress(
                {
                    "patch_key": patch_key,
                    "location_id": location_id,
                    "service_id": service_id,
                    "phone_id": "",
                    "target": "service_update",
                    "edit_url": edit_url,
                    "excel_link": build_excel_link(edit_url),
                    "status": patch_status,
                    "note": note_for_reports,
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                }
            )
            if patch_status in {"patched", "dry_run"}:
                processed_keys.add(patch_key)
        if patch_status == "patched":
            record_note(location_id, " | ".join(notes))
        if patch_status not in {"patched", "dry_run"}:
            stop_processing = True
            stop_for_error = True
            stop_reason = patch_status
            stop_patch_key = patch_key
            break
    for location_id in sorted(location_updates):
        if stop_processing:
            break
        patch_key = make_patch_key("location", location_id, "location_update")
        if args.resume and patch_key in processed_keys:
            continue
        if patch_limit and patch_count >= patch_limit:
            stop_processing = True
            break
        patch_count += 1
        note_remaining(patch_key)
        payload = location_updates[location_id]
        notes = [summarize_location_change("other-info")]
        patch_status = "dry_run"
        error_note = ""
        if not args.dry_run:
            url = f"{args.location_api}/{location_id}"
            status, body = http_request(
                "PATCH", url, headers=build_headers(token, is_json=True), payload=payload
            )
            if status is None or status >= 300:
                error_note = format_http_error("PATCH", url, status, body)
                if is_auth_error(status, body):
                    patch_status = "auth_error"
                    print(f"[AUTH] {patch_key}: {error_note}")
                else:
                    patch_status = "error"
                    print(f"[ERROR] {patch_key}: {error_note}")
                add_flagged(
                    {
                        "location_id": location_id,
                        "service_id": "",
                        "phone_id": "",
                        "source": "event",
                        "target": "location_update",
                        "reason": f"patch_error:{error_note}",
                        "url": build_location_link(location_id),
                        "text_excerpt": "",
                    }
                )
            else:
                patch_status = "patched"
        edit_url = build_edit_url(location_id, "", "", "location_update", payload)
        note_for_reports = " | ".join(notes)
        if error_note:
            note_for_reports = f"{note_for_reports} | {error_note}" if note_for_reports else error_note
        write_patched(
            {
                "location_id": location_id,
                "service_id": "",
                "phone_id": "",
                "source": "event",
                "target": "location_update",
                "patch_status": patch_status,
                "edit_url": edit_url,
                "excel_link": build_excel_link(edit_url),
                "payload": json.dumps(payload, ensure_ascii=True),
                "note": note_for_reports,
            }
        )
        if not args.dry_run:
            write_progress(
                {
                    "patch_key": patch_key,
                    "location_id": location_id,
                    "service_id": "",
                    "phone_id": "",
                    "target": "location_update",
                    "edit_url": edit_url,
                    "excel_link": build_excel_link(edit_url),
                    "status": patch_status,
                    "note": note_for_reports,
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                }
            )
            if patch_status in {"patched", "dry_run"}:
                processed_keys.add(patch_key)
        if patch_status == "patched":
            record_note(location_id, " | ".join(notes))
        if patch_status not in {"patched", "dry_run"}:
            stop_processing = True
            stop_for_error = True
            stop_reason = patch_status
            stop_patch_key = patch_key
            break
    for entry in sorted_phone_updates:
        if stop_processing:
            break
        patch_key = make_patch_key("phone", entry["phone_id"], entry["target"])
        if args.resume and patch_key in processed_keys:
            continue
        if patch_limit and patch_count >= patch_limit:
            stop_processing = True
            break
        patch_count += 1
        note_remaining(patch_key)
        location_id = entry["location_id"]
        phone_id = entry["phone_id"]
        payload = entry["payload"]
        label = "number" if "number" in payload else "extension"
        notes = [summarize_phone_change(phone_id, label)]
        patch_status = "dry_run"
        error_note = ""
        if not args.dry_run:
            url = f"{args.phone_api}/{phone_id}"
            status, body = http_request(
                "PATCH", url, headers=build_headers(token, is_json=True), payload=payload
            )
            if status is None or status >= 300:
                error_note = format_http_error("PATCH", url, status, body)
                if is_auth_error(status, body):
                    patch_status = "auth_error"
                    print(f"[AUTH] {patch_key}: {error_note}")
                else:
                    patch_status = "error"
                    print(f"[ERROR] {patch_key}: {error_note}")
                add_flagged(
                    {
                        "location_id": location_id,
                        "service_id": "",
                        "phone_id": phone_id,
                        "source": "phone",
                        "target": entry["target"],
                        "reason": f"patch_error:{error_note}",
                        "url": build_phone_link(location_id, phone_id),
                        "text_excerpt": "",
                    }
                )
            else:
                patch_status = "patched"
        edit_url = build_edit_url(location_id, "", phone_id, entry["target"], payload)
        note_for_reports = " | ".join(notes)
        if error_note:
            note_for_reports = f"{note_for_reports} | {error_note}" if note_for_reports else error_note
        write_patched(
            {
                "location_id": location_id,
                "service_id": "",
                "phone_id": phone_id,
                "source": "phone",
                "target": entry["target"],
                "patch_status": patch_status,
                "edit_url": edit_url,
                "excel_link": build_excel_link(edit_url),
                "payload": json.dumps(payload, ensure_ascii=True),
                "note": note_for_reports,
            }
        )
        if not args.dry_run:
            write_progress(
                {
                    "patch_key": patch_key,
                    "location_id": location_id,
                    "service_id": "",
                    "phone_id": phone_id,
                    "target": entry["target"],
                    "edit_url": edit_url,
                    "excel_link": build_excel_link(edit_url),
                    "status": patch_status,
                    "note": note_for_reports,
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                }
            )
            if patch_status in {"patched", "dry_run"}:
                processed_keys.add(patch_key)
        if patch_status == "patched":
            record_note(location_id, " | ".join(notes))
        if patch_status not in {"patched", "dry_run"}:
            stop_processing = True
            stop_for_error = True
            stop_reason = patch_status
            stop_patch_key = patch_key
            break
    if not args.dry_run and not stop_for_error:
        today = time.strftime("%Y-%m-%d")
        for location_id, note_list in note_updates.items():
            summary = " | ".join(note_list)
            if not summary:
                continue
            existing = fetch_existing_note(
                args.note_base_url, location_id, args.notes_user, today
            )
            if existing:
                if contains_revalidate_tag(existing):
                    note_text = existing + " | " + summary
                else:
                    note_text = existing + " | " + summary + " <<did not revalidate>>"
            else:
                note_text = summary + " <<did not revalidate>>"
            note_body = {
                "uuid": location_id,
                "userName": args.notes_user,
                "date": today,
                "note": note_text,
            }
            status, body = http_request(
                "POST",
                args.note_api,
                headers=build_note_headers(token),
                payload=note_body,
                timeout=30,
            )
            if status is None or status >= 300:
                error_note = format_http_error("POST", args.note_api, status, body)
                if is_auth_error(status or 0, body):
                    print(f"[AUTH] note:{location_id}: {error_note}")
                    stop_reason = "auth_error"
                else:
                    print(f"[ERROR] note:{location_id}: {error_note}")
                    stop_reason = "note_error"
                add_flagged(
                    {
                        "location_id": location_id,
                        "service_id": "",
                        "phone_id": "",
                        "source": "note",
                        "target": "location_note",
                        "reason": f"note_error:{error_note}",
                        "url": build_location_link(location_id),
                        "text_excerpt": "",
                    }
                )
                stop_processing = True
                stop_for_error = True
                stop_patch_key = f"note:{location_id}"
                break
    if patched_handle:
        patched_handle.close()
    if flagged_handle:
        flagged_handle.close()
    if progress_handle:
        progress_handle.close()
    print(
        f"Done. text_updates={len(text_updates)} location_updates={len(location_updates)} "
        f"phone_updates={len(phone_updates)} patched_rows={patched_count} "
        f"flagged_rows={flagged_count}"
    )
    if stop_for_error:
        suffix = f" at {stop_patch_key}" if stop_patch_key else ""
        print(f"Stopped after {stop_reason or 'error'}{suffix}. Fix and rerun with --resume.")
        if stop_reason == "auth_error":
            print("Auth error encountered. Refresh token and rerun with --resume.")
            return 2
        return 1
    if args.dry_run:
        print("Dry run complete. Re-run without --dry-run to apply patches.")
    return 0
if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
