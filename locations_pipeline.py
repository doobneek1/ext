#!/usr/bin/env python3
import argparse
import base64
import csv
import difflib
import json
import math
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_BASE_URL = "https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations"
DEFAULT_GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
DEFAULT_NOTE_API = "https://locationnote1-iygwucy2fa-uc.a.run.app"
DEFAULT_PATCH_PRIORITY_CSV = "locations_text_phone_patched.csv"
DEFAULT_RUN_STATE_PATH = "locations_pipeline_run_state.json"

RETRYABLE_HTTP_STATUS = {429, 500, 502, 503, 504}
RETRYABLE_GOOGLE_STATUSES = {"OVER_QUERY_LIMIT", "RESOURCE_EXHAUSTED", "UNKNOWN_ERROR"}

EMPTY_VALUES = {"", "null", "none", "nan", "na", "n/a"}
CITY_ALIASES = {"nyc": "new york", "new york city": "new york"}
US_STATE_ABBREV = {
    "alabama": "AL",
    "alaska": "AK",
    "arizona": "AZ",
    "arkansas": "AR",
    "california": "CA",
    "colorado": "CO",
    "connecticut": "CT",
    "delaware": "DE",
    "district of columbia": "DC",
    "florida": "FL",
    "georgia": "GA",
    "hawaii": "HI",
    "idaho": "ID",
    "illinois": "IL",
    "indiana": "IN",
    "iowa": "IA",
    "kansas": "KS",
    "kentucky": "KY",
    "louisiana": "LA",
    "maine": "ME",
    "maryland": "MD",
    "massachusetts": "MA",
    "michigan": "MI",
    "minnesota": "MN",
    "mississippi": "MS",
    "missouri": "MO",
    "montana": "MT",
    "nebraska": "NE",
    "nevada": "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    "ohio": "OH",
    "oklahoma": "OK",
    "oregon": "OR",
    "pennsylvania": "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    "tennessee": "TN",
    "texas": "TX",
    "utah": "UT",
    "vermont": "VT",
    "virginia": "VA",
    "washington": "WA",
    "west virginia": "WV",
    "wisconsin": "WI",
    "wyoming": "WY",
}

DIRECTIONAL_REPLACEMENTS = [
    ("Northwest", "NW"),
    ("Northeast", "NE"),
    ("Southwest", "SW"),
    ("Southeast", "SE"),
    ("North", "N"),
    ("South", "S"),
    ("East", "E"),
    ("West", "W"),
]

ADDRESS_REPLACEMENTS = [
    ("Suite", "Ste"),
    ("Street", "St"),
    ("Avenue", "Ave"),
    ("Boulevard", "Blvd"),
    ("Road", "Rd"),
    ("Drive", "Dr"),
    ("Place", "Pl"),
    ("Lane", "Ln"),
    ("Court", "Ct"),
]

FLOOR_NUMBER_RE = re.compile(r"\b(?:floor|fl|lvl|level)\s*(\d{1,2})\b", re.IGNORECASE)
FLOOR_NUMBER_RE_ALT = re.compile(
    r"\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:floor|fl|lvl|level)\b", re.IGNORECASE
)
SUITE_HINT_RE = re.compile(r"\b(?:suite|ste|unit|rm|room)\b", re.IGNORECASE)

UPPER_TOKENS = {"N", "S", "E", "W", "NE", "NW", "SE", "SW", "PO"}
SMALL_WORDS = {
    "and",
    "as",
    "at",
    "but",
    "by",
    "for",
    "if",
    "in",
    "nor",
    "of",
    "off",
    "on",
    "or",
    "per",
    "to",
    "up",
    "via",
    "vs",
    "v",
}

STREET_KEYS = [
    "street",
    "address1",
    "address_1",
    "address_line1",
    "address_line_1",
    "address_line",
    "address",
]
CITY_KEYS = ["city", "town"]
STATE_KEYS = ["state", "state_code", "region", "province"]
POSTAL_KEYS = ["postal_code", "zip", "zipcode", "zip_code", "postcode"]
COUNTRY_KEYS = ["country", "country_code"]
LAT_KEYS = ["lat", "latitude", "y"]
LNG_KEYS = ["lng", "lon", "long", "longitude", "x"]
ORG_KEYS = ["organization_name", "org_name", "organization", "org"]
LOC_KEYS = ["location_name", "loc_name", "location", "name"]
STREETVIEW_KEYS = ["streetview_url", "street_view_url", "streetview", "street_view"]
PRIORITY_ID_KEYS = ["location_id", "location id", "locationid", "uuid", "id"]

PROGRESS_FIELDS = ["uuid", "status", "note", "source", "timestamp"]
PATCH_FIELDS = [
    "uuid",
    "patch_status",
    "patch_notes",
    "payload",
    "distance_meters",
    "suggested_address",
    "ai_status",
    "ai_best_view",
    "ai_confidence",
    "ai_notes",
    "default_streetview_url",
    "search_streetview_url",
    "source",
]
RECOMMEND_FIELDS = [
    "uuid",
    "distance_meters",
    "distance_threshold",
    "suggested_address",
    "discrepancy_flags",
    "default_streetview_url",
    "search_streetview_url",
    "ai_status",
    "ai_best_view",
    "ai_confidence",
    "ai_notes",
    "source",
]


def parse_args(argv):
    parser = argparse.ArgumentParser(
        description=(
            "Deduped pipeline for address fixes, zip validation, and streetview AI."
        )
    )
    parser.add_argument(
        "--missingstreetview",
        required=True,
        help="CSV path for missing streetview rows.",
    )
    parser.add_argument(
        "--improperaddress",
        required=True,
        help="CSV path for improper address rows.",
    )
    parser.add_argument(
        "--token",
        help="JWT token. If omitted, uses DOOBNEEK_JWT or JWT env var.",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Base URL for locations (default: {DEFAULT_BASE_URL}).",
    )
    parser.add_argument(
        "--google-api-key",
        default=os.getenv("GOOGLE_MAPS_API_KEY") or os.getenv("GOOGLE_API_KEY"),
        help="Google Maps API key (fallback for all Google services).",
    )
    parser.add_argument(
        "--google-geocode-key",
        default=os.getenv("GOOGLE_GEOCODE_API_KEY"),
        help="Geocode API key (defaults to GOOGLE_GEOCODE_API_KEY or --google-api-key).",
    )
    parser.add_argument(
        "--google-places-key",
        default=os.getenv("GOOGLE_PLACES_API_KEY"),
        help="Places API key (defaults to GOOGLE_PLACES_API_KEY or --google-api-key).",
    )
    parser.add_argument(
        "--google-streetview-key",
        default=os.getenv("GOOGLE_STREETVIEW_API_KEY"),
        help=(
            "Street View Static API key "
            "(defaults to GOOGLE_STREETVIEW_API_KEY or --google-api-key)."
        ),
    )
    parser.add_argument(
        "--google-timeout",
        type=int,
        default=30,
        help="HTTP timeout in seconds for Google Maps requests.",
    )
    parser.add_argument(
        "--google-retries",
        type=int,
        default=3,
        help="Retry count for Google requests on rate limits or transient errors.",
    )
    parser.add_argument(
        "--google-backoff-min",
        type=float,
        default=0.5,
        help="Minimum seconds to back off between Google retries.",
    )
    parser.add_argument(
        "--google-backoff-max",
        type=float,
        default=4.0,
        help="Maximum seconds to back off between Google retries.",
    )
    parser.add_argument(
        "--google-search-mode",
        choices=["geocode", "places"],
        default="geocode",
        help="How to resolve search queries into coordinates.",
    )
    parser.add_argument(
        "--openai-api-key",
        default=os.getenv("OPENAI_API_KEY"),
        help="OpenAI API key for Street View review.",
    )
    parser.add_argument(
        "--openai-model",
        default="gpt-4o-mini",
        help="OpenAI model for Street View review (default: gpt-4o-mini).",
    )
    parser.add_argument(
        "--openai-retries",
        type=int,
        default=3,
        help="Retry count for OpenAI requests on rate limits or transient errors.",
    )
    parser.add_argument(
        "--openai-backoff-min",
        type=float,
        default=1.0,
        help="Minimum seconds to back off between OpenAI retries.",
    )
    parser.add_argument(
        "--openai-backoff-max",
        type=float,
        default=8.0,
        help="Maximum seconds to back off between OpenAI retries.",
    )
    parser.add_argument(
        "--ai-test",
        action="store_true",
        help="Run a single Street View AI evaluation and print the response.",
    )
    parser.add_argument(
        "--ai-test-limit",
        type=int,
        default=1,
        help="In --ai-test mode, process up to N rows (default: 1).",
    )
    parser.add_argument(
        "--distance-threshold-meters",
        type=float,
        default=200.0,
        help="Distance threshold for flagging address vs coords.",
    )
    parser.add_argument(
        "--image-size",
        default="640x640",
        help="Street View image size.",
    )
    parser.add_argument(
        "--streetview-heading-offsets",
        default="0",
        help="Comma-separated heading offsets (degrees) for extra camera angles.",
    )
    parser.add_argument(
        "--streetview-walk-meters",
        default="15,30",
        help="Comma-separated meters to walk parallel to the building for extra views.",
    )
    parser.add_argument(
        "--streetview-stepback-meters",
        default="25",
        help="Comma-separated meters to step back perpendicular to the building.",
    )
    parser.add_argument(
        "--radius",
        type=int,
        default=50,
        help="Street View search radius.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=30,
        help="HTTP timeout in seconds.",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.0,
        help="Seconds to sleep between rows.",
    )
    parser.add_argument(
        "--patch-sleep-min",
        type=float,
        default=0.5,
        help="Minimum seconds to sleep (randomized) after PATCH/POST calls.",
    )
    parser.add_argument(
        "--patch-sleep-max",
        type=float,
        default=1.5,
        help="Maximum seconds to sleep (randomized) after PATCH/POST calls.",
    )
    parser.add_argument(
        "--patch-limit",
        type=int,
        default=0,
        help="Maximum number of PATCH calls to issue (0 = unlimited).",
    )
    parser.add_argument(
        "--patch-priority-csv",
        default=DEFAULT_PATCH_PRIORITY_CSV,
        help="CSV with location_id values to prioritize when --patch-limit is set.",
    )
    parser.add_argument(
        "--run-state-path",
        default=DEFAULT_RUN_STATE_PATH,
        help="Write JSON run state details (limit/enforced/interrupts).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show changes without issuing PATCH calls.",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip UUIDs already recorded in the progress CSV.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process only the first N unprocessed rows.",
    )
    parser.add_argument(
        "--progress-csv",
        default="locations_pipeline_progress.csv",
        help="CSV path to record processed UUIDs.",
    )
    parser.add_argument(
        "--patched-report-csv",
        default="locations_pipeline_patched.csv",
        help="CSV report of patched rows.",
    )
    parser.add_argument(
        "--recommendations-csv",
        default="locations_pipeline_recommendations.csv",
        help="CSV report of recommendations and flags.",
    )
    parser.add_argument(
        "--notes-user",
        default="doobneek",
        help="Username for locationNotes entries.",
    )
    parser.add_argument(
        "--note-api",
        default=DEFAULT_NOTE_API,
        help="NOTE_API endpoint for locationNotes writes.",
    )
    parser.add_argument(
        "--skip-google",
        action="store_true",
        help="Skip Google lookups (not recommended).",
    )
    args = parser.parse_args(argv)
    args.google_geocode_key = args.google_geocode_key or args.google_api_key
    args.google_places_key = args.google_places_key or args.google_api_key
    args.google_streetview_key = args.google_streetview_key or args.google_api_key
    return args


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


