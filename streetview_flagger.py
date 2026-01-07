import argparse
import base64
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from math import atan2, cos, degrees, radians, sin
EMPTY_VALUES = {"", "null", "none", "nan", "na", "n/a"}
ORG_KEYS = ["organization_name", "org_name", "organization", "org"]
LOC_KEYS = ["location_name", "loc_name", "location", "name"]
STREET_KEYS = [
    "street",
    "address1",
    "address_1",
    "address_line1",
    "address_line_1",
    "address_line",
]
CITY_KEYS = ["city", "town"]
STATE_KEYS = ["state", "state_code", "region", "province"]
POSTAL_KEYS = ["postal_code", "zip", "zipcode", "zip_code", "postcode"]
COUNTRY_KEYS = ["country", "country_code"]
LAT_KEYS = ["lat", "latitude", "y", "lat "]
LNG_KEYS = ["lng", "lon", "long", "longitude", "x", "lng "]
STREETVIEW_KEYS = ["streetview_url", "street_view_url", "streetview", "street_view"]
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
def parse_float(value):
    if is_empty(value):
        return None
    try:
        return float(str(value).strip())
    except ValueError:
        return None
def build_full_address(row, header_map):
    full_address = get_value(row, header_map, "full_address", "address_full", "fulladdress")
    if full_address:
        return full_address
    street = get_value(row, header_map, *STREET_KEYS)
    if not street:
        street = get_value(row, header_map, "address")
    city = get_value(row, header_map, *CITY_KEYS)
    state = get_value(row, header_map, *STATE_KEYS)
    postal = get_value(row, header_map, *POSTAL_KEYS)
    country = get_value(row, header_map, *COUNTRY_KEYS)
    parts = [street, city, state, postal, country]
    parts = [part for part in parts if part]
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
def build_maps_search_url(query):
    if not query:
        return ""
    return "https://www.google.com/maps/search/?api=1&query=" + urllib.parse.quote_plus(query)
def build_pano_url(lat, lng):
    if lat is None or lng is None:
        return ""
    return (
        "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint="
        + f"{lat},{lng}"
    )
def http_get(url, headers=None, timeout=30):
    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()
def http_get_json(url, headers=None, timeout=30):
    data = http_get(url, headers=headers, timeout=timeout)
    return json.loads(data.decode("utf-8"))
def http_post_json(url, payload, headers=None, timeout=60):
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers or {}, method="POST")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))
def fetch_with_retries(fn, retries=2, backoff=2.0):
    last_error = None
    for attempt in range(retries + 1):
        try:
            return fn()
        except Exception as err:
            last_error = err
            if attempt < retries:
                time.sleep(backoff * (attempt + 1))
    raise last_error
def compute_heading(from_lat, from_lng, to_lat, to_lng):
    lat1 = radians(from_lat)
    lat2 = radians(to_lat)
    dlon = radians(to_lng - from_lng)
    y = sin(dlon) * cos(lat2)
    x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dlon)
    bearing = degrees(atan2(y, x))
    return (bearing + 360) % 360
def fetch_streetview_metadata(lat, lng, api_key, radius, source, timeout):
    url = (
        "https://maps.googleapis.com/maps/api/streetview/metadata?location="
        + f"{lat},{lng}&radius={radius}&source={source}&key={api_key}"
    )
    return fetch_with_retries(lambda: http_get_json(url, timeout=timeout))
