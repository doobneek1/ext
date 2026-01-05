import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audit hours logs against schedule rules.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python audit_editor_schedule.py --hours-log hours_log.json --schedule schedule.json\n"
            "  python audit_editor_schedule.py --hours-log hours_log.json --schedule schedule.json \\\n"
            "    --output schedule_audit.json\n"
        ),
    )
    parser.add_argument(
        "--hours-log",
        required=True,
        help="Hours log JSON (timezone, user, days[{date, hours_worked_total}]).",
    )
    parser.add_argument(
        "--schedule",
        required=True,
        help="Schedule JSON with overtime rules and rates.",
    )
    parser.add_argument(
        "--output",
        default="",
        help="Optional path to write the JSON report (stdout if omitted).",
    )
    return parser.parse_args()


def load_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def parse_date(value: str) -> datetime.date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def week_start_for(day: datetime.date) -> datetime.date:
    return day - timedelta(days=day.weekday())


def resolve_rate(day: datetime.date, rates: list[dict]) -> float:
    chosen = None
    for rate in rates:
        start = parse_date(str(rate.get("start_date", "")))
        if start <= day:
            if chosen is None or start > chosen["start_date"]:
                chosen = {"start_date": start, "hourly_rate": rate.get("hourly_rate")}
    if chosen is None or chosen["hourly_rate"] is None:
        raise ValueError(f"No hourly_rate applies for {day.isoformat()}")
    return float(chosen["hourly_rate"])


def resolve_lunch_policy(schedule: dict) -> tuple[int, int]:
    lunch = schedule.get("breaks", {}).get("lunch", {})
    eligibility = lunch.get("eligibility", {})
    min_minutes = int(eligibility.get("min_work_minutes_same_day", 360))
    daily_minutes = int(lunch.get("default_paid_lunch_minutes_per_eligible_day", 60))
    weekly_cap = int(lunch.get("weekly_cap_paid_lunch_minutes", 180))
    return min_minutes, daily_minutes, weekly_cap


def build_meeting_allocations(
    schedule: dict, week_starts: list[datetime.date]
) -> tuple[list[dict], list[str]]:
    meeting_notes: list[str] = []
    meetings = schedule.get("standing_meetings", {})
    if not isinstance(meetings, dict) or not meetings:
        return [{} for _ in week_starts], meeting_notes

    meeting_notes.append(
        "Biweekly meetings are applied to every other week starting from the first week in data."
    )
    allocations: list[dict] = []
    for idx, _ in enumerate(week_starts):
        week_alloc: dict[str, int] = {}
        for name, details in meetings.items():
            if not isinstance(details, dict):
                continue
            if not details.get("counts_as_paid_work_time", True):
                continue
            duration = int(details.get("duration_minutes", 0))
            frequency = str(details.get("frequency", "")).lower()
            if frequency == "weekly":
                week_alloc[name] = duration
            elif frequency == "biweekly":
                if idx % 2 == 0:
                    week_alloc[name] = duration
        allocations.append(week_alloc)
    return allocations, meeting_notes


def main() -> int:
    args = parse_args()
    hours_path = Path(args.hours_log)
    schedule_path = Path(args.schedule)

    if not hours_path.exists():
        print(f"Hours log not found: {hours_path}")
        return 1
    if not schedule_path.exists():
        print(f"Schedule not found: {schedule_path}")
        return 1

    hours_log = load_json(hours_path)
    schedule = load_json(schedule_path)
    if not isinstance(hours_log, dict) or not isinstance(schedule, dict):
        print("Invalid JSON input.")
        return 1

    overtime_cfg = schedule.get("overtime", {})
    if not isinstance(overtime_cfg, dict):
        print("Missing overtime config in schedule JSON.")
        return 1
    threshold = overtime_cfg.get("threshold_hours_per_week")
    if threshold is None:
        print("Missing overtime.threshold_hours_per_week in schedule JSON.")
        return 1
    threshold = float(threshold)
    multiplier = float(overtime_cfg.get("multiplier", 1.5))

    rates = schedule.get("rates")
    if not isinstance(rates, list) or not rates:
        print("Missing schedule rates list.")
        return 1

    min_lunch_minutes, daily_lunch_minutes, weekly_lunch_cap = resolve_lunch_policy(
        schedule
    )

    days = hours_log.get("days")
    if not isinstance(days, list):
        print("Hours log missing days list.")
        return 1

    weekly: dict[datetime.date, dict] = {}
    for day_entry in days:
        if not isinstance(day_entry, dict):
            continue
        date_value = str(day_entry.get("date", "")).strip()
        if not date_value:
            continue
        hours_value = day_entry.get("hours_worked_total", 0)
        try:
            hours = float(hours_value)
        except (TypeError, ValueError):
            continue
        day = parse_date(date_value)
        week_start = week_start_for(day)
        week = weekly.setdefault(
            week_start,
            {"total_hours": 0.0, "paid_lunch_minutes": 0, "days": []},
        )
        rate = resolve_rate(day, rates)
        eligible = hours * 60 >= min_lunch_minutes
        day_lunch = daily_lunch_minutes if eligible else 0
        remaining = max(0, weekly_lunch_cap - week["paid_lunch_minutes"])
        if day_lunch > remaining:
            day_lunch = remaining
        week["paid_lunch_minutes"] += day_lunch
        week["total_hours"] += hours
        week["days"].append(
            {
                "date": day.isoformat(),
                "hours": hours,
                "rate": rate,
                "paidLunchMinutes": day_lunch,
            }
        )

    week_starts = sorted(weekly.keys())
    meeting_allocations, meeting_notes = build_meeting_allocations(
        schedule, week_starts
    )

    weeks_output: list[dict] = []
    for idx, week_start in enumerate(week_starts):
        week = weekly[week_start]
        total_hours = week["total_hours"]
        overtime_hours = max(0.0, total_hours - threshold)
        regular_hours = total_hours - overtime_hours
        weeks_output.append(
            {
                "weekStart": week_start.isoformat(),
                "totalHours": round(total_hours, 2),
                "regularHours": round(regular_hours, 2),
                "overtimeHours": round(overtime_hours, 2),
                "overtimeMultiplier": multiplier,
                "paidLunchMinutes": week["paid_lunch_minutes"],
                "meetingMinutes": meeting_allocations[idx],
                "days": week["days"],
            }
        )

    report = {
        "schemaVersion": "1.0",
        "timezone": schedule.get("timezone") or hours_log.get("timezone"),
        "user": hours_log.get("user"),
        "weeks": weeks_output,
        "meetingNotes": meeting_notes,
    }

    output_text = json.dumps(report, ensure_ascii=True, indent=2) + "\n"
    if args.output:
        Path(args.output).write_text(output_text, encoding="utf-8")
    else:
        print(output_text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