REPLACEMENT_CHAR = "\ufffd"
APOSTROPHE_LIKE_CHARS = "'\u2019\u2018" + REPLACEMENT_CHAR
APOSTROPHE_LIKE_CLASS = f"[{re.escape(APOSTROPHE_LIKE_CHARS)}]"
REPLACEMENT_APOSTROPHE_RE = re.compile(rf"(?<=\w){REPLACEMENT_CHAR}(?=\w)")


def repair_replacement_apostrophes(text):
    if not text:
        return ""
    return REPLACEMENT_APOSTROPHE_RE.sub("\u2019", text)


def contains_replacement_char(text):
    if not text:
        return False
    return REPLACEMENT_CHAR in str(text)


def has_titlecase_small_word(text):
    if not text:
        return False
    for match in re.finditer(r"\b[A-Za-z]{1,3}\b", text):
        if match.start() == 0:
            continue
        word = match.group(0)
        lower = word.lower()
        if lower in SMALL_WORDS and word != lower:
            return True
    return False


def extract_new_address_from_note(note):
    if not note:
        return ""
    marker = "-> '"
    idx = note.find(marker)
    if idx == -1:
        return ""
    tail = note[idx + len(marker) :]
    pipe_idx = tail.find("' |")
    if pipe_idx != -1:
        return tail[:pipe_idx]
    end_idx = tail.rfind("'")
    if end_idx != -1:
        return tail[:end_idx]
    return tail


def note_has_small_word_issue(note):
    new_address = extract_new_address_from_note(note)
    return has_titlecase_small_word(new_address)


def normalize_whitespace(value):
    text = " ".join(str(value or "").strip().split())
    if not text:
        return ""
    return repair_replacement_apostrophes(text)


def pick_preferred_text(primary, fallback):
    primary_norm = normalize_whitespace(primary)
    fallback_norm = normalize_whitespace(fallback)
    if primary_norm and not contains_replacement_char(primary_norm):
        return primary_norm
    if fallback_norm:
        if not primary_norm:
            return fallback_norm
        if contains_replacement_char(primary_norm) and not contains_replacement_char(
            fallback_norm
        ):
            return fallback_norm
    return primary_norm or fallback_norm


def parse_heading_offsets(value):
    if value is None:
        return [0.0]
    text = str(value)
    offsets = []
    for part in text.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            offsets.append(float(part))
        except ValueError:
            continue
    if not offsets:
        return [0.0]
    seen = set()
    cleaned = []
    for offset in offsets:
        if offset in seen:
            continue
        seen.add(offset)
        cleaned.append(offset)
    if 0.0 not in seen:
        cleaned.insert(0, 0.0)
    return cleaned


def parse_distance_offsets(value):
    if value is None:
        return []
    text = str(value)
    offsets = []
    for part in text.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            offsets.append(float(part))
        except ValueError:
            continue
    seen = set()
    cleaned = []
    for offset in offsets:
        if offset <= 0:
            continue
        if offset in seen:
            continue
        seen.add(offset)
        cleaned.append(offset)
    return cleaned


def format_distance_label(value):
    if value is None:
        return ""
    rounded = round(value)
    if abs(value - rounded) < 0.01:
        return str(int(rounded))
    return f"{value:.1f}".rstrip("0").rstrip(".")


def format_distance_id(value):
    return format_distance_label(value).replace(".", "p")


def detect_address_context(address):
    text = normalize_whitespace(address)
    if not text:
        return "", None, False
    floor_num = None
    for regex in (FLOOR_NUMBER_RE, FLOOR_NUMBER_RE_ALT):
        match = regex.search(text)
        if match:
            try:
                floor_num = int(match.group(1))
                break
            except ValueError:
                floor_num = None
    suite_hint = bool(SUITE_HINT_RE.search(text)) or bool(re.search(r"#\s*\d+", text))
    if floor_num is None and not suite_hint:
        return "", None, False
    parts = []
    if floor_num is not None:
        parts.append(f"floor {floor_num}")
    if suite_hint:
        parts.append("suite/unit")
    return ", ".join(parts), floor_num, suite_hint


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


def parse_float(value):
    if is_empty(value):
        return None
    try:
        return float(str(value).strip())
    except ValueError:
        return None


def is_blank(value):
    if value is None:
        return True
    text = str(value).strip()
    if not text:
        return True
    return text.lower() in EMPTY_VALUES


def capitalize_words(value):
    return re.sub(
        r"(^|[\s-])([a-z])",
        lambda match: f"{match.group(1)}{match.group(2).upper()}",
        value,
    )


def normalize_city_name(value):
    text = normalize_whitespace(value)
    if not text:
        return ""
    lower = text.lower()
    return capitalize_words(lower)


def apply_replacements(text, replacements):
    for long, short in replacements:
        text = re.sub(rf"\b{long}\b", short, text, flags=re.IGNORECASE)
    return text


def uppercase_tokens(text, tokens):
    for token in tokens:
        pattern = f"(?<!{APOSTROPHE_LIKE_CLASS})\\b{re.escape(token)}\\b"
        text = re.sub(pattern, token, text, flags=re.IGNORECASE)
    return text


def lowercase_small_words(text):
    if not text:
        return ""

    def replacer(match):
        word = match.group(0)
        if match.start() == 0:
            return word
        lower = word.lower()
        if lower in SMALL_WORDS:
            return lower
        return word

    return re.sub(r"\b[A-Za-z]{1,3}\b", replacer, text)


def normalize_street_address(value):
    text = normalize_whitespace(value)
    if not text:
        return ""
    lower = text.lower()
    titled = capitalize_words(lower)
    titled = re.sub(r"\bP\.?\s*O\.?\b", "PO", titled, flags=re.IGNORECASE)
    titled = apply_replacements(titled, DIRECTIONAL_REPLACEMENTS)
    titled = apply_replacements(titled, ADDRESS_REPLACEMENTS)
    titled = uppercase_tokens(titled, UPPER_TOKENS)
    titled = re.sub(
        r"\b(\d+)([a-z])\b",
        lambda match: f"{match.group(1)}{match.group(2).upper()}",
        titled,
    )
    titled = lowercase_small_words(titled)
    return titled


def normalize_compare_text(value):
    text = normalize_whitespace(value).lower()
    if not text:
        return ""
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def normalize_zip(value):
    text = normalize_whitespace(value)
    if not text:
        return ""
    match = re.search(r"\d{5}", text)
    return match.group(0) if match else text


def normalize_city_compare(value):
    text = normalize_compare_text(value)
    if text in CITY_ALIASES:
        return CITY_ALIASES[text]
    return text


def normalize_state_compare(value):
    text = normalize_compare_text(value)
    if not text:
        return ""
    tokens = text.split()
    if len(tokens) > 1 and all(len(token) == 1 for token in tokens):
        compact = "".join(tokens)
        if len(compact) == 2:
            return compact.upper()
    if len(text) == 2:
        return text.upper()
    return US_STATE_ABBREV.get(text, text.upper())


def extract_number_tokens(value):
    return re.findall(r"\d+", normalize_whitespace(value))


def is_very_off(current, suggested, threshold=0.6, check_numbers=False):
    current_norm = normalize_compare_text(current)
    suggested_norm = normalize_compare_text(suggested)
    if not current_norm or not suggested_norm:
        return False
    if current_norm == suggested_norm:
        return False
    if check_numbers:
        current_nums = extract_number_tokens(current_norm)
        suggested_nums = extract_number_tokens(suggested_norm)
        if current_nums and suggested_nums and current_nums != suggested_nums:
            return True
    ratio = difflib.SequenceMatcher(None, current_norm, suggested_norm).ratio()
    return ratio < threshold


def build_full_address_from_fields(street, city, state, postal, country):
    parts = [street, city, state, postal, country]
    parts = [normalize_whitespace(part) for part in parts if normalize_whitespace(part)]
    return ", ".join(parts)