def fetch_streetview_image(lat, lng, api_key, size, radius, source, timeout):
    metadata = fetch_streetview_metadata(lat, lng, api_key, radius, source, timeout)
    status = metadata.get("status")
    if status != "OK":
        return None, f"Street View metadata status {status}"
    pano_loc = metadata.get("location") or {}
    pano_lat = pano_loc.get("lat")
    pano_lng = pano_loc.get("lng")
    if pano_lat is None or pano_lng is None:
        return None, "Street View metadata missing pano location"
    heading = compute_heading(pano_lat, pano_lng, lat, lng)
    image_url = (
        "https://maps.googleapis.com/maps/api/streetview?size="
        + f"{size}&location={pano_lat},{pano_lng}&heading={heading}"
        + f"&pitch=0&fov=90&source={source}&return_error_code=true&key={api_key}"
    )
    try:
        image_bytes = fetch_with_retries(lambda: http_get(image_url, timeout=timeout))
    except urllib.error.HTTPError as err:
        return None, f"Street View image HTTP error {err.code}"
    return {
        "image_bytes": image_bytes,
        "image_url": image_url,
        "heading": heading,
        "pano_lat": pano_lat,
        "pano_lng": pano_lng,
        "metadata": metadata,
    }, None
def google_geocode(query, api_key, timeout):
    url = (
        "https://maps.googleapis.com/maps/api/geocode/json?address="
        + urllib.parse.quote_plus(query)
        + f"&key={api_key}"
    )
    data = fetch_with_retries(lambda: http_get_json(url, timeout=timeout))
    status = data.get("status")
    if status != "OK":
        return None, f"Geocode status {status}"
    results = data.get("results") or []
    if not results:
        return None, "Geocode returned no results"
    location = results[0].get("geometry", {}).get("location")
    if not location:
        return None, "Geocode missing location"
    return location, None
def google_places_text_search(query, api_key, timeout):
    url = (
        "https://maps.googleapis.com/maps/api/place/textsearch/json?query="
        + urllib.parse.quote_plus(query)
        + f"&key={api_key}"
    )
    data = fetch_with_retries(lambda: http_get_json(url, timeout=timeout))
    status = data.get("status")
    if status != "OK":
        return None, f"Places status {status}"
    results = data.get("results") or []
    if not results:
        return None, "Places returned no results"
    location = results[0].get("geometry", {}).get("location")
    if not location:
        return None, "Places missing location"
    return location, None
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
def call_openai(api_key, model, prompt, images, timeout):
    content = [{"type": "text", "text": prompt}]
    for image in images:
        content.append({"type": "image_url", "image_url": {"url": image}})
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "You review Street View images for storefront visibility.",
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
def build_openai_prompt(org_name, loc_name, address, has_search):
    org = org_name or "(missing)"
    loc = loc_name or "(missing)"
    addr = address or "(missing)"
    if has_search:
        image_instructions = (
            "Image A: default Street View from coordinates.\n"
            "Image B: Street View based on the search query."
        )
    else:
        image_instructions = "Image A: default Street View from coordinates."
    return (
        "Review the Street View images for storefront validity.\n"
        f"Organization: {org}\n"
        f"Location: {loc}\n"
        f"Address: {addr}\n"
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
        '  "best_view": "default" | "search" | "neither",\n'
        '  "confidence": 0.0-1.0,\n'
        '  "notes": "short reason"\n'
        "}\n"
        "Be conservative and set unsure=true if you cannot tell."
    )
