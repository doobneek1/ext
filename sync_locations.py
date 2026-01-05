#!/usr/bin/env python3
import argparse
import csv
import difflib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


DEFAULT_BASE_URL = "https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations"
DEFAULT_GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

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

UPPER_TOKENS = {"N", "S", "E", "W", "NE", "NW", "SE", "SW", "PO"}

REPORT_FIELDS = [
    "uuid",
    "csv_city",
    "api_city",
    "normalized_city",
    "csv_address_1",
    "api_address_1",
    "normalized_address_1",
    "flags",
    "patch_status",
]
PATCH_REPORT_FIELDS = [
    "uuid",
    "patch_status",
    "patch_notes",
    "flags",
    "geo_flags",
    "payload",
]


def parse_args(argv):
    parser = argparse.ArgumentParser(
        description=(
            "Compare CSV lat/long to location positions and PATCH mismatches. "
            "Optionally normalize address/city formatting and validate zip via Google Maps."
        )
    )
    parser.add_argument(
        "csv_path",
        help="CSV path with uuid and lat/long and/or city/address columns.",
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
        "--tolerance",
        type=float,
        default=1e-6,
        help="Float tolerance when comparing coordinates.",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.0,
        help="Seconds to sleep between requests.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show mismatches without issuing PATCH calls.",
    )
    parser.add_argument(
        "--use-position",
        action="store_true",
        help="Send position object instead of latitude/longitude fields.",
    )
    parser.add_argument(
        "--no-header",
        action="store_true",
        help="Treat CSV as no-header: uuid, latitude, longitude (in that order).",
    )
    parser.add_argument(
        "--google-api-key",
        default=os.getenv("GOOGLE_MAPS_API_KEY") or os.getenv("GOOGLE_API_KEY"),
        help="Google Maps API key for zip/address validation.",
    )
    parser.add_argument(
        "--google-timeout",
        type=int,
        default=30,
        help="HTTP timeout in seconds for Google Maps requests.",
    )
    parser.add_argument(
        "--skip-google",
        action="store_true",
        help="Skip Google Maps zip/address validation.",
    )
    parser.add_argument(
        "--report-csv",
        help="Write a CSV report with address/city normalization details.",
    )
    parser.add_argument(
        "--patched-only-csv",
        help="Write a CSV report containing only successfully patched rows.",
    )
    parser.add_argument(
        "--no-report",
        action="store_true",
        help="Disable CSV report generation for address/city normalization.",
    )
    parser.add_argument(
        "--patch-flagged",
        action="store_true",
        help="Allow PATCH even when address/city rows are flagged as suspicious.",
    )
    parser.add_argument(
        "--normalize-api-address",
        action="store_true",
        help="Normalize city/address from API values when CSV columns are empty.",
    )
    return parser.parse_args(argv)


def build_headers(token, is_json):
    headers = {
        "accept": "application/json, text/plain, */*",
        "authorization": token,
    }
    if is_json:
        headers["content-type"] = "application/json"
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


def floats_close(a, b, tol):
    return abs(a - b) <= tol


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


def normalize_whitespace(value):
    return " ".join(str(value or "").strip().split())


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
        text = re.sub(rf"\b{re.escape(token)}\b", token, text, flags=re.IGNORECASE)
    return text


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
    return titled


def add_flags(container, values):
    for value in values:
        if value and value not in container:
            container.append(value)


def flag_city(value):
    flags = []
    text = normalize_whitespace(value)
    if not text:
        flags.append("missing_city")
    elif re.search(r"\d", text):
        flags.append("city_has_digits")
    return flags


def flag_address(value):
    flags = []
    text = normalize_whitespace(value)
    if not text:
        flags.append("missing_address")
        return flags
    if len(text) < 3:
        flags.append("address_too_short")
    if not re.search(r"[A-Za-z]", text):
        flags.append("address_no_letters")
    if not re.search(r"\d", text):
        flags.append("address_no_digits")
    return flags


def normalized_equal(a, b):
    left = normalize_whitespace(a).lower()
    right = normalize_whitespace(b).lower()
    if not left and not right:
        return True
    return left == right


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


def is_blank(value):
    if value is None:
        return True
    text = str(value).strip()
    if not text:
        return True
    return text.lower() in EMPTY_VALUES


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


