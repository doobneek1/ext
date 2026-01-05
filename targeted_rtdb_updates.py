import argparse
import json
import os
import random
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Generator, Tuple


DEFAULT_LOG_EVERY = 100
DEFAULT_MAX_RETRIES = 5
DEFAULT_RETRY_BACKOFF_MS = 1000
DEFAULT_RETRY_MAX_MS = 10000
DEFAULT_RETRY_JITTER_MS = 250


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Apply RTDB updates with per-path requests to avoid overwriting nodes."
    )
    parser.add_argument(
        "--input",
        action="append",
        required=True,
        help=(
            "Updates JSON file, manifest JSON with chunks, or a directory of chunk files. "
            "Can be provided multiple times."
        ),
    )
    parser.add_argument(
        "--db-url",
        required=True,
        help="RTDB base URL like https://<db>.firebaseio.com",
    )
    parser.add_argument(
        "--token",
        help="RTDB auth token (or set RTDB_TOKEN/FIREBASE_TOKEN env vars).",
    )
    parser.add_argument(
        "--method",
        choices=["put", "patch"],
        default="put",
        help="HTTP method to use for each update path.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process only the first N updates (0 = no limit).",
    )
    parser.add_argument(
        "--skip",
        type=int,
        default=0,
        help="Skip the first N updates.",
    )
    parser.add_argument(
        "--sleep-ms",
        type=int,
        default=0,
        help="Sleep between requests (milliseconds).",
    )
    parser.add_argument(
        "--log-every",
        type=int,
        default=DEFAULT_LOG_EVERY,
        help="Log progress every N updates.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only count updates without sending requests.",
    )
    parser.add_argument(
        "--stop-on-error",
        action="store_true",
        help="Stop on the first request error.",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=DEFAULT_MAX_RETRIES,
        help="Retry requests on 429/5xx up to N times (0 disables).",
    )
    parser.add_argument(
        "--retry-backoff-ms",
        type=int,
        default=DEFAULT_RETRY_BACKOFF_MS,
        help="Base backoff in milliseconds for retries.",
    )
    parser.add_argument(
        "--retry-max-ms",
        type=int,
        default=DEFAULT_RETRY_MAX_MS,
        help="Max backoff in milliseconds for retries.",
    )
    parser.add_argument(
        "--retry-jitter-ms",
        type=int,
        default=DEFAULT_RETRY_JITTER_MS,
        help="Random jitter (ms) added to retry backoff.",
    )
    return parser.parse_args()


def resolve_token(arg_token: str | None) -> str:
    if arg_token:
        return arg_token
    return os.getenv("RTDB_TOKEN") or os.getenv("FIREBASE_TOKEN") or ""


def load_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def iter_update_map(data: object) -> Generator[Tuple[str, object], None, None]:
    if not isinstance(data, dict):
        raise ValueError("Updates file is not an object.")
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


def iter_updates_from_inputs(
    input_paths: list[Path],
) -> Generator[Tuple[str, object], None, None]:
    for input_path in input_paths:
        yield from iter_updates(input_path)


def build_key_url(db_url: str, key: str, token: str) -> str:
    base = db_url.rstrip("/")
    path = key if key.startswith("/") else f"/{key}"
    url = f"{base}{path}.json"
    if token:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}{urllib.parse.urlencode({'auth': token})}"
    return url


def parse_retry_after(headers: object) -> float | None:
    if not headers:
        return None
    try:
        value = headers.get("Retry-After")
    except AttributeError:
        return None
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def send_update(
    url: str, value: object, method: str
) -> Tuple[int | None, str, float | None]:
    payload = json.dumps(value, ensure_ascii=True).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"content-type": "application/json"},
        method=method.upper(),
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            retry_after = parse_retry_after(resp.headers)
            return resp.status, body, retry_after
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        retry_after = parse_retry_after(exc.headers)
        return exc.code, body, retry_after
    except urllib.error.URLError as exc:
        return None, str(exc), None


def summarize_error(body: str, limit: int = 300) -> str:
    if len(body) <= limit:
        return body
    return body[:limit] + "..."


def is_retryable_status(status: int | None) -> bool:
    if status is None:
        return True
    if status == 429:
        return True
    return 500 <= status < 600