def load_processed_ids(output_path, id_column):
    if not os.path.exists(output_path):
        return set()
    processed = set()
    with open(output_path, "r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            value = row.get(id_column)
            if value:
                processed.add(value)
    return processed
def build_output_fields(input_fields, new_fields):
    output_fields = list(input_fields or [])
    for field in new_fields:
        if field not in output_fields:
            output_fields.append(field)
    return output_fields
def main():
    parser = argparse.ArgumentParser(
        description=(
            "Flag questionable Street View defaults for locations with missing streetview_url."
        )
    )
    parser.add_argument("--input", required=True, help="Input CSV path")
    parser.add_argument("--output", help="Output CSV path")
    parser.add_argument("--openai-api-key", default=os.getenv("OPENAI_API_KEY"))
    parser.add_argument("--openai-model", default=os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    parser.add_argument("--google-api-key", default=os.getenv("GOOGLE_MAPS_API_KEY"))
    parser.add_argument(
        "--google-search-mode",
        choices=["geocode", "places"],
        default="geocode",
        help="How to resolve search queries into coordinates.",
    )
    parser.add_argument("--include-all", action="store_true", help="Process all rows.")
    parser.add_argument("--limit", type=int, default=0, help="Limit rows processed.")
    parser.add_argument("--resume", action="store_true", help="Skip UUIDs already in output.")
    parser.add_argument("--image-size", default="640x640", help="Street View image size.")
    parser.add_argument("--radius", type=int, default=50, help="Street View search radius.")
    parser.add_argument("--timeout", type=int, default=30, help="HTTP timeout in seconds.")
    parser.add_argument("--sleep", type=float, default=0.0, help="Sleep between rows.")
    parser.add_argument("--skip-openai", action="store_true", help="Skip OpenAI checks.")
    parser.add_argument("--skip-google", action="store_true", help="Skip Google lookups.")
    parser.add_argument("--cache-dir", default="", help="Optional folder to save images.")
    args = parser.parse_args()
    input_path = args.input
    output_path = args.output
    if not output_path:
        base, ext = os.path.splitext(input_path)
        output_path = base + "_streetview_flags.csv"
    if args.cache_dir:
        os.makedirs(args.cache_dir, exist_ok=True)
    with open(input_path, "r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        input_fields = reader.fieldnames or []
        header_map = build_header_map(input_fields)
        id_column = header_map.get("uuid") or header_map.get("id") or "uuid"
        processed_ids = set()
        if args.resume:
            processed_ids = load_processed_ids(output_path, id_column)
        new_fields = [
            "gogetta_streetview_link",
            "default_streetview_url",
            "search_maps_url",
            "search_query",
            "search_lat",
            "search_lng",
            "search_streetview_url",
            "default_image_url",
            "search_image_url",
            "ai_flags",
            "ai_best_view",
            "ai_confidence",
            "ai_notes",
            "ai_status",
            "error",
        ]
        output_fields = build_output_fields(input_fields, new_fields)
        output_exists = os.path.exists(output_path) and args.resume
        mode = "a" if output_exists else "w"
        with open(output_path, mode, encoding="utf-8", newline="") as out_handle:
            writer = csv.DictWriter(out_handle, fieldnames=output_fields)
            if not output_exists:
                writer.writeheader()
            count = 0
            for row in reader:
                if args.limit and count >= args.limit:
                    break
                count += 1
                uuid = get_value(row, header_map, "uuid", "id", "location_id")
                if not uuid:
                    continue
                if uuid in processed_ids:
                    continue
                org_name = get_value(row, header_map, *ORG_KEYS)
                loc_name = get_value(row, header_map, *LOC_KEYS)
                address = build_full_address(row, header_map)
                streetview_url = get_value(row, header_map, *STREETVIEW_KEYS)
                has_streetview = bool(streetview_url)
                if has_streetview and not args.include_all:
                    continue
                lat = parse_float(get_value(row, header_map, *LAT_KEYS))
                lng = parse_float(get_value(row, header_map, *LNG_KEYS))
                row_out = dict(row)
                row_out.update(
                    {
                        "gogetta_streetview_link": (
                            f"https://gogetta.nyc/team/location/{uuid}/questions/street-view"
                        ),
                        "default_streetview_url": build_pano_url(lat, lng),
                        "search_maps_url": "",
                        "search_query": "",
                        "search_lat": "",
                        "search_lng": "",
                        "search_streetview_url": "",
                        "default_image_url": "",
                        "search_image_url": "",
                        "ai_flags": "",
                        "ai_best_view": "",
                        "ai_confidence": "",
                        "ai_notes": "",
                        "ai_status": "",
                        "error": "",
                    }
                )
                search_query = build_search_query(org_name, loc_name, address)
                row_out["search_query"] = search_query
                row_out["search_maps_url"] = build_maps_search_url(search_query)
                if has_streetview and args.include_all:
                    row_out["ai_status"] = "skipped_existing_streetview"
                    writer.writerow(row_out)
                    continue
                if lat is None or lng is None:
                    row_out["ai_status"] = "missing_coordinates"
                    row_out["error"] = "Missing lat/lng for default Street View."
                    writer.writerow(row_out)
                    continue
                default_image = None
                search_image = None
                search_lat = None
                search_lng = None
                use_google = bool(args.google_api_key) and not args.skip_google
                if use_google:
                    default_image, default_err = fetch_streetview_image(
                        lat,
                        lng,
                        args.google_api_key,
                        args.image_size,
                        args.radius,
                        "outdoor",
                        args.timeout,
                    )
                    if default_err:
                        row_out["error"] = default_err
                    if default_image:
                        row_out["default_image_url"] = default_image["image_url"]
                        if args.cache_dir:
                            path = os.path.join(args.cache_dir, f"{uuid}_default.jpg")
                            with open(path, "wb") as image_handle:
                                image_handle.write(default_image["image_bytes"])
                else:
                    row_out["ai_status"] = "skipped_missing_google_key"
                if use_google and search_query:
                    if args.google_search_mode == "places":
                        search_location, search_err = google_places_text_search(
                            search_query, args.google_api_key, args.timeout
                        )
                    else:
                        search_location, search_err = google_geocode(
                            search_query, args.google_api_key, args.timeout
                        )
                    if search_err:
                        row_out["error"] = search_err
                    if search_location:
                        search_lat = search_location.get("lat")
                        search_lng = search_location.get("lng")
                        row_out["search_lat"] = search_lat
                        row_out["search_lng"] = search_lng
                        row_out["search_streetview_url"] = build_pano_url(
                            search_lat, search_lng
                        )
                        search_image, search_err = fetch_streetview_image(
                            search_lat,
                            search_lng,
                            args.google_api_key,
                            args.image_size,
                            args.radius,
                            "outdoor",
                            args.timeout,
                        )
                        if search_err:
                            row_out["error"] = search_err
                        if search_image:
                            row_out["search_image_url"] = search_image["image_url"]
                            if args.cache_dir:
                                path = os.path.join(args.cache_dir, f"{uuid}_search.jpg")
                                with open(path, "wb") as image_handle:
                                    image_handle.write(search_image["image_bytes"])
                if args.skip_openai or not args.openai_api_key:
                    if not row_out["ai_status"]:
                        row_out["ai_status"] = "skipped_missing_openai_key"
                    writer.writerow(row_out)
                    continue
                if not default_image:
                    row_out["ai_status"] = "skipped_missing_default_image"
                    writer.writerow(row_out)
                    continue
                default_b64 = base64.b64encode(default_image["image_bytes"]).decode("ascii")
                default_data_url = "data:image/jpeg;base64," + default_b64
                images = [default_data_url]
                if search_image:
                    search_b64 = base64.b64encode(search_image["image_bytes"]).decode("ascii")
                    images.append("data:image/jpeg;base64," + search_b64)
                prompt = build_openai_prompt(org_name, loc_name, address, bool(search_image))
                try:
                    response_text = call_openai(
                        args.openai_api_key, args.openai_model, prompt, images, args.timeout
                    )
                    parsed = extract_json(response_text)
                    if "error" in parsed:
                        row_out["ai_status"] = "openai_invalid_json"
                        row_out["ai_notes"] = parsed.get("raw", "")
                    else:
                        row_out["ai_flags"] = json.dumps(
                            parsed.get("flags", {}), ensure_ascii=True
                        )
                        row_out["ai_best_view"] = parsed.get("best_view", "")
                        row_out["ai_confidence"] = parsed.get("confidence", "")
                        row_out["ai_notes"] = parsed.get("notes", "")
                        row_out["ai_status"] = "ok"
                except Exception as err:
                    row_out["ai_status"] = "openai_error"
                    row_out["error"] = str(err)
                writer.writerow(row_out)
                if args.sleep:
                    time.sleep(args.sleep)
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