def build_full_address(address):
    if not address:
        return ""
    if isinstance(address, str):
        return normalize_whitespace(address)
    if not isinstance(address, dict):
        return ""
    street = address.get("street") or address.get("address_1") or address.get("address1")
    city = address.get("city")
    state = address.get("state") or address.get("region")
    postal = address.get("postalCode") or address.get("postal_code")
    country = address.get("country") or address.get("country_code")
    parts = [street, city, state, postal, country]
    parts = [normalize_whitespace(part) for part in parts if normalize_whitespace(part)]
    return ", ".join(parts)


def format_google_address(address):
    if not address:
        return ""
    formatted = address.get("formatted")
    if formatted:
        return normalize_whitespace(formatted)
    return build_full_address(address)


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
    return {
        "street": street,
        "city": city,
        "state": state,
        "postalCode": postal,
        "country": country,
        "formatted": normalize_whitespace(result.get("formatted_address")),
    }


def google_geocode_request(params, api_key, timeout):
    query = dict(params)
    query["key"] = api_key
    url = DEFAULT_GOOGLE_GEOCODE_URL + "?" + urllib.parse.urlencode(query)
    status, body = http_request("GET", url, headers={}, timeout=timeout)
    if status is None:
        return None, body
    if status >= 300:
        return None, f"Google HTTP {status} {body}"
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return None, "Invalid JSON from Google"
    status = data.get("status")
    if status != "OK":
        return None, f"Google status {status}"
    results = data.get("results") or []
    if not results:
        return None, "Google returned no results"
    return results[0], None


def google_geocode_address(address, api_key, timeout):
    if not address:
        return None, "Missing address for Google geocode"
    result, err = google_geocode_request({"address": address}, api_key, timeout)
    if err:
        return None, err
    return parse_google_address(result), None


def google_reverse_geocode(lat, lon, api_key, timeout):
    result, err = google_geocode_request({"latlng": f"{lat},{lon}"}, api_key, timeout)
    if err:
        return None, err
    return parse_google_address(result), None


def parse_float(value, label, row_id):
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid {label} for {row_id}: {value!r}")


def parse_optional_float(value, label, row_id):
    if is_blank(value):
        return None
    return parse_float(value, label, row_id)


def build_field_map(fieldnames):
    field_map = {}
    for name in fieldnames:
        if not name:
            continue
        key = name.strip().lower()
        if key and key not in field_map:
            field_map[key] = name
    return field_map


def pick_field(field_map, candidates):
    for candidate in candidates:
        key = candidate.lower()
        if key in field_map:
            return field_map[key]
    return None


def get_field_value(row, field):
    if not field:
        return ""
    value = row.get(field)
    if value is None:
        return ""
    return str(value).strip()


def iter_rows(csv_path, no_header):
    with open(csv_path, newline="", encoding="utf-8") as handle:
        if no_header:
            reader = csv.reader(handle)
            for idx, row in enumerate(reader, start=1):
                if not row:
                    continue
                if len(row) < 1:
                    continue
                yield {
                    "uuid": row[0].strip(),
                    "latitude": row[1].strip() if len(row) > 1 else "",
                    "longitude": row[2].strip() if len(row) > 2 else "",
                    "city": "",
                    "address_1": "",
                }
            return

        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError("CSV appears empty or missing headers.")
        field_map = build_field_map(reader.fieldnames)
        id_field = pick_field(
            field_map, ("uuid", "locationid", "location_id", "id")
        )
        if not id_field:
            raise ValueError(
                "CSV needs an id column named uuid, locationId, location_id, or id. "
                "Use --no-header for positional CSV."
            )
        lat_field = pick_field(field_map, ("latitude", "lat"))
        lon_field = pick_field(field_map, ("longitude", "lon", "lng", "long"))
        city_field = pick_field(field_map, ("city",))
        address_field = pick_field(field_map, ("address_1", "address1", "street", "address"))

        for row in reader:
            yield {
                "uuid": get_field_value(row, id_field),
                "latitude": get_field_value(row, lat_field),
                "longitude": get_field_value(row, lon_field),
                "city": get_field_value(row, city_field),
                "address_1": get_field_value(row, address_field),
            }