def build_search_query(org_name, loc_name, address):
    parts = []
    org = (org_name or "").strip()
    loc = (loc_name or "").strip()
    addr = (address or "").strip()
    if org:
        parts.append(org)
    if loc and loc.lower() not in org.lower():
        parts.append(loc)
    if addr:
        parts.append(addr)
    return " ".join(parts)


def add_prompt_images(image_entries, label_prefix, metadata, image_labels, image_data_urls):
    date = ""
    if isinstance(metadata, dict):
        date = metadata.get("date") or ""
    for image in image_entries or []:
        heading = int(round(image.get("heading", 0)))
        label_parts = [label_prefix]
        if date:
            label_parts.append(f"date {date}")
        label_parts.append(f"heading {heading} deg")
        image_labels.append(", ".join(label_parts))
        image_data_urls.append(
            "data:image/jpeg;base64,"
            + base64.b64encode(image["image_bytes"]).decode("ascii")
        )


def get_pano_id(metadata):
    if not isinstance(metadata, dict):
        return ""
    return metadata.get("pano_id") or metadata.get("panoId") or ""


def build_pano_url(lat, lng, pano_id=None, heading=None, pitch=0, fov=90):
    if lat is None or lng is None:
        return ""
    url = f"https://www.google.com/maps/@{lat},{lng},3a,75y"
    if heading is not None:
        url += f",{heading:.1f}h,{pitch:.1f}t"
    if pano_id:
        url += (
            "/data=!3m6!1e1!3m4!1s"
            + urllib.parse.quote(str(pano_id))
            + "!2e0!7i16384!8i8192"
        )
    return url


def compute_distance_meters(lat1, lng1, lat2, lng2):
    if None in (lat1, lng1, lat2, lng2):
        return None
    rad = math.pi / 180
    dlat = (lat2 - lat1) * rad
    dlon = (lng2 - lng1) * rad
    a_val = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1 * rad) * math.cos(lat2 * rad) * math.sin(dlon / 2) ** 2
    )
    return 6371000 * 2 * math.atan2(math.sqrt(a_val), math.sqrt(1 - a_val))


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


def http_get_json(url, timeout=30):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def http_post_json(url, payload, headers=None, timeout=60):
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers or {}, method="POST")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_with_retries(
    fn, retries=2, backoff_min=1.0, backoff_max=4.0, retryable_status=None
):
    last_error = None
    for attempt in range(retries + 1):
        try:
            return fn()
        except urllib.error.HTTPError as err:
            last_error = err
            if retryable_status and err.code not in retryable_status:
                break
            if attempt < retries:
                sleep_with_backoff(
                    attempt,
                    backoff_min,
                    backoff_max,
                    parse_retry_after(err.headers),
                )
        except Exception as err:
            last_error = err
            if attempt < retries:
                sleep_with_backoff(attempt, backoff_min, backoff_max)
    raise last_error


def google_fetch_json(url, timeout, retries, backoff_min, backoff_max):
    last_error = None
    for attempt in range(retries + 1):
        try:
            data = http_get_json(url, timeout=timeout)
        except urllib.error.HTTPError as err:
            last_error = f"Google HTTP {err.code}"
            if err.code in RETRYABLE_HTTP_STATUS and attempt < retries:
                sleep_with_backoff(
                    attempt,
                    backoff_min,
                    backoff_max,
                    parse_retry_after(err.headers),
                )
                continue
            return None, last_error
        except urllib.error.URLError as err:
            last_error = str(err)
            if attempt < retries:
                sleep_with_backoff(attempt, backoff_min, backoff_max)
                continue
            return None, last_error
        except json.JSONDecodeError:
            last_error = "Invalid JSON from Google"
            if attempt < retries:
                sleep_with_backoff(attempt, backoff_min, backoff_max)
                continue
            return None, last_error

        status = data.get("status")
        if status in RETRYABLE_GOOGLE_STATUSES and attempt < retries:
            sleep_with_backoff(attempt, backoff_min, backoff_max)
            continue
        return data, None
    return None, last_error or "Google request failed"


def extract_location_payload(obj):
    if not isinstance(obj, dict):
        return obj
    data = obj.get("data")
    if isinstance(data, dict):
        return data
    return obj


def extract_coordinates(obj):
    obj = extract_location_payload(obj)
    if not isinstance(obj, dict):
        return None
    position = obj.get("position")
    if isinstance(position, dict):
        coords = position.get("coordinates")
        if isinstance(coords, list) and len(coords) >= 2:
            return coords
    lat = obj.get("latitude") or obj.get("lat")
    lon = obj.get("longitude") or obj.get("lon") or obj.get("lng")
    if lat is not None and lon is not None:
        return [lon, lat]
    return None


def extract_address(obj):
    obj = extract_location_payload(obj)
    if not isinstance(obj, dict):
        return {}
    raw = obj.get("address") or obj.get("Address")
    if not raw:
        physical = obj.get("PhysicalAddresses")
        if isinstance(physical, list) and physical:
            raw = physical[0]
    if not raw:
        return {}
    if isinstance(raw, str):
        street = raw.strip()
        return {"street": street} if street else {}
    address = {}
    street = raw.get("street") or raw.get("address_1") or raw.get("address1")
    city = raw.get("city")
    state = raw.get("state") or raw.get("state_province") or raw.get("region")
    postal_code = raw.get("postalCode") or raw.get("postal_code")
    country = raw.get("country") or raw.get("country_code")
    region = raw.get("region")
    if street:
        address["street"] = normalize_whitespace(street)
    if city:
        address["city"] = normalize_whitespace(city)
    if state:
        address["state"] = normalize_whitespace(state)
    if postal_code:
        address["postalCode"] = normalize_whitespace(postal_code)
    if country:
        address["country"] = normalize_whitespace(country)
    if region and "state" not in address:
        address["region"] = normalize_whitespace(region)
    return address


def google_geocode_request(params, api_key, timeout, retries, backoff_min, backoff_max):
    query = dict(params)
    query["key"] = api_key
    url = DEFAULT_GOOGLE_GEOCODE_URL + "?" + urllib.parse.urlencode(query)
    data, err = google_fetch_json(url, timeout, retries, backoff_min, backoff_max)
    if err:
        return None, err
    status = data.get("status")
    if status != "OK":
        error_message = data.get("error_message")
        if error_message:
            return None, f"Google status {status}: {error_message}"
        return None, f"Google status {status}"
    results = data.get("results") or []
    if not results:
        return None, "Google returned no results"
    return results[0], None


def parse_google_address(result):
    components = result.get("address_components") or []
    component_map = {}
    for component in components:
        types = component.get("types") or []
        for component_type in types:
            if component_type not in component_map:
                component_map[component_type] = component

    def get_component(types, use_short=False):
        for component_type in types:
            component = component_map.get(component_type)
            if component:
                key = "short_name" if use_short else "long_name"
                return normalize_whitespace(component.get(key))
        return ""

    street_number = get_component(["street_number"])
    route = get_component(["route"])
    street = " ".join(part for part in [street_number, route] if part).strip()
    if not street:
        street = route
    city = (
        get_component(["locality"])
        or get_component(["postal_town"])
        or get_component(["sublocality", "sublocality_level_1"])
        or get_component(["administrative_area_level_2"])
    )
    state = get_component(["administrative_area_level_1"], use_short=True) or get_component(
        ["administrative_area_level_1"]
    )
    postal = get_component(["postal_code"])
    country = get_component(["country"], use_short=True) or get_component(["country"])
    location = result.get("geometry", {}).get("location") or {}
    lat = location.get("lat")
    lng = location.get("lng")
    return {
        "street": street,
        "city": city,
        "state": state,
        "postalCode": postal,
        "country": country,
        "formatted": normalize_whitespace(result.get("formatted_address")),
        "location": {"lat": lat, "lng": lng} if lat is not None and lng is not None else None,
    }


def google_geocode_address(address, api_key, timeout, retries, backoff_min, backoff_max):
    if not address:
        return None, "Missing address for Google geocode"
    result, err = google_geocode_request(
        {"address": address}, api_key, timeout, retries, backoff_min, backoff_max
    )
    if err:
        return None, err
    return parse_google_address(result), None


def google_reverse_geocode(lat, lon, api_key, timeout, retries, backoff_min, backoff_max):
    result, err = google_geocode_request(
        {"latlng": f"{lat},{lon}"}, api_key, timeout, retries, backoff_min, backoff_max
    )
    if err:
        return None, err
    return parse_google_address(result), None


def google_places_text_search(query, api_key, timeout, retries, backoff_min, backoff_max):
    url = (
        "https://maps.googleapis.com/maps/api/place/textsearch/json?query="
        + urllib.parse.quote_plus(query)
        + f"&key={api_key}"
    )
    data, err = google_fetch_json(url, timeout, retries, backoff_min, backoff_max)
    if err:
        return None, err
    status = data.get("status")
    if status != "OK":
        error_message = data.get("error_message")
        if error_message:
            return None, f"Places status {status}: {error_message}"
        return None, f"Places status {status}"
    results = data.get("results") or []
    if not results:
        return None, "Places returned no results"
    location = results[0].get("geometry", {}).get("location")
    if not location:
        return None, "Places missing location"
    return location, None