def compute_retry_sleep_ms(
    attempt: int,
    retry_after: float | None,
    backoff_ms: int,
    max_ms: int,
    jitter_ms: int,
) -> int:
    if retry_after is not None:
        sleep_ms = int(retry_after * 1000)
        if backoff_ms:
            sleep_ms = max(sleep_ms, backoff_ms)
    else:
        sleep_ms = backoff_ms * (2**attempt) if backoff_ms else 0
    if max_ms and sleep_ms > max_ms:
        sleep_ms = max_ms
    if jitter_ms:
        sleep_ms += random.randint(0, jitter_ms)
    return sleep_ms


def apply_updates(
    updates: Generator[Tuple[str, object], None, None],
    db_url: str,
    token: str,
    method: str,
    limit: int,
    skip: int,
    sleep_ms: int,
    log_every: int,
    dry_run: bool,
    stop_on_error: bool,
    max_retries: int,
    retry_backoff_ms: int,
    retry_max_ms: int,
    retry_jitter_ms: int,
) -> int:
    stats = {
        "seen": 0,
        "sent": 0,
        "failed": 0,
        "skipped": 0,
        "retried": 0,
        "rate_limited": 0,
    }

    for key, value in updates:
        stats["seen"] += 1
        if skip and stats["seen"] <= skip:
            stats["skipped"] += 1
            continue
        if limit and stats["sent"] >= limit:
            break

        if dry_run:
            stats["sent"] += 1
        else:
            url = build_key_url(db_url, key, token)
            attempt = 0
            while True:
                status, body, retry_after = send_update(url, value, method)
                if status is None or status >= 300:
                    retryable = is_retryable_status(status)
                    if retryable and attempt < max_retries:
                        if status == 429:
                            stats["rate_limited"] += 1
                        sleep_for = compute_retry_sleep_ms(
                            attempt,
                            retry_after,
                            retry_backoff_ms,
                            retry_max_ms,
                            retry_jitter_ms,
                        )
                        stats["retried"] += 1
                        attempt += 1
                        if sleep_for:
                            print(
                                f"Retrying {key} in {sleep_for}ms "
                                f"(status={status}, attempt={attempt}/{max_retries})"
                            )
                            time.sleep(sleep_for / 1000.0)
                        continue

                    stats["failed"] += 1
                    print(f"Error {status} for {key}: {summarize_error(body)}")
                    if stop_on_error:
                        return 2
                else:
                    stats["sent"] += 1
                break

            if sleep_ms:
                time.sleep(sleep_ms / 1000.0)

        if log_every and stats["sent"] % log_every == 0:
            print(
                f"Progress: sent={stats['sent']} failed={stats['failed']} seen={stats['seen']}"
            )

    print(
        "Done. "
        f"seen={stats['seen']} "
        f"sent={stats['sent']} "
        f"failed={stats['failed']} "
        f"skipped={stats['skipped']} "
        f"retried={stats['retried']} "
        f"rate_limited={stats['rate_limited']}"
    )
    return 0 if stats["failed"] == 0 else 2


def main() -> int:
    args = parse_args()
    input_values = args.input or []
    input_paths = [Path(value) for value in input_values if value]
    if not input_paths:
        print("Input not found: no input paths provided.")
        return 1
    missing = [path for path in input_paths if not path.exists()]
    if missing:
        for path in missing:
            print(f"Input not found: {path}")
        return 1

    token = resolve_token(args.token)
    updates = iter_updates_from_inputs(input_paths)

    return apply_updates(
        updates=updates,
        db_url=args.db_url,
        token=token,
        method=args.method,
        limit=args.limit,
        skip=args.skip,
        sleep_ms=args.sleep_ms,
        log_every=args.log_every,
        dry_run=args.dry_run,
        stop_on_error=args.stop_on_error,
        max_retries=max(0, args.max_retries or 0),
        retry_backoff_ms=max(0, args.retry_backoff_ms or 0),
        retry_max_ms=max(0, args.retry_max_ms or 0),
        retry_jitter_ms=max(0, args.retry_jitter_ms or 0),
    )


if __name__ == "__main__":
    raise SystemExit(main())