def default_report_path(csv_path):
    root, ext = os.path.splitext(csv_path)
    if not ext:
        ext = ".csv"
    return f"{root}_address_report{ext}"


def main(argv):
    args = parse_args(argv)
    token = args.token or os.getenv("DOOBNEEK_JWT") or os.getenv("JWT")
    if not token:
        print("Missing token. Provide --token or set DOOBNEEK_JWT/JWT.", file=sys.stderr)
        return 2
    use_google = bool(args.google_api_key) and not args.skip_google

    total = 0
    position_matched = 0
    position_updates = 0
    address_updates = 0
    city_updates = 0
    zip_updates = 0
    zip_mismatches = 0
    geo_flagged = 0
    patched = 0
    skipped = 0
    flagged = 0
    no_change = 0
    errors = 0

    report_handle = None
    report_writer = None
    report_path = None if args.no_report else args.report_csv or default_report_path(
        args.csv_path
    )
    patched_report_handle = None
    patched_report_writer = None
    patched_report_path = args.patched_only_csv

    try:
        for row in iter_rows(args.csv_path, args.no_header):
            total += 1
            location_id = row["uuid"]
            if not location_id:
                print(f"[SKIP] Row {total}: missing uuid")
                skipped += 1
                continue

            wants_position = bool(row["latitude"] or row["longitude"] or args.no_header)
            wants_city = bool(row["city"]) or args.normalize_api_address
            wants_address = bool(row["address_1"]) or args.normalize_api_address

            if not wants_position and not wants_city and not wants_address and not use_google:
                print(f"[SKIP] {location_id}: no usable fields and no Google API key")
                skipped += 1
                continue

            csv_lat = None
            csv_lon = None
            position_issue = None
            if wants_position:
                try:
                    csv_lat = parse_optional_float(
                        row["latitude"], "latitude", location_id
                    )
                    csv_lon = parse_optional_float(
                        row["longitude"], "longitude", location_id
                    )
                except ValueError as exc:
                    position_issue = str(exc)
                    csv_lat = None
                    csv_lon = None

                if csv_lat is None and csv_lon is None:
                    position_issue = position_issue or f"{location_id}: missing latitude/longitude"
                elif csv_lat is None or csv_lon is None:
                    position_issue = position_issue or f"{location_id}: missing latitude/longitude"
                    csv_lat = None
                    csv_lon = None

            if position_issue and not (wants_city or wants_address) and not use_google:
                print(f"[SKIP] {position_issue}")
                skipped += 1
                continue

            get_url = f"{args.base_url}/{location_id}"
            status, body = http_request(
                "GET",
                get_url,
                headers=build_headers(token, is_json=False),
            )
            if status is None:
                print(f"[ERROR] {location_id}: {body}")
                errors += 1
                continue
            if status >= 300:
                print(f"[ERROR] {location_id}: GET {status} {body}")
                errors += 1
                continue

            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                print(f"[ERROR] {location_id}: invalid JSON response")
                errors += 1
                continue

            payload = {}
            change_notes = []
            flags = []
            blocked = []
            geo_flags = []
            position_changed = False
            api_lat = None
            api_lon = None
            coords = extract_coordinates(data)
            if coords:
                try:
                    api_lon = parse_float(coords[0], "api longitude", location_id)
                    api_lat = parse_float(coords[1], "api latitude", location_id)
                except ValueError:
                    coords = None
                    api_lat = None
                    api_lon = None

            if wants_position:
                if csv_lat is None or csv_lon is None:
                    if position_issue:
                        add_flags(flags, ["position_missing"])
                        if not (wants_city or wants_address) and not use_google:
                            print(f"[SKIP] {position_issue}")
                            skipped += 1
                            continue
                else:
                    if not coords:
                        add_flags(flags, ["position_missing"])
                        position_updates += 1
                        position_changed = True
                        change_notes.append(
                            f"position api=(missing) csv=({csv_lat}, {csv_lon})"
                        )
                        if args.use_position:
                            payload["position"] = {
                                "type": "Point",
                                "coordinates": [csv_lon, csv_lat],
                            }
                        else:
                            payload["latitude"] = csv_lat
                            payload["longitude"] = csv_lon
                    else:
                        if floats_close(
                            api_lat, csv_lat, args.tolerance
                        ) and floats_close(api_lon, csv_lon, args.tolerance):
                            position_matched += 1
                        else:
                            position_updates += 1
                            position_changed = True
                            change_notes.append(
                                f"position api=({api_lat}, {api_lon}) csv=({csv_lat}, {csv_lon})"
                            )
                            if args.use_position:
                                payload["position"] = {
                                    "type": "Point",
                                    "coordinates": [csv_lon, csv_lat],
                                }
                            else:
                                payload["latitude"] = csv_lat
                                payload["longitude"] = csv_lon

            address_data = extract_address(data)
            api_city = normalize_whitespace(address_data.get("city", ""))
            api_street = normalize_whitespace(address_data.get("street", ""))
            api_state = normalize_whitespace(
                address_data.get("state") or address_data.get("region") or ""
            )
            api_postal = normalize_whitespace(address_data.get("postalCode", ""))
            normalized_city = ""
            normalized_address = ""

            if wants_city:
                csv_city = normalize_whitespace(row["city"])
                city_source = csv_city or api_city
                city_flags = flag_city(city_source)
                add_flags(flags, city_flags)
                if csv_city and api_city and not normalized_equal(csv_city, api_city):
                    add_flags(flags, ["city_mismatch"])
                normalized_city = normalize_city_name(city_source)
                if normalized_city and normalized_city != api_city:
                    if city_flags and not args.patch_flagged:
                        blocked.append("city")
                    else:
                        city_updates += 1
                        change_notes.append(
                            f"city '{api_city or ''}' -> '{normalized_city}'"
                        )

            if wants_address:
                csv_address = normalize_whitespace(row["address_1"])
                address_source = csv_address or api_street
                address_flags = flag_address(address_source)
                add_flags(flags, address_flags)
                if csv_address and api_street and not normalized_equal(
                    csv_address, api_street
                ):
                    add_flags(flags, ["address_mismatch"])
                normalized_address = normalize_street_address(address_source)
                if normalized_address and normalized_address != api_street:
                    if address_flags and not args.patch_flagged:
                        blocked.append("address")
                    else:
                        address_updates += 1
                        change_notes.append(
                            f"address '{api_street or ''}' -> '{normalized_address}'"
                        )

            base_address = {k: v for k, v in address_data.items() if v}
            next_address = dict(base_address)
            if normalized_city and normalized_city != api_city and "city" not in blocked:
                next_address["city"] = normalized_city
            if (
                normalized_address
                and normalized_address != api_street
                and "address" not in blocked
            ):
                next_address["street"] = normalized_address

            google_address = None
            google_error = None
            if use_google:
                if csv_lat is not None and csv_lon is not None:
                    google_address, google_error = google_reverse_geocode(
                        csv_lat, csv_lon, args.google_api_key, args.google_timeout
                    )
                else:
                    address_query = build_full_address(address_data)
                    if address_query:
                        google_address, google_error = google_geocode_address(
                            address_query, args.google_api_key, args.google_timeout
                        )
                    elif api_lat is not None and api_lon is not None:
                        google_address, google_error = google_reverse_geocode(
                            api_lat, api_lon, args.google_api_key, args.google_timeout
                        )

            if google_error:
                print(f"[WARN] {location_id}: google {google_error}")
            elif google_address:
                suggested_display = format_google_address(google_address)
                current_zip = normalize_zip(api_postal)
                suggested_zip = normalize_zip(google_address.get("postalCode"))
                zip_mismatch = False
                if suggested_zip and current_zip != suggested_zip:
                    zip_mismatch = True
                    zip_mismatches += 1
                    zip_updates += 1
                    next_address["postalCode"] = suggested_zip
                    change_notes.append(
                        f"zip '{api_postal or ''}' -> '{suggested_zip}'"
                    )

                current_street = api_street
                suggested_street = normalize_whitespace(google_address.get("street"))
                if current_street and suggested_street:
                    if is_very_off(
                        current_street, suggested_street, threshold=0.55, check_numbers=True
                    ):
                        geo_flags.append(
                            f"street '{current_street}' vs '{suggested_street}'"
                        )

                current_city_cmp = normalize_city_compare(api_city)
                suggested_city_cmp = normalize_city_compare(google_address.get("city"))
                if (
                    current_city_cmp
                    and suggested_city_cmp
                    and current_city_cmp != suggested_city_cmp
                ):
                    if is_very_off(current_city_cmp, suggested_city_cmp, threshold=0.5):
                        geo_flags.append(
                            f"city '{api_city}' vs '{normalize_whitespace(google_address.get('city'))}'"
                        )

                current_state_cmp = normalize_state_compare(api_state)
                suggested_state_cmp = normalize_state_compare(google_address.get("state"))
                if (
                    current_state_cmp
                    and suggested_state_cmp
                    and current_state_cmp != suggested_state_cmp
                ):
                    geo_flags.append(
                        f"state '{api_state}' vs '{normalize_whitespace(google_address.get('state'))}'"
                    )

                if suggested_display and (position_changed or geo_flags or zip_mismatch):
                    print(f"[SUGGEST] {location_id}: {suggested_display}")
                if geo_flags:
                    geo_flagged += 1
                    print(f"[ADDR] {location_id}: " + "; ".join(geo_flags))

            if next_address != base_address:
                payload["address"] = next_address

            if flags:
                flagged += 1

            if not payload:
                if blocked:
                    print(
                        f"[FLAG] {location_id}: "
                        f"blocked={','.join(blocked)} flags={','.join(flags) or 'none'}"
                    )
                    no_change += 1
                else:
                    print(f"[OK] {location_id}")
                    no_change += 1
                patch_status = "no_change" if not blocked else "skipped_flagged"
            else:
                note = " | ".join(change_notes)
                flag_note = f" flags={','.join(flags)}" if flags else ""
                print(f"[PATCH] {location_id}: {note}{flag_note}")
                if args.dry_run:
                    patch_status = "dry_run"
                else:
                    status, body = http_request(
                        "PATCH",
                        get_url,
                        headers=build_headers(token, is_json=True),
                        payload=payload,
                    )
                    if status is None:
                        print(f"[ERROR] {location_id}: {body}")
                        errors += 1
                        patch_status = "error"
                    elif status >= 300:
                        print(f"[ERROR] {location_id}: PATCH {status} {body}")
                        errors += 1
                        patch_status = "error"
                    else:
                        patched += 1
                        patch_status = "patched"

                if patched_report_path and patch_status == "patched":
                    if patched_report_writer is None:
                        patched_report_handle = open(
                            patched_report_path, "w", newline="", encoding="utf-8"
                        )
                        patched_report_writer = csv.DictWriter(
                            patched_report_handle, fieldnames=PATCH_REPORT_FIELDS
                        )
                        patched_report_writer.writeheader()
                    patched_report_writer.writerow(
                        {
                            "uuid": location_id,
                            "patch_status": patch_status,
                            "patch_notes": note,
                            "flags": ",".join(flags),
                            "geo_flags": "; ".join(geo_flags),
                            "payload": json.dumps(payload, ensure_ascii=True),
                        }
                    )

            if report_path and (wants_city or wants_address):
                if report_writer is None:
                    report_handle = open(
                        report_path, "w", newline="", encoding="utf-8"
                    )
                    report_writer = csv.DictWriter(
                        report_handle, fieldnames=REPORT_FIELDS
                    )
                    report_writer.writeheader()
                report_writer.writerow(
                    {
                        "uuid": location_id,
                        "csv_city": normalize_whitespace(row["city"]),
                        "api_city": api_city,
                        "normalized_city": normalized_city,
                        "csv_address_1": normalize_whitespace(row["address_1"]),
                        "api_address_1": api_street,
                        "normalized_address_1": normalized_address,
                        "flags": ",".join(flags),
                        "patch_status": patch_status,
                    }
                )

            if args.sleep > 0:
                time.sleep(args.sleep)
    finally:
        if report_handle:
            report_handle.close()
        if patched_report_handle:
            patched_report_handle.close()

    print(
        "Done. "
        f"total={total} "
        f"patched={patched} "
        f"position_matched={position_matched} "
        f"position_updates={position_updates} "
        f"address_updates={address_updates} "
        f"city_updates={city_updates} "
        f"zip_mismatches={zip_mismatches} "
        f"zip_updates={zip_updates} "
        f"geo_flagged={geo_flagged} "
        f"no_change={no_change} "
        f"flagged={flagged} "
        f"skipped={skipped} "
        f"errors={errors}"
    )
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