def compute_heading(from_lat, from_lng, to_lat, to_lng):
    lat1 = math.radians(from_lat)
    lat2 = math.radians(to_lat)
    dlon = math.radians(to_lng - from_lng)
    y = math.sin(dlon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    bearing = math.degrees(math.atan2(y, x))
    return (bearing + 360) % 360


def offset_lat_lng(lat, lng, distance_meters, bearing_degrees):
    if lat is None or lng is None:
        return None, None
    if distance_meters is None or distance_meters <= 0:
        return lat, lng
    distance_rad = distance_meters / 6371000.0
    bearing = math.radians(bearing_degrees)
    lat1 = math.radians(lat)
    lng1 = math.radians(lng)
    lat2 = math.asin(
        math.sin(lat1) * math.cos(distance_rad)
        + math.cos(lat1) * math.sin(distance_rad) * math.cos(bearing)
    )
    lng2 = lng1 + math.atan2(
        math.sin(bearing) * math.sin(distance_rad) * math.cos(lat1),
        math.cos(distance_rad) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), math.degrees(lng2)


def fetch_streetview_metadata(
    lat, lng, api_key, radius, source, timeout, retries, backoff_min, backoff_max
):
    url = (
        "https://maps.googleapis.com/maps/api/streetview/metadata?location="
        + f"{lat},{lng}&radius={radius}&source={source}&key={api_key}"
    )
    data, err = google_fetch_json(url, timeout, retries, backoff_min, backoff_max)
    if err:
        return {"status": "ERROR", "error_message": err}
    return data


def build_streetview_image_url(
    size, pano_lat, pano_lng, heading, source, api_key, pano_id=None
):
    base_url = "https://maps.googleapis.com/maps/api/streetview?size="
    if pano_id:
        location_part = f"{size}&pano={urllib.parse.quote(str(pano_id))}"
    else:
        location_part = f"{size}&location={pano_lat},{pano_lng}"
    return (
        base_url
        + location_part
        + f"&heading={heading}&pitch=0&fov=90&source={source}&return_error_code=true&key={api_key}"
    )


def fetch_streetview_images(
    query_lat,
    query_lng,
    target_lat,
    target_lng,
    api_key,
    size,
    radius,
    source,
    timeout,
    retries,
    backoff_min,
    backoff_max,
    heading_offsets,
):
    if target_lat is None or target_lng is None:
        target_lat = query_lat
        target_lng = query_lng
    metadata = fetch_streetview_metadata(
        query_lat,
        query_lng,
        api_key,
        radius,
        source,
        timeout,
        retries,
        backoff_min,
        backoff_max,
    )
    status = metadata.get("status")
    if status != "OK":
        error_message = metadata.get("error_message")
        if error_message:
            return None, f"Street View metadata status {status}: {error_message}"
        return None, f"Street View metadata status {status}"
    pano_loc = metadata.get("location") or {}
    pano_lat = pano_loc.get("lat")
    pano_lng = pano_loc.get("lng")
    if pano_lat is None or pano_lng is None:
        return None, "Street View metadata missing pano location"
    pano_id = get_pano_id(metadata)
    base_heading = compute_heading(pano_lat, pano_lng, target_lat, target_lng)
    images = []
    last_error = None
    for offset in heading_offsets or [0.0]:
        heading = (base_heading + offset) % 360
        image_url = build_streetview_image_url(
            size, pano_lat, pano_lng, heading, source, api_key, pano_id=pano_id
        )
        try:
            image_bytes = fetch_with_retries(
                lambda: urllib.request.urlopen(image_url, timeout=timeout).read(),
                retries=retries,
                backoff_min=backoff_min,
                backoff_max=backoff_max,
                retryable_status=RETRYABLE_HTTP_STATUS,
            )
        except urllib.error.HTTPError as err:
            last_error = f"Street View image HTTP error {err.code}"
            continue
        except Exception as err:
            last_error = f"Street View image error {err}"
            continue
        images.append(
            {
                "image_bytes": image_bytes,
                "image_url": image_url,
                "heading": heading,
                "pano_lat": pano_lat,
                "pano_lng": pano_lng,
                "metadata": metadata,
            }
        )
    if not images:
        return None, last_error or "Street View image error"
    return {
        "images": images,
        "metadata": metadata,
        "base_heading": base_heading,
        "pano_lat": pano_lat,
        "pano_lng": pano_lng,
    }, None


def extract_json(text):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    if not text:
        return {"error": "empty_response"}
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return {"error": "invalid_json", "raw": text}
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return {"error": "invalid_json", "raw": text}


def build_view_preference(view_ids):
    order = []
    if "default" in view_ids:
        order.append("default")
    if any(view_id.startswith("parallel_") for view_id in view_ids):
        order.append("parallel_*")
    if any(view_id.startswith("stepback_") for view_id in view_ids):
        order.append("stepback_*")
    if "search" in view_ids:
        order.append("search")
    if len(order) <= 1:
        return ""
    return "Prefer in this order unless obstructed: " + " > ".join(order) + "."


def build_openai_prompt(
    org_name,
    loc_name,
    address,
    image_labels,
    address_context,
    floor_num,
    view_ids,
    view_preference,
):
    org = org_name or "(missing)"
    loc = loc_name or "(missing)"
    addr = address or "(missing)"
    image_instructions = "\n".join(
        f"Image {index + 1}: {label}" for index, label in enumerate(image_labels)
    )
    view_block = ""
    if view_ids:
        view_block = "View IDs: " + ", ".join(view_ids) + "\n"
        if view_preference:
            view_block += view_preference + "\n"
    guidance_lines = []
    if address_context:
        guidance_lines.append(f"Address notes: {address_context}.")
        guidance_lines.append(
            "If this is an office/suite location, a lobby/entrance or building directory "
            "is acceptable even without an org-specific awning."
        )
        if floor_num is not None and floor_num >= 2:
            guidance_lines.append("For 2nd+ floors, window signage can indicate presence.")
        if floor_num is not None and floor_num >= 4:
            guidance_lines.append(
                "For higher floors (4+), storefront visibility is unlikely; lobby/entrance is OK."
            )
    guidance_block = ""
    if guidance_lines:
        guidance_block = "\n".join(guidance_lines) + "\n"
    return (
        "Review the Street View images for storefront validity.\n"
        f"Organization: {org}\n"
        f"Location: {loc}\n"
        f"Address: {addr}\n"
        f"{guidance_block}"
        f"{view_block}"
        f"{image_instructions}\n\n"
        "Return JSON only with:\n"
        "{\n"
        '  "flags": {\n'
        '    "no_visible_storefront": bool,\n'
        '    "not_facing_storefront": bool,\n'
        '    "different_storefront": bool,\n'
        '    "interior_view": bool,\n'
        '    "unsure": bool\n'
        "  },\n"
        '  "best_view": "<view_id>",\n'
        '  "confidence": 0.0-1.0,\n'
        '  "notes": "short reason"\n'
        "}\n"
        f"Where <view_id> is one of: {', '.join(view_ids)} or 'neither'.\n"
        "If all views are obscured or unrelated, set best_view to 'neither' and unsure=true.\n"
        "Be conservative and set unsure=true if you cannot tell. Do not return markdown."
    )


def call_openai(api_key, model, prompt, images, timeout):
    content = [{"type": "text", "text": prompt}]
    for image in images:
        content.append({"type": "image_url", "image_url": {"url": image}})
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You review Street View images for storefront validity.",
            },
            {"role": "user", "content": content},
        ],
        "temperature": 0,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    response = http_post_json(
        "https://api.openai.com/v1/chat/completions",
        payload,
        headers=headers,
        timeout=timeout,
    )
    choice = (response.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    return message.get("content", "")


def call_openai_with_retry(
    api_key, model, prompt, images, timeout, retries, backoff_min, backoff_max
):
    prompt_retry = prompt
    json_retry = False
    for attempt in range(retries + 1):
        try:
            response_text = call_openai(
                api_key, model, prompt_retry, images, timeout
            )
        except urllib.error.HTTPError as err:
            body = ""
            try:
                body = err.read().decode("utf-8", errors="replace")
            except Exception:
                body = ""
            if err.code in RETRYABLE_HTTP_STATUS and attempt < retries:
                sleep_with_backoff(
                    attempt,
                    backoff_min,
                    backoff_max,
                    parse_retry_after(err.headers),
                )
                continue
            if body:
                return None, f"HTTP {err.code} {body}"
            return None, str(err)
        except urllib.error.URLError as err:
            if attempt < retries:
                sleep_with_backoff(attempt, backoff_min, backoff_max)
                continue
            return None, str(err)
        except Exception as err:
            return None, str(err)

        parsed = extract_json(response_text)
        if "error" not in parsed:
            return parsed, None
        if not json_retry:
            prompt_retry = prompt + "\nReturn strict JSON only."
            json_retry = True
            if attempt < retries:
                continue
        return None, parsed.get("raw", "")
    return None, "openai_invalid_json"


def build_headers(token, is_json):
    headers = {
        "accept": "application/json, text/plain, */*",
        "authorization": token,
    }
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


def load_csv_rows(path, source):
    last_error = None
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            rows = []
            with open(path, "r", encoding=encoding, newline="") as handle:
                reader = csv.DictReader(handle)
                header_map = build_header_map(reader.fieldnames or [])
                for row in reader:
                    uuid = get_value(row, header_map, "uuid", "id", "location_id")
                    if not uuid:
                        continue
                    record = {
                        "uuid": uuid,
                        "org": get_value(row, header_map, *ORG_KEYS),
                        "location": get_value(row, header_map, *LOC_KEYS),
                        "street": get_value(row, header_map, *STREET_KEYS),
                        "city": get_value(row, header_map, *CITY_KEYS),
                        "state": get_value(row, header_map, *STATE_KEYS),
                        "postal": get_value(row, header_map, *POSTAL_KEYS),
                        "country": get_value(row, header_map, *COUNTRY_KEYS),
                        "lat": parse_float(get_value(row, header_map, *LAT_KEYS)),
                        "lng": parse_float(get_value(row, header_map, *LNG_KEYS)),
                        "streetview_url": get_value(row, header_map, *STREETVIEW_KEYS),
                        "source": source,
                    }
                    rows.append(record)
            if encoding != "utf-8-sig":
                print(f"[WARN] {path}: decoded with {encoding}", file=sys.stderr)
            return rows
        except UnicodeDecodeError as exc:
            last_error = exc
    if last_error:
        raise last_error
    return []


def merge_entry(existing, incoming, conflicts):
    for field in (
        "org",
        "location",
        "street",
        "city",
        "state",
        "postal",
        "country",
        "streetview_url",
    ):
        value = incoming.get(field) or ""
        if not value:
            continue
        if not existing.get(field):
            existing[field] = value
        elif existing[field] != value:
            conflicts.append(f"{field}:{existing[field]}|{value}")

    for field in ("lat", "lng"):
        value = incoming.get(field)
        if value is None:
            continue
        if existing.get(field) is None:
            existing[field] = value
        elif existing[field] != value:
            conflicts.append(f"{field}:{existing[field]}|{value}")


def load_processed_ids(progress_path):
    if not os.path.exists(progress_path):
        return set()
    processed = set()
    with open(progress_path, "r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            uuid = (row.get("uuid") or "").strip()
            status = (row.get("status") or "").strip().lower()
            note = row.get("note") or ""
            if uuid and status in {"patched", "dry_run", "no_change", "skipped_resume"}:
                if contains_replacement_char(note):
                    continue
                if note_has_small_word_issue(note):
                    continue
                processed.add(uuid)
    return processed


def load_pending_patch_ids(progress_path):
    if not os.path.exists(progress_path):
        return set()
    pending = set()
    with open(progress_path, "r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            uuid = (row.get("uuid") or "").strip()
            status = (row.get("status") or "").strip().lower()
            if uuid and status == "patch_limit":
                pending.add(uuid)
    return pending


def strip_patch_limit_notes(text):
    if not text:
        return ""
    parts = [part.strip() for part in str(text).split("|")]
    cleaned = []
    for part in parts:
        if not part:
            continue
        if part.startswith("patch_limit_reached_at="):
            continue
        if part.startswith("patch_priority_exhausted"):
            continue
        cleaned.append(part)
    return " | ".join(cleaned)


def sanitize_cached_payload(payload):
    if not isinstance(payload, dict):
        return None
    address = payload.get("address")
    if isinstance(address, dict):
        street = address.get("street")
        if street:
            street_norm = normalize_street_address(street)
            if contains_replacement_char(street_norm):
                return None
            address["street"] = street_norm
        city = address.get("city")
        if city:
            city_norm = normalize_city_name(city)
            if contains_replacement_char(city_norm):
                return None
            address["city"] = city_norm
    return payload


def load_cached_patch_payloads(path):
    if not path or not os.path.exists(path):
        return {}
    cached = {}
    with open(path, "r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            uuid = (row.get("uuid") or "").strip()
            status = (row.get("patch_status") or "").strip().lower()
            if not uuid or status != "patch_limit":
                continue
            payload_text = (row.get("payload") or "").strip()
            if not payload_text:
                continue
            try:
                payload = json.loads(payload_text)
            except json.JSONDecodeError:
                continue
            payload = sanitize_cached_payload(payload)
            if not payload:
                continue
            if not isinstance(payload, dict) or not payload:
                continue
            cached[uuid] = {
                "payload": payload,
                "note": strip_patch_limit_notes(row.get("patch_notes") or ""),
                "distance_meters": parse_float(row.get("distance_meters")),
                "suggested_address": normalize_whitespace(
                    row.get("suggested_address") or ""
                ),
                "ai_status": (row.get("ai_status") or "").strip(),
                "ai_best_view": (row.get("ai_best_view") or "").strip(),
                "ai_confidence": (row.get("ai_confidence") or "").strip(),
                "ai_notes": (row.get("ai_notes") or "").strip(),
                "default_streetview_url": (row.get("default_streetview_url") or "").strip(),
                "search_streetview_url": (row.get("search_streetview_url") or "").strip(),
            }
    return cached


def load_priority_ids(path):
    if not path or not os.path.exists(path):
        return set()
    last_error = None
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            ids = set()
            with open(path, "r", encoding=encoding, newline="") as handle:
                reader = csv.DictReader(handle)
                header_map = build_header_map(reader.fieldnames or [])
                for row in reader:
                    value = get_value(row, header_map, *PRIORITY_ID_KEYS)
                    if value:
                        ids.add(value)
            if encoding != "utf-8-sig":
                print(f"[WARN] {path}: decoded with {encoding}", file=sys.stderr)
            return ids
        except UnicodeDecodeError as exc:
            last_error = exc
    if last_error:
        raise last_error
    return set()


def build_entry_order(entries, priority_ids, pending_patch_ids):
    uuids = list(entries)
    if not priority_ids and not pending_patch_ids:
        return uuids
    priority_set = set(priority_ids or [])
    pending_set = set(pending_patch_ids or [])
    pending_priority = [uuid for uuid in uuids if uuid in pending_set and uuid in priority_set]
    pending_other = [uuid for uuid in uuids if uuid in pending_set and uuid not in priority_set]
    priority_other = [uuid for uuid in uuids if uuid not in pending_set and uuid in priority_set]
    remaining = [uuid for uuid in uuids if uuid not in pending_set and uuid not in priority_set]
    return pending_priority + pending_other + priority_other + remaining


def format_google_address(address):
    if not address:
        return ""
    formatted = address.get("formatted")
    if formatted:
        return normalize_whitespace(formatted)
    return build_full_address_from_fields(
        address.get("street"),
        address.get("city"),
        address.get("state"),
        address.get("postalCode"),
        address.get("country"),
    )


def ensure_writer(path, fieldnames, handle_holder):
    if handle_holder.get("writer"):
        return handle_holder["writer"], handle_holder["handle"]
    exists = os.path.exists(path)
    handle = open(path, "a" if exists else "w", newline="", encoding="utf-8")
    writer = csv.DictWriter(handle, fieldnames=fieldnames)
    if not exists:
        writer.writeheader()
    handle_holder["writer"] = writer
    handle_holder["handle"] = handle
    return writer, handle


def write_run_state(path, payload):
    if not path:
        return
    try:
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=True, indent=2, sort_keys=True)
    except Exception as exc:
        print(f"[WARN] run state write failed: {exc}", file=sys.stderr)


def note_payload(notes_user, note_text):
    today = time.strftime("%Y-%m-%d")
    return {
        "userName": notes_user,
        "date": today,
        "note": note_text,
    }


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


def parse_retry_after(headers):
    if not headers:
        return None
    value = headers.get("Retry-After")
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def sleep_with_backoff(attempt, min_seconds, max_seconds, retry_after=None):
    if retry_after is not None and retry_after > 0:
        time.sleep(retry_after)
        return
    if max_seconds <= 0 and min_seconds <= 0:
        return
    base = max(0.0, min_seconds)
    cap = max(0.0, max_seconds)
    if cap <= 0:
        return
    if base <= 0:
        sleep_with_jitter(0.0, cap)
        return
    exp_cap = min(cap, base * (2 ** attempt))
    sleep_with_jitter(base, exp_cap)


def sleep_with_jitter(min_seconds, max_seconds):
    if min_seconds <= 0 and max_seconds <= 0:
        return
    low = max(0.0, min(min_seconds, max_seconds))
    high = max(0.0, max(min_seconds, max_seconds))
    if high <= 0:
        return
    time.sleep(random.uniform(low, high))


def main(argv):
    args = parse_args(argv)
    run_started_at = time.strftime("%Y-%m-%d %H:%M:%S")
    if args.ai_test:
        args.dry_run = True
    args.streetview_heading_offsets = parse_heading_offsets(args.streetview_heading_offsets)
    args.streetview_walk_meters = parse_distance_offsets(args.streetview_walk_meters)
    args.streetview_stepback_meters = parse_distance_offsets(args.streetview_stepback_meters)
    ai_test_remaining = None
    if args.ai_test:
        if args.ai_test_limit > 0:
            ai_test_remaining = args.ai_test_limit
    token = args.token or os.getenv("DOOBNEEK_JWT") or os.getenv("JWT")
    if not token:
        print("Missing token. Provide --token or set DOOBNEEK_JWT/JWT.", file=sys.stderr)
        return 2

    missing_rows = load_csv_rows(args.missingstreetview, "missingstreetview")
    address_rows = load_csv_rows(args.improperaddress, "improperaddress")

    entries = {}
    entry_sources = {}
    entry_conflicts = {}

    for row in missing_rows + address_rows:
        uuid = row["uuid"]
        if uuid not in entries:
            entries[uuid] = {
                "uuid": uuid,
                "org": "",
                "location": "",
                "street": "",
                "city": "",
                "state": "",
                "postal": "",
                "country": "",
                "lat": None,
                "lng": None,
                "streetview_url": "",
            }
            entry_sources[uuid] = set()
            entry_conflicts[uuid] = []
        entry_sources[uuid].add(row["source"])
        merge_entry(entries[uuid], row, entry_conflicts[uuid])

    if not entries:
        print("No rows found in input CSVs.", file=sys.stderr)
        return 1

    priority_ids = set()
    if args.patch_limit:
        if args.patch_priority_csv and not os.path.exists(args.patch_priority_csv):
            print(
                f"[WARN] priority CSV not found: {args.patch_priority_csv}",
                file=sys.stderr,
            )
        priority_ids = load_priority_ids(args.patch_priority_csv)

    cached_patch_payloads = {}
    if args.resume and not args.ai_test:
        cached_patch_payloads = load_cached_patch_payloads(args.patched_report_csv)

    needs_ai = args.ai_test or any(
        "missingstreetview" in entry_sources[uuid]
        and not entries[uuid].get("streetview_url")
        and uuid not in cached_patch_payloads
        for uuid in entries
    )

    if needs_ai and not args.openai_api_key:
        print("Missing OPENAI_API_KEY for Street View analysis.", file=sys.stderr)
        return 2

    needs_google = not args.skip_google and any(
        uuid not in cached_patch_payloads for uuid in entries
    )
    if needs_google:
        if not args.google_geocode_key:
            print(
                "Missing GOOGLE_GEOCODE_API_KEY or GOOGLE_API_KEY for geocode.",
                file=sys.stderr,
            )
            return 2
        if args.google_search_mode == "places" and not args.google_places_key:
            print(
                "Missing GOOGLE_PLACES_API_KEY or GOOGLE_API_KEY for Places search.",
                file=sys.stderr,
            )
            return 2
        if needs_ai and not args.google_streetview_key:
            print(
                "Missing GOOGLE_STREETVIEW_API_KEY or GOOGLE_API_KEY for Street View.",
                file=sys.stderr,
            )
            return 2

    processed = set()
    if args.resume:
        processed = load_processed_ids(args.progress_csv)
    pending_patch_ids = load_pending_patch_ids(args.progress_csv) if args.resume else set()
    entry_order = build_entry_order(entries, priority_ids, pending_patch_ids)

    priority_matches = set()
    priority_remaining = set()
    priority_patch_only = False
    if args.patch_limit and priority_ids:
        priority_matches = {uuid for uuid in entries if uuid in priority_ids}
        if args.patch_limit > len(priority_matches):
            priority_patch_only = True
            priority_remaining = set(priority_matches)

    progress_holder = {}
    patched_holder = {}
    recommend_holder = {}

    totals = {
        "total": 0,
        "patched": 0,
        "no_change": 0,
        "skipped": 0,
        "errors": 0,
        "auth_errors": 0,
        "ai_errors": 0,
    }
    patch_attempts = 0
    patch_limit_reached_at = None
    patch_priority_exhausted_at = None

    geocode_cache = {}
    reverse_cache = {}
    search_cache = {}

    processed_count = 0
    stop_reason = ""
    stop_uuid = ""
    interrupted = False
    current_uuid = ""
    try:
        for uuid in entry_order:
            current_uuid = uuid
            if uuid in processed:
                print(f"[RESUME-SKIP] {uuid}")
                totals["skipped"] += 1
                progress_writer, _ = ensure_writer(
                    args.progress_csv, PROGRESS_FIELDS, progress_holder
                )
                progress_writer.writerow(
                    {
                        "uuid": uuid,
                        "status": "skipped_resume",
                        "note": "",
                        "source": ",".join(sorted(entry_sources[uuid])),
                        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                    }
                )
                priority_remaining.discard(uuid)
                continue
            if args.limit and processed_count >= args.limit:
                print(f"[LIMIT] Reached limit {args.limit}, stopping.")
                break

            processed_count += 1
            totals["total"] += 1
            entry = entries[uuid]
            source_label = ",".join(sorted(entry_sources[uuid]))
            cached_patch = cached_patch_payloads.get(uuid) if cached_patch_payloads else None
            use_cached_payload = bool(cached_patch and cached_patch.get("payload"))
            cached_note = cached_patch.get("note", "") if use_cached_payload else ""
            cached_payload = cached_patch.get("payload") if use_cached_payload else None
            skip_google = args.skip_google or use_cached_payload
            skip_recommendations = use_cached_payload
            payload_precomputed = False

            get_url = f"{args.base_url}/{uuid}"
            status, body = http_request(
                "GET", get_url, headers=build_headers(token, is_json=False)
            )
            if status is None:
                error_note = format_http_error("GET", get_url, status, body)
                print(f"[ERROR] {uuid}: {error_note}")
                totals["errors"] += 1
                progress_writer, _ = ensure_writer(
                    args.progress_csv, PROGRESS_FIELDS, progress_holder
                )
                progress_writer.writerow(
                    {
                        "uuid": uuid,
                        "status": "error",
                        "note": error_note,
                        "source": source_label,
                        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                    }
                )
                stop_reason = "error"
                stop_uuid = uuid
                break
            if status >= 300:
                error_note = format_http_error("GET", get_url, status, body)
                if is_auth_error(status, body):
                    print(f"[AUTH] {uuid}: {error_note}")
                    totals["auth_errors"] += 1
                    totals["errors"] += 1
                    progress_writer, _ = ensure_writer(
                        args.progress_csv, PROGRESS_FIELDS, progress_holder
                    )
                    progress_writer.writerow(
                        {
                            "uuid": uuid,
                            "status": "auth_error",
                            "note": error_note,
                            "source": source_label,
                            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                        }
                    )
                    stop_reason = "auth_error"
                else:
                    print(f"[ERROR] {uuid}: {error_note}")
                    totals["errors"] += 1
                    progress_writer, _ = ensure_writer(
                        args.progress_csv, PROGRESS_FIELDS, progress_holder
                    )
                    progress_writer.writerow(
                        {
                            "uuid": uuid,
                            "status": "error",
                            "note": error_note,
                            "source": source_label,
                            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                        }
                    )
                    stop_reason = "error"
                stop_uuid = uuid
                break
    
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                error_note = format_http_error("GET", get_url, "invalid_json", body)
                print(f"[ERROR] {uuid}: {error_note}")
                totals["errors"] += 1
                progress_writer, _ = ensure_writer(
                    args.progress_csv, PROGRESS_FIELDS, progress_holder
                )
                progress_writer.writerow(
                    {
                        "uuid": uuid,
                        "status": "error",
                        "note": error_note,
                        "source": source_label,
                        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                    }
                )
                stop_reason = "error"
                stop_uuid = uuid
                break
    
            address_data = extract_address(data)
            api_street = normalize_whitespace(address_data.get("street", ""))
            api_city = normalize_whitespace(address_data.get("city", ""))
            api_state = normalize_whitespace(
                address_data.get("state") or address_data.get("region") or ""
            )
            api_postal = normalize_whitespace(address_data.get("postalCode", ""))
            api_country = normalize_whitespace(address_data.get("country", ""))
    
            coords = extract_coordinates(data)
            api_lat = None
            api_lng = None
            if coords:
                api_lng = parse_float(coords[0])
                api_lat = parse_float(coords[1])
    
            csv_lat = entry.get("lat")
            csv_lng = entry.get("lng")
            coords_lat = csv_lat if csv_lat is not None else api_lat
            coords_lng = csv_lng if csv_lng is not None else api_lng
    
            source_street = pick_preferred_text(entry.get("street"), api_street)
            source_city = pick_preferred_text(entry.get("city"), api_city)
            address_context, floor_num, _ = detect_address_context(source_street)
    
            normalized_city = normalize_city_name(source_city)
            normalized_street = normalize_street_address(source_street)
            if contains_replacement_char(normalized_city):
                normalized_city = ""
            if contains_replacement_char(normalized_street):
                normalized_street = ""
    
            base_address = {k: v for k, v in address_data.items() if v}
            next_address = dict(base_address)
            change_notes = []
            discrepancy_flags = []
            suggested_address = ""
            distance_meters = None
            ai_status = ""
            ai_best_view = ""
            ai_confidence = ""
            ai_notes = ""
            ai_parsed = None
            default_streetview_url = ""
            search_streetview_url = ""
    
            if normalized_city and normalized_city != api_city:
                next_address["city"] = normalized_city
                change_notes.append(f"city '{api_city or ''}' -> '{normalized_city}'")
    
            if normalized_street and normalized_street != api_street:
                next_address["street"] = normalized_street
                change_notes.append(
                    f"address '{api_street or ''}' -> '{normalized_street}'"
                )
    
            address_for_geocode = build_full_address_from_fields(
                source_street,
                source_city,
                api_state or entry.get("state"),
                api_postal or entry.get("postal"),
                api_country or entry.get("country"),
            )
    
            google_addr = None
            google_err = None
            if not skip_google:
                if coords_lat is not None and coords_lng is not None:
                    key = f"{coords_lat:.6f},{coords_lng:.6f}"
                    if key in reverse_cache:
                        google_addr, google_err = reverse_cache[key]
                    else:
                        google_addr, google_err = google_reverse_geocode(
                            coords_lat,
                            coords_lng,
                            args.google_geocode_key,
                            args.google_timeout,
                            args.google_retries,
                            args.google_backoff_min,
                            args.google_backoff_max,
                        )
                        reverse_cache[key] = (google_addr, google_err)
                elif address_for_geocode:
                    if address_for_geocode in geocode_cache:
                        google_addr, google_err = geocode_cache[address_for_geocode]
                    else:
                        google_addr, google_err = google_geocode_address(
                            address_for_geocode,
                            args.google_geocode_key,
                            args.google_timeout,
                            args.google_retries,
                            args.google_backoff_min,
                            args.google_backoff_max,
                        )
                        geocode_cache[address_for_geocode] = (google_addr, google_err)
    
                if google_err:
                    print(f"[WARN] {uuid}: google {google_err}")
                elif google_addr:
                    suggested_zip = normalize_zip(google_addr.get("postalCode"))
                    current_zip = normalize_zip(api_postal)
                    if suggested_zip and suggested_zip != current_zip:
                        next_address["postalCode"] = suggested_zip
                        change_notes.append(
                            f"zip '{api_postal or ''}' -> '{suggested_zip}'"
                        )
    
                    if api_street and google_addr.get("street"):
                        if is_very_off(
                            api_street,
                            google_addr.get("street"),
                            threshold=0.55,
                            check_numbers=True,
                        ):
                            discrepancy_flags.append(
                                f"street '{api_street}' vs '{google_addr.get('street')}'"
                            )
    
                    if api_city and google_addr.get("city"):
                        if is_very_off(
                            normalize_city_compare(api_city),
                            normalize_city_compare(google_addr.get("city")),
                            threshold=0.5,
                        ):
                            discrepancy_flags.append(
                                f"city '{api_city}' vs '{google_addr.get('city')}'"
                            )
    
                    if api_state and google_addr.get("state"):
                        if (
                            normalize_state_compare(api_state)
                            != normalize_state_compare(google_addr.get("state"))
                        ):
                            discrepancy_flags.append(
                                f"state '{api_state}' vs '{google_addr.get('state')}'"
                            )
    
            if not skip_google and coords_lat is not None and coords_lng is not None:
                if address_for_geocode:
                    if address_for_geocode in geocode_cache:
                        addr_geo, addr_err = geocode_cache[address_for_geocode]
                    else:
                        addr_geo, addr_err = google_geocode_address(
                            address_for_geocode,
                            args.google_geocode_key,
                            args.google_timeout,
                            args.google_retries,
                            args.google_backoff_min,
                            args.google_backoff_max,
                        )
                        geocode_cache[address_for_geocode] = (addr_geo, addr_err)
                    if addr_err:
                        print(f"[WARN] {uuid}: geocode {addr_err}")
                    elif addr_geo and addr_geo.get("location"):
                        loc = addr_geo.get("location")
                        distance_meters = compute_distance_meters(
                            coords_lat, coords_lng, loc.get("lat"), loc.get("lng")
                        )
                        if distance_meters is not None and distance_meters > args.distance_threshold_meters:
                            suggested_address = format_google_address(addr_geo)
                            if suggested_address:
                                print(f"[SUGGEST] {uuid}: {suggested_address}")
    
            wants_streetview = "missingstreetview" in entry_sources[uuid] or args.ai_test
            if use_cached_payload:
                wants_streetview = False
            has_streetview = bool(entry.get("streetview_url"))
            if args.ai_test:
                has_streetview = False
            streetview_payload = ""
            view_candidates = []
    
            if wants_streetview and not has_streetview:
                if coords_lat is None or coords_lng is None:
                    if address_for_geocode and not skip_google:
                        if address_for_geocode in geocode_cache:
                            addr_geo, addr_err = geocode_cache[address_for_geocode]
                        else:
                            addr_geo, addr_err = google_geocode_address(
                                address_for_geocode,
                                args.google_geocode_key,
                                args.google_timeout,
                                args.google_retries,
                                args.google_backoff_min,
                                args.google_backoff_max,
                            )
                            geocode_cache[address_for_geocode] = (addr_geo, addr_err)
                        if addr_geo and addr_geo.get("location"):
                            coords_lat = addr_geo["location"]["lat"]
                            coords_lng = addr_geo["location"]["lng"]
    
                if coords_lat is None or coords_lng is None:
                    ai_status = "missing_coordinates"
                    print(f"[AI] {uuid}: missing coordinates for Street View")
                    totals["ai_errors"] += 1
                else:
                    default_streetview_url = build_pano_url(coords_lat, coords_lng)
                    seen_panos = set()
                    fetch_errors = []
    
                    def build_view_url(pack):
                        pano_id = get_pano_id(pack.get("metadata"))
                        return build_pano_url(
                            pack.get("pano_lat"),
                            pack.get("pano_lng"),
                            pano_id=pano_id,
                            heading=pack.get("base_heading"),
                        )
    
                    def build_pano_key(pack):
                        pano_id = get_pano_id(pack.get("metadata"))
                        if pano_id:
                            return f"pano:{pano_id}"
                        pano_lat = pack.get("pano_lat")
                        pano_lng = pack.get("pano_lng")
                        if pano_lat is None or pano_lng is None:
                            return ""
                        return f"loc:{pano_lat:.6f},{pano_lng:.6f}"
    
                    def register_candidate(view_id, label, pack):
                        pano_key = build_pano_key(pack)
                        if pano_key and pano_key in seen_panos:
                            return False
                        if pano_key:
                            seen_panos.add(pano_key)
                        view_candidates.append(
                            {
                                "id": view_id,
                                "label": label,
                                "url": build_view_url(pack),
                                "images": pack["images"],
                                "metadata": pack["metadata"],
                            }
                        )
                        return True
    
                    def fetch_candidate(
                        view_id, label, query_lat, query_lng, target_lat, target_lng, offsets
                    ):
                        pack, err = fetch_streetview_images(
                            query_lat,
                            query_lng,
                            target_lat,
                            target_lng,
                            args.google_streetview_key,
                            args.image_size,
                            args.radius,
                            "outdoor",
                            args.timeout,
                            args.google_retries,
                            args.google_backoff_min,
                            args.google_backoff_max,
                            offsets,
                        )
                        if err:
                            fetch_errors.append(f"{view_id}:{err}")
                            print(f"[AI] {uuid}: {err}")
                            return None
                        register_candidate(view_id, label, pack)
                        return pack
    
                    default_pack = fetch_candidate(
                        "default",
                        "perpendicular",
                        coords_lat,
                        coords_lng,
                        coords_lat,
                        coords_lng,
                        args.streetview_heading_offsets,
                    )
                    if default_pack:
                        default_streetview_url = build_view_url(default_pack)
    
                    search_query = build_search_query(
                        entry.get("org"), entry.get("location"), address_for_geocode
                    )
                    search_location = None
                    search_err = None
                    if search_query:
                        if search_query in search_cache:
                            search_location, search_err = search_cache[search_query]
                        else:
                            if args.google_search_mode == "places":
                                search_location, search_err = google_places_text_search(
                                    search_query,
                                    args.google_places_key,
                                    args.google_timeout,
                                    args.google_retries,
                                    args.google_backoff_min,
                                    args.google_backoff_max,
                                )
                            else:
                                search_location, search_err = google_geocode_address(
                                    search_query,
                                    args.google_geocode_key,
                                    args.google_timeout,
                                    args.google_retries,
                                    args.google_backoff_min,
                                    args.google_backoff_max,
                                )
                                if search_location and search_location.get("location"):
                                    search_location = search_location.get("location")
                            search_cache[search_query] = (search_location, search_err)
    
                    if search_location and search_location.get("lat") is not None:
                        search_lat = search_location.get("lat")
                        search_lng = search_location.get("lng")
                        search_streetview_url = build_pano_url(search_lat, search_lng)
                        search_pack = fetch_candidate(
                            "search",
                            "search result",
                            search_lat,
                            search_lng,
                            search_lat,
                            search_lng,
                            args.streetview_heading_offsets,
                        )
                        if search_pack:
                            search_streetview_url = build_view_url(search_pack)
                    elif search_err:
                        print(f"[AI] {uuid}: {search_err}")
    
                    if default_pack:
                        base_heading = default_pack.get("base_heading")
                        if base_heading is not None:
                            for offset_m in args.streetview_walk_meters:
                                offset_label = format_distance_label(offset_m)
                                offset_id = format_distance_id(offset_m)
                                for direction, turn in (("plus", 90), ("minus", -90)):
                                    bearing = (base_heading + turn) % 360
                                    walk_lat, walk_lng = offset_lat_lng(
                                        coords_lat, coords_lng, offset_m, bearing
                                    )
                                    if walk_lat is None or walk_lng is None:
                                        continue
                                    sign = "+" if direction == "plus" else "-"
                                    view_id = f"parallel_{direction}_{offset_id}m"
                                    label = f"parallel {sign}{offset_label}m"
                                    fetch_candidate(
                                        view_id,
                                        label,
                                        walk_lat,
                                        walk_lng,
                                        coords_lat,
                                        coords_lng,
                                        [0.0],
                                    )
    
                            back_bearing = (base_heading + 180) % 360
                            for offset_m in args.streetview_stepback_meters:
                                offset_label = format_distance_label(offset_m)
                                offset_id = format_distance_id(offset_m)
                                step_lat, step_lng = offset_lat_lng(
                                    coords_lat, coords_lng, offset_m, back_bearing
                                )
                                if step_lat is None or step_lng is None:
                                    continue
                                view_id = f"stepback_{offset_id}m"
                                label = f"step back {offset_label}m"
                                fetch_candidate(
                                    view_id,
                                    label,
                                    step_lat,
                                    step_lng,
                                    coords_lat,
                                    coords_lng,
                                    [0.0],
                                )
    
                    if not view_candidates:
                        ai_status = "streetview_no_images"
                        if fetch_errors:
                            ai_status = f"streetview_error:{fetch_errors[0]}"
                            ai_notes = "; ".join(fetch_errors)
                        print(f"[AI] {uuid}: no Street View images found")
                        totals["ai_errors"] += 1
                    else:
                        view_ids = [candidate["id"] for candidate in view_candidates]
                        view_preference = build_view_preference(view_ids)
                        image_labels = []
                        images = []
                        for candidate in view_candidates:
                            add_prompt_images(
                                candidate["images"],
                                f"View {candidate['id']}: {candidate['label']}",
                                candidate["metadata"],
                                image_labels,
                                images,
                            )
    
                        prompt = build_openai_prompt(
                            entry.get("org"),
                            entry.get("location"),
                            address_for_geocode,
                            image_labels,
                            address_context,
                            floor_num,
                            view_ids,
                            view_preference,
                        )
                        err = None
                        try:
                            parsed, err = call_openai_with_retry(
                                args.openai_api_key,
                                args.openai_model,
                                prompt,
                                images,
                                args.timeout,
                                args.openai_retries,
                                args.openai_backoff_min,
                                args.openai_backoff_max,
                            )
                        except Exception as exc:
                            parsed = None
                            err = str(exc)
    
                        if not parsed:
                            ai_status = f"openai_error:{err}"
                            ai_notes = err
                            totals["ai_errors"] += 1
                        else:
                            ai_parsed = parsed
                            ai_status = "ok"
                            ai_best_view = parsed.get("best_view", "")
                            ai_confidence = parsed.get("confidence", "")
                            ai_notes = parsed.get("notes", "")
                            view_lookup = {candidate["id"]: candidate for candidate in view_candidates}
                            chosen = view_lookup.get(ai_best_view)
                            if chosen:
                                streetview_payload = chosen["url"]
                            elif ai_best_view and ai_best_view != "neither":
                                ai_status = f"openai_unusable:{ai_best_view}"

            if use_cached_payload:
                change_notes = [cached_note] if cached_note else []
                payload = dict(cached_payload) if isinstance(cached_payload, dict) else {}
                payload_precomputed = True
                suggested_address = cached_patch.get("suggested_address", "")
                distance_meters = cached_patch.get("distance_meters")
                ai_status = cached_patch.get("ai_status", "")
                ai_best_view = cached_patch.get("ai_best_view", "")
                ai_confidence = cached_patch.get("ai_confidence", "")
                ai_notes = cached_patch.get("ai_notes", "")
                default_streetview_url = cached_patch.get("default_streetview_url", "")
                search_streetview_url = cached_patch.get("search_streetview_url", "")
                discrepancy_flags = []

            if args.ai_test:
                print(
                    f"[AI-TEST] {uuid}: status={ai_status} best_view={ai_best_view} "
                    f"confidence={ai_confidence} notes={ai_notes}"
                )
                if ai_parsed is not None:
                    print(
                        f"[AI-TEST] {uuid}: response={json.dumps(ai_parsed, ensure_ascii=True)}"
                    )
                if view_candidates:
                    for candidate in view_candidates:
                        print(
                            f"[AI-TEST] {uuid}: view_id={candidate['id']} url={candidate['url']}"
                        )
                if streetview_payload:
                    print(f"[AI-TEST] {uuid}: chosen_url={streetview_payload}")
                if ai_test_remaining is not None:
                    ai_test_remaining -= 1
                    if ai_test_remaining <= 0:
                        stop_reason = "ai_test"
                        stop_uuid = uuid
                        break
                priority_remaining.discard(uuid)
                continue
    
            if not payload_precomputed:
                payload = {}
                if next_address != base_address:
                    payload["address"] = next_address

                if streetview_payload:
                    payload["streetview_url"] = streetview_payload
                    change_notes.append(f"streetview_url set ({ai_best_view})")
    
            if not payload:
                print(f"[OK] {uuid}")
                totals["no_change"] += 1
                progress_writer, _ = ensure_writer(
                    args.progress_csv, PROGRESS_FIELDS, progress_holder
                )
                progress_writer.writerow(
                    {
                        "uuid": uuid,
                        "status": "no_change",
                        "note": "",
                        "source": source_label,
                        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                    }
                )
            else:
                note = " | ".join(change_notes)
                patch_status = "dry_run" if args.dry_run else "patched"
                patch_error_note = ""

                if not args.dry_run:
                    priority_blocked = (
                        priority_patch_only
                        and not priority_remaining
                        and uuid not in priority_ids
                    )
                    if args.patch_limit and patch_attempts >= args.patch_limit:
                        if patch_limit_reached_at is None:
                            patch_limit_reached_at = time.strftime("%Y-%m-%d %H:%M:%S")
                        patch_status = "patch_limit"
                        patch_error_note = f"patch_limit_reached_at={patch_limit_reached_at}"
                        print(f"[PATCH-LIMIT] {uuid}: {note}")
                    elif priority_blocked:
                        if patch_priority_exhausted_at is None:
                            patch_priority_exhausted_at = time.strftime(
                                "%Y-%m-%d %H:%M:%S"
                            )
                        patch_status = "patch_limit"
                        patch_error_note = (
                            f"patch_priority_exhausted_at={patch_priority_exhausted_at}"
                        )
                        print(f"[PATCH-LIMIT] {uuid}: {note}")
                    else:
                        print(f"[PATCH] {uuid}: {note}")
                        patch_attempts += 1
                        status, body = http_request(
                            "PATCH",
                            get_url,
                            headers=build_headers(token, is_json=True),
                            payload=payload,
                        )
                        sleep_with_jitter(args.patch_sleep_min, args.patch_sleep_max)
                        if status is None:
                            patch_error_note = format_http_error("PATCH", get_url, status, body)
                            print(f"[ERROR] {uuid}: {patch_error_note}")
                            totals["errors"] += 1
                            patch_status = "error"
                        elif status >= 300:
                            patch_error_note = format_http_error("PATCH", get_url, status, body)
                            if is_auth_error(status, body):
                                print(f"[AUTH] {uuid}: {patch_error_note}")
                                totals["auth_errors"] += 1
                                totals["errors"] += 1
                                patch_status = "auth_error"
                            else:
                                print(f"[ERROR] {uuid}: {patch_error_note}")
                                totals["errors"] += 1
                                patch_status = "error"
                else:
                    print(f"[PATCH] {uuid}: {note}")
    
                if patch_status == "patched":
                    totals["patched"] += 1
                    note_text = f"{note} <<did not revalidate>>"
                    note_body = note_payload(args.notes_user, note_text)
                    note_body["uuid"] = uuid
                    status, body = http_request(
                        "POST",
                        args.note_api,
                        headers=build_note_headers(token),
                        payload=note_body,
                        timeout=args.timeout,
                    )
                    sleep_with_jitter(args.patch_sleep_min, args.patch_sleep_max)
                    if status is None or status >= 300:
                        patch_error_note = format_http_error(
                            "POST", args.note_api, status, body
                        )
                        if is_auth_error(status or 0, body):
                            print(f"[AUTH] {uuid}: {patch_error_note}")
                            totals["auth_errors"] += 1
                            totals["errors"] += 1
                            patch_status = "auth_error"
                        else:
                            print(f"[ERROR] {uuid}: {patch_error_note}")
                            totals["errors"] += 1
                            patch_status = "note_error"
    
                note_for_reports = note
                if patch_error_note:
                    if note_for_reports:
                        note_for_reports = f"{note_for_reports} | {patch_error_note}"
                    else:
                        note_for_reports = patch_error_note
    
                patched_writer, _ = ensure_writer(
                    args.patched_report_csv, PATCH_FIELDS, patched_holder
                )
                patched_writer.writerow(
                    {
                        "uuid": uuid,
                        "patch_status": patch_status,
                        "patch_notes": note_for_reports,
                        "payload": json.dumps(payload, ensure_ascii=True),
                        "distance_meters": distance_meters,
                        "suggested_address": suggested_address,
                        "ai_status": ai_status,
                        "ai_best_view": ai_best_view,
                        "ai_confidence": ai_confidence,
                        "ai_notes": ai_notes,
                        "default_streetview_url": default_streetview_url,
                        "search_streetview_url": search_streetview_url,
                        "source": source_label,
                    }
                )
    
                progress_writer, _ = ensure_writer(
                    args.progress_csv, PROGRESS_FIELDS, progress_holder
                )
                progress_writer.writerow(
                    {
                        "uuid": uuid,
                        "status": patch_status,
                        "note": note_for_reports,
                        "source": source_label,
                        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                    }
                )
    
                if patch_status not in {"patched", "dry_run", "patch_limit"}:
                    stop_reason = patch_status
                    stop_uuid = uuid
                    break
    
            if not skip_recommendations and (
                suggested_address
                or discrepancy_flags
                or (wants_streetview and not has_streetview)
            ):
                recommend_writer, _ = ensure_writer(
                    args.recommendations_csv, RECOMMEND_FIELDS, recommend_holder
                )
                recommend_writer.writerow(
                    {
                        "uuid": uuid,
                        "distance_meters": distance_meters,
                        "distance_threshold": args.distance_threshold_meters,
                        "suggested_address": suggested_address,
                        "discrepancy_flags": "; ".join(discrepancy_flags),
                        "default_streetview_url": default_streetview_url,
                        "search_streetview_url": search_streetview_url,
                        "ai_status": ai_status,
                        "ai_best_view": ai_best_view,
                        "ai_confidence": ai_confidence,
                        "ai_notes": ai_notes,
                        "source": source_label,
                    }
                )

            priority_remaining.discard(uuid)
            if args.sleep > 0:
                time.sleep(args.sleep)
    except KeyboardInterrupt:
        interrupted = True
        stop_reason = "keyboard_interrupt"
        stop_uuid = current_uuid
    finally:
        for handle in (
            progress_holder.get("handle"),
            patched_holder.get("handle"),
            recommend_holder.get("handle"),
        ):
            if handle:
                handle.close()

    print(
        "Done. "
        f"total={totals['total']} "
        f"patched={totals['patched']} "
        f"no_change={totals['no_change']} "
        f"skipped={totals['skipped']} "
        f"errors={totals['errors']} "
        f"auth_errors={totals['auth_errors']} "
        f"ai_errors={totals['ai_errors']}"
    )

    run_finished_at = time.strftime("%Y-%m-%d %H:%M:%S")
    run_state = {
        "run_started_at": run_started_at,
        "run_finished_at": run_finished_at,
        "stop_reason": stop_reason or "completed",
        "stop_uuid": stop_uuid,
        "patch_limit": args.patch_limit,
        "patch_attempts": patch_attempts,
        "patch_limit_reached_at": patch_limit_reached_at,
        "patch_priority_exhausted_at": patch_priority_exhausted_at,
        "patch_priority_only": priority_patch_only,
        "patch_priority_matches": len(priority_matches),
        "resume": bool(args.resume),
        "interrupted": interrupted,
    }
    write_run_state(args.run_state_path, run_state)

    if stop_reason and stop_reason not in {"auth_error", "ai_test"}:
        suffix = f" at {stop_uuid}" if stop_uuid else ""
        print(f"Stopped after {stop_reason}{suffix}. Fix the issue and rerun with --resume.")

    if totals["auth_errors"]:
        print("Auth error encountered. Refresh token and rerun with --resume.")
        return 2

    return 0 if totals["errors"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
