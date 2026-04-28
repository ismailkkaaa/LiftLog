from __future__ import annotations

import json
import logging
import os
import sqlite3
from contextlib import closing
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request, send_from_directory


BASE_DIR = Path(__file__).resolve().parent
DATABASE_DIR = BASE_DIR / "database"
DATABASE_PATH = DATABASE_DIR / "liftlog.db"
DEFAULT_USER_ID = 1

app = Flask(__name__)
app.logger.setLevel(logging.INFO)


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


WEEKDAY_INDEX = {
    "Monday": 0,
    "Tuesday": 1,
    "Wednesday": 2,
    "Thursday": 3,
    "Friday": 4,
    "Saturday": 5,
    "Sunday": 6,
}


def get_db_connection() -> sqlite3.Connection:
    DATABASE_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def json_success(**payload: Any) -> Any:
    return jsonify({"success": True, **payload})


def ensure_user_exists(conn: sqlite3.Connection, user_id: int = DEFAULT_USER_ID) -> None:
    exists = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
    if exists:
        return
    now = utc_now()
    conn.execute(
        """
        INSERT INTO users (id, name, age, height, weight, goal, created_at, updated_at)
        VALUES (?, ?, NULL, NULL, NULL, ?, ?, ?)
        """,
        (user_id, "LiftLog User", "Stay consistent", now, now),
    )


def init_db() -> None:
    expected_columns = {
        "users": {"id", "name", "age", "height", "weight", "goal", "created_at", "updated_at"},
        "plans": {"id", "user_id", "plan_name", "notes", "created_at", "updated_at"},
        "workout_days": {"id", "plan_id", "day_name", "category", "sort_order", "is_completed", "last_completed_date"},
        "exercises": {"id", "workout_day_id", "exercise_name", "rest_seconds", "sort_order"},
        "exercise_sets": {"id", "exercise_id", "target_reps", "completed_reps", "used_weight", "set_order", "completed"},
        "workout_sessions": {"id", "user_id", "workout_day_id", "started_at", "completed_at", "completed", "current_set_index", "status"},
        "progress_logs": {"id", "user_id", "exercise_name", "weight_used", "reps", "created_at"},
        "personal_records": {"id", "user_id", "exercise_name", "highest_weight", "highest_reps", "updated_at"},
        "session_sets": {"id", "session_id", "exercise_id", "exercise_name", "target_reps", "actual_reps", "weight_used", "set_order", "completed", "completed_at", "rest_seconds"},
        "body_weight_logs": {"id", "user_id", "weight", "created_at"},
    }
    legacy_tables = [
        "workout_session_sets",
        "user_profile",
        "workouts",
    ]
    schema = """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        age INTEGER,
        height REAL,
        weight REAL,
        goal TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_name TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workout_days (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        day_name TEXT NOT NULL,
        category TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_completed INTEGER NOT NULL DEFAULT 0,
        last_completed_date TEXT
    );

    CREATE TABLE IF NOT EXISTS exercises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workout_day_id INTEGER NOT NULL REFERENCES workout_days(id) ON DELETE CASCADE,
        exercise_name TEXT NOT NULL,
        rest_seconds INTEGER NOT NULL DEFAULT 90,
        sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS exercise_sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
        target_reps INTEGER NOT NULL,
        completed_reps INTEGER,
        used_weight REAL,
        set_order INTEGER NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workout_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        workout_day_id INTEGER NOT NULL REFERENCES workout_days(id) ON DELETE CASCADE,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        completed INTEGER NOT NULL DEFAULT 0,
        current_set_index INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS progress_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        exercise_name TEXT NOT NULL,
        weight_used REAL NOT NULL,
        reps INTEGER NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS personal_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        exercise_name TEXT NOT NULL,
        highest_weight REAL NOT NULL DEFAULT 0,
        highest_reps INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, exercise_name)
    );

    CREATE TABLE IF NOT EXISTS session_sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
        exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
        exercise_name TEXT NOT NULL,
        target_reps INTEGER NOT NULL,
        actual_reps INTEGER,
        weight_used REAL,
        set_order INTEGER NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT,
        rest_seconds INTEGER NOT NULL DEFAULT 90
    );

    CREATE TABLE IF NOT EXISTS body_weight_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        weight REAL NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workout_days_plan ON workout_days(plan_id);
    CREATE INDEX IF NOT EXISTS idx_exercises_day ON exercises(workout_day_id);
    CREATE INDEX IF NOT EXISTS idx_exercise_sets_exercise ON exercise_sets(exercise_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON workout_sessions(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_progress_user_exercise ON progress_logs(user_id, exercise_name, created_at);
    CREATE INDEX IF NOT EXISTS idx_body_weight_user_created ON body_weight_logs(user_id, created_at);
    """

    with closing(get_db_connection()) as conn:
        conn.execute("PRAGMA foreign_keys = OFF")
        for table_name, required_columns in expected_columns.items():
            existing = conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
                (table_name,),
            ).fetchone()
            if not existing:
                continue
            current_columns = {
                row["name"] for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()
            }
            if table_name == "workout_days" and required_columns.issuperset(current_columns):
                continue
            if current_columns != required_columns:
                conn.execute(f"DROP TABLE IF EXISTS {table_name}")
        for legacy_table in legacy_tables:
            conn.execute(f"DROP TABLE IF EXISTS {legacy_table}")
        conn.executescript(schema)
        migrate_schema(conn)
        conn.execute("PRAGMA foreign_keys = ON")
        conn.commit()


def migrate_schema(conn: sqlite3.Connection) -> None:
    workout_day_columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(workout_days)").fetchall()
    }
    if "is_completed" not in workout_day_columns:
        conn.execute("ALTER TABLE workout_days ADD COLUMN is_completed INTEGER NOT NULL DEFAULT 0")
    if "last_completed_date" not in workout_day_columns:
        conn.execute("ALTER TABLE workout_days ADD COLUMN last_completed_date TEXT")


def parse_iso_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def next_scheduled_date_after(day_name: str, completed_on: date) -> date:
    target_weekday = WEEKDAY_INDEX.get(day_name)
    if target_weekday is None:
        return completed_on + timedelta(days=7)
    offset = (target_weekday - completed_on.weekday()) % 7
    if offset == 0:
        offset = 7
    return completed_on + timedelta(days=offset)


def should_unlock_workout_day(day_name: str, is_completed: int, last_completed_date: str | None, today: date | None = None) -> bool:
    if not is_completed:
        return False
    completed_on = parse_iso_date(last_completed_date)
    if not completed_on:
        return True
    current_day = today or date.today()
    return current_day >= next_scheduled_date_after(day_name, completed_on)


def apply_weekly_completion_resets(conn: sqlite3.Connection, user_id: int = DEFAULT_USER_ID, today: date | None = None) -> None:
    current_day = today or date.today()
    rows = conn.execute(
        """
        SELECT wd.id, wd.day_name, wd.is_completed, wd.last_completed_date
        FROM workout_days wd
        JOIN plans p ON p.id = wd.plan_id
        WHERE p.user_id = ? AND wd.is_completed = 1
        """,
        (user_id,),
    ).fetchall()
    reset_ids = [
        row["id"]
        for row in rows
        if should_unlock_workout_day(row["day_name"], row["is_completed"], row["last_completed_date"], today=current_day)
    ]
    if not reset_ids:
        return
    conn.executemany(
        "UPDATE workout_days SET is_completed = 0 WHERE id = ?",
        [(workout_day_id,) for workout_day_id in reset_ids],
    )
    conn.commit()


def build_workout_day_state(row: sqlite3.Row | dict[str, Any], today: date | None = None) -> dict[str, Any]:
    day = dict(row)
    locked = not should_unlock_workout_day(
        day["day_name"],
        day.get("is_completed", 0),
        day.get("last_completed_date"),
        today=today,
    ) and bool(day.get("is_completed"))
    day["is_completed"] = bool(day.get("is_completed"))
    day["is_locked"] = locked
    day["completion_message"] = "Completed for this week" if locked else ""
    return day


def mark_workout_day_completed(conn: sqlite3.Connection, workout_day_id: int, completed_on: date) -> None:
    conn.execute(
        """
        UPDATE workout_days
        SET is_completed = 1, last_completed_date = ?
        WHERE id = ?
        """,
        (completed_on.isoformat(), workout_day_id),
    )


def clear_all_user_data(user_id: int = DEFAULT_USER_ID) -> None:
    with closing(get_db_connection()) as conn:
        ensure_user_exists(conn, user_id)
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        ensure_user_exists(conn, user_id)
        conn.commit()


def validate_profile(payload: dict[str, Any]) -> dict[str, Any]:
    name = (payload.get("name") or "").strip()
    if not name:
        raise ValueError("Name is required")
    age = payload.get("age")
    height = payload.get("height")
    weight = payload.get("weight")
    goal = (payload.get("goal") or "").strip() or None
    return {
        "name": name,
        "age": int(age) if age not in ("", None) else None,
        "height": float(height) if height not in ("", None) else None,
        "weight": float(weight) if weight not in ("", None) else None,
        "goal": goal,
    }


def get_profile(user_id: int = DEFAULT_USER_ID) -> dict[str, Any] | None:
    with closing(get_db_connection()) as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return row_to_dict(row)


def save_profile(payload: dict[str, Any], user_id: int = DEFAULT_USER_ID) -> dict[str, Any]:
    data = validate_profile(payload)
    now = utc_now()
    with closing(get_db_connection()) as conn:
        existing = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE users
                SET name = ?, age = ?, height = ?, weight = ?, goal = ?, updated_at = ?
                WHERE id = ?
                """,
                (data["name"], data["age"], data["height"], data["weight"], data["goal"], now, user_id),
            )
        else:
            conn.execute(
                """
                INSERT INTO users (id, name, age, height, weight, goal, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, data["name"], data["age"], data["height"], data["weight"], data["goal"], now, now),
            )

        if data["weight"] is not None:
            conn.execute(
                "INSERT INTO body_weight_logs (user_id, weight, created_at) VALUES (?, ?, ?)",
                (user_id, data["weight"], now),
            )
        conn.commit()
        profile = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    app.logger.info("profile saved user_id=%s name=%s", user_id, data["name"])
    return dict(profile)


def validate_workout_payload(payload: dict[str, Any]) -> dict[str, Any]:
    plan_name = (payload.get("name") or payload.get("plan_name") or "").strip()
    if not plan_name:
        raise ValueError("Plan name is required")

    days = payload.get("days") or []
    if not days:
        raise ValueError("At least one workout day is required")

    cleaned_days = []
    for day_index, day in enumerate(days):
        day_name = (day.get("day_name") or "").strip()
        category = (day.get("category") or "").strip()
        if not day_name or not category:
            continue

        exercises = []
        for exercise_index, exercise in enumerate(day.get("exercises") or []):
            exercise_name = (exercise.get("name") or exercise.get("exercise_name") or "").strip()
            if not exercise_name:
                continue
            rest_seconds = int(exercise.get("rest_seconds") or 90)
            sets = []
            for set_index, set_item in enumerate(exercise.get("sets") or []):
                reps = set_item.get("target_reps")
                if reps in ("", None):
                    continue
                reps_int = int(reps)
                if reps_int <= 0:
                    continue
                sets.append({"target_reps": reps_int, "set_order": set_index})
            if sets:
                exercises.append(
                    {
                        "exercise_name": exercise_name,
                        "rest_seconds": rest_seconds,
                        "sort_order": exercise_index,
                        "sets": sets,
                    }
                )
        if exercises:
            cleaned_days.append(
                {
                    "day_name": day_name,
                    "category": category,
                    "sort_order": day_index,
                    "exercises": exercises,
                }
            )

    if not cleaned_days:
        raise ValueError("Each workout day must include at least one exercise and set")

    return {
        "plan_name": plan_name,
        "notes": (payload.get("notes") or "").strip() or None,
        "days": cleaned_days,
    }


def save_workout_plan(payload: dict[str, Any], user_id: int = DEFAULT_USER_ID, plan_id: int | None = None) -> dict[str, Any]:
    data = validate_workout_payload(payload)
    now = utc_now()
    with closing(get_db_connection()) as conn:
        ensure_user_exists(conn, user_id)

        if plan_id is None:
            cursor = conn.execute(
                """
                INSERT INTO plans (user_id, plan_name, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, data["plan_name"], data["notes"], now, now),
            )
            plan_id = cursor.lastrowid
        else:
            existing = conn.execute("SELECT id FROM plans WHERE id = ? AND user_id = ?", (plan_id, user_id)).fetchone()
            if not existing:
                raise ValueError("Workout plan not found")
            conn.execute(
                "UPDATE plans SET plan_name = ?, notes = ?, updated_at = ? WHERE id = ?",
                (data["plan_name"], data["notes"], now, plan_id),
            )
            conn.execute("DELETE FROM workout_days WHERE plan_id = ?", (plan_id,))

        for day in data["days"]:
            day_cursor = conn.execute(
                """
                INSERT INTO workout_days (plan_id, day_name, category, sort_order)
                VALUES (?, ?, ?, ?)
                """,
                (plan_id, day["day_name"], day["category"], day["sort_order"]),
            )
            workout_day_id = day_cursor.lastrowid
            for exercise in day["exercises"]:
                exercise_cursor = conn.execute(
                    """
                    INSERT INTO exercises (workout_day_id, exercise_name, rest_seconds, sort_order)
                    VALUES (?, ?, ?, ?)
                    """,
                    (workout_day_id, exercise["exercise_name"], exercise["rest_seconds"], exercise["sort_order"]),
                )
                exercise_id = exercise_cursor.lastrowid
                for set_item in exercise["sets"]:
                    conn.execute(
                        """
                        INSERT INTO exercise_sets (
                            exercise_id, target_reps, completed_reps, used_weight, set_order, completed
                        ) VALUES (?, ?, NULL, NULL, ?, 0)
                        """,
                        (exercise_id, set_item["target_reps"], set_item["set_order"]),
                    )
        conn.commit()
        plan = load_workout_plan(plan_id=plan_id, user_id=user_id)

    app.logger.info("workout created user_id=%s plan_id=%s name=%s", user_id, plan_id, data["plan_name"])
    return plan


def load_workout_plan(plan_id: int | None = None, user_id: int = DEFAULT_USER_ID) -> dict[str, Any] | list[dict[str, Any]] | None:
    with closing(get_db_connection()) as conn:
        if plan_id is None:
            return list_workout_plans(conn, user_id=user_id)
        return get_workout_plan(conn, plan_id=plan_id, user_id=user_id)


def list_workout_plans(conn: sqlite3.Connection, user_id: int = DEFAULT_USER_ID) -> list[dict[str, Any]]:
    plans = conn.execute(
        "SELECT id FROM plans WHERE user_id = ? ORDER BY updated_at DESC, id DESC",
        (user_id,),
    ).fetchall()
    return [serialize_plan(conn, row["id"]) for row in plans]


def get_workout_plan(conn: sqlite3.Connection, plan_id: int, user_id: int = DEFAULT_USER_ID) -> dict[str, Any] | None:
    plan = conn.execute("SELECT id FROM plans WHERE id = ? AND user_id = ?", (plan_id, user_id)).fetchone()
    if not plan:
        return None
    return serialize_plan(conn, plan_id)


def delete_workout_plan(plan_id: int, user_id: int = DEFAULT_USER_ID) -> bool:
    with closing(get_db_connection()) as conn:
        cursor = conn.execute("DELETE FROM plans WHERE id = ? AND user_id = ?", (plan_id, user_id))
        conn.commit()
    return cursor.rowcount > 0


def serialize_plan(conn: sqlite3.Connection, plan_id: int) -> dict[str, Any]:
    plan = conn.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()
    day_rows = conn.execute(
        "SELECT * FROM workout_days WHERE plan_id = ? ORDER BY sort_order, id",
        (plan_id,),
    ).fetchall()
    days = []
    for day in day_rows:
        exercise_rows = conn.execute(
            "SELECT * FROM exercises WHERE workout_day_id = ? ORDER BY sort_order, id",
            (day["id"],),
        ).fetchall()
        exercises = []
        for exercise in exercise_rows:
            set_rows = conn.execute(
                "SELECT * FROM exercise_sets WHERE exercise_id = ? ORDER BY set_order, id",
                (exercise["id"],),
            ).fetchall()
            exercises.append(
                {
                    "id": exercise["id"],
                    "name": exercise["exercise_name"],
                    "exercise_name": exercise["exercise_name"],
                    "rest_seconds": exercise["rest_seconds"],
                    "sort_order": exercise["sort_order"],
                    "sets": [dict(row) for row in set_rows],
                }
            )
        days.append(
            {
                "id": day["id"],
                "day_name": day["day_name"],
                "category": day["category"],
                "sort_order": day["sort_order"],
                "exercises": exercises,
            }
        )

    return {
        "id": plan["id"],
        "name": plan["plan_name"],
        "plan_name": plan["plan_name"],
        "notes": plan["notes"],
        "created_at": plan["created_at"],
        "updated_at": plan["updated_at"],
        "days": days,
    }


def get_todays_workout_day(conn: sqlite3.Connection, user_id: int = DEFAULT_USER_ID) -> sqlite3.Row | None:
    apply_weekly_completion_resets(conn, user_id=user_id)
    today_name = date.today().strftime("%A")
    return conn.execute(
        """
        SELECT wd.*, p.plan_name
        FROM workout_days wd
        JOIN plans p ON p.id = wd.plan_id
        WHERE p.user_id = ? AND wd.day_name = ?
        ORDER BY p.updated_at DESC, wd.sort_order ASC
        LIMIT 1
        """,
        (user_id, today_name),
    ).fetchone()


def build_session_payload(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    session = conn.execute(
        """
        SELECT ws.*, wd.day_name, wd.category, p.plan_name AS workout_name
        FROM workout_sessions ws
        JOIN workout_days wd ON wd.id = ws.workout_day_id
        JOIN plans p ON p.id = wd.plan_id
        WHERE ws.id = ?
        """,
        (session_id,),
    ).fetchone()
    if not session:
        raise ValueError("Live workout session not found")

    sets = [dict(row) for row in conn.execute(
        "SELECT * FROM session_sets WHERE session_id = ? ORDER BY set_order, id",
        (session_id,),
    ).fetchall()]

    current_set = None
    for set_row in sets:
        if not set_row["completed"]:
            current_set = set_row
            break

    completed_sets = sum(1 for set_row in sets if set_row["completed"])
    progress = int((completed_sets / len(sets)) * 100) if sets else 0

    return {
        "success": True,
        "session": dict(session),
        "sets": sets,
        "current_set": current_set,
        "completed_sets": completed_sets,
        "remaining_sets": max(len(sets) - completed_sets, 0),
        "progress": progress,
    }


def create_or_resume_live_workout(
    workout_day_id: int | None = None,
    user_id: int = DEFAULT_USER_ID,
    session_id: int | None = None,
) -> dict[str, Any]:
    with closing(get_db_connection()) as conn:
        ensure_user_exists(conn, user_id)
        apply_weekly_completion_resets(conn, user_id=user_id)
        if session_id is not None:
            existing = conn.execute(
                "SELECT id FROM workout_sessions WHERE id = ? AND user_id = ?",
                (session_id, user_id),
            ).fetchone()
            if not existing:
                raise ValueError("Live workout session not found")
            return build_session_payload(conn, session_id)

        active = conn.execute(
            """
            SELECT id FROM workout_sessions
            WHERE user_id = ? AND status = 'active'
            ORDER BY started_at DESC
            LIMIT 1
            """,
            (user_id,),
        ).fetchone()
        if active and workout_day_id is None:
            return build_session_payload(conn, active["id"])

        if workout_day_id is None:
            today = get_todays_workout_day(conn, user_id=user_id)
            if not today:
                raise ValueError("No workout found for today")
            workout_day_id = today["id"]

        active_for_day = conn.execute(
            """
            SELECT id FROM workout_sessions
            WHERE user_id = ? AND workout_day_id = ? AND status = 'active'
            ORDER BY started_at DESC
            LIMIT 1
            """,
            (user_id, workout_day_id),
        ).fetchone()
        if active_for_day:
            return build_session_payload(conn, active_for_day["id"])

        workout_day = conn.execute(
            """
            SELECT wd.*, p.plan_name
            FROM workout_days wd
            JOIN plans p ON p.id = wd.plan_id
            WHERE wd.id = ? AND p.user_id = ?
            """,
            (workout_day_id, user_id),
        ).fetchone()
        if not workout_day:
            raise ValueError("Workout day not found")
        if build_workout_day_state(workout_day)["is_locked"]:
            raise ValueError("Workout already completed for this week")

        exercise_rows = conn.execute(
            "SELECT * FROM exercises WHERE workout_day_id = ? ORDER BY sort_order, id",
            (workout_day_id,),
        ).fetchall()
        if not exercise_rows:
            raise ValueError("Workout day has no exercises")

        now = utc_now()
        cursor = conn.execute(
            """
            INSERT INTO workout_sessions (user_id, workout_day_id, started_at, completed_at, completed, current_set_index, status)
            VALUES (?, ?, ?, NULL, 0, 0, 'active')
            """,
            (user_id, workout_day_id, now),
        )
        new_session_id = cursor.lastrowid

        set_order = 0
        for exercise in exercise_rows:
            set_rows = conn.execute(
                "SELECT * FROM exercise_sets WHERE exercise_id = ? ORDER BY set_order, id",
                (exercise["id"],),
            ).fetchall()
            for set_row in set_rows:
                conn.execute(
                    """
                    INSERT INTO session_sets (
                        session_id, exercise_id, exercise_name, target_reps, actual_reps, weight_used,
                        set_order, completed, completed_at, rest_seconds
                    ) VALUES (?, ?, ?, ?, NULL, NULL, ?, 0, NULL, ?)
                    """,
                    (
                        new_session_id,
                        exercise["id"],
                        exercise["exercise_name"],
                        set_row["target_reps"],
                        set_order,
                        exercise["rest_seconds"],
                    ),
                )
                set_order += 1

        conn.commit()
        app.logger.info("live workout created user_id=%s workout_day_id=%s session_id=%s", user_id, workout_day_id, new_session_id)
        return build_session_payload(conn, new_session_id)


def save_live_set(payload: dict[str, Any], user_id: int = DEFAULT_USER_ID) -> dict[str, Any]:
    session_id = payload.get("session_id")
    if session_id in ("", None):
        raise ValueError("session_id is required")
    weight_used_raw = payload.get("weight_used")
    actual_reps_raw = payload.get("actual_reps")
    if weight_used_raw in ("", None):
        raise ValueError("weight_used is required")
    if actual_reps_raw in ("", None):
        raise ValueError("actual_reps is required")

    weight_used = float(weight_used_raw)
    actual_reps = int(actual_reps_raw)
    now = utc_now()

    with closing(get_db_connection()) as conn:
        ensure_user_exists(conn, user_id)
        apply_weekly_completion_resets(conn, user_id=user_id)
        session = conn.execute(
            "SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?",
            (session_id, user_id),
        ).fetchone()
        if not session:
            raise ValueError("Live workout session not found")
        workout_day = conn.execute(
            "SELECT id, day_name, is_completed, last_completed_date FROM workout_days WHERE id = ?",
            (session["workout_day_id"],),
        ).fetchone()
        if workout_day and build_workout_day_state(workout_day)["is_locked"]:
            raise ValueError("Workout already completed for this week")

        current_set = conn.execute(
            """
            SELECT * FROM session_sets
            WHERE session_id = ? AND completed = 0
            ORDER BY set_order, id
            LIMIT 1
            """,
            (session_id,),
        ).fetchone()
        if not current_set:
            raise ValueError("No remaining sets in this workout")

        conn.execute(
            """
            UPDATE session_sets
            SET actual_reps = ?, weight_used = ?, completed = 1, completed_at = ?
            WHERE id = ?
            """,
            (actual_reps, weight_used, now, current_set["id"]),
        )

        conn.execute(
            """
            INSERT INTO progress_logs (user_id, exercise_name, weight_used, reps, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, current_set["exercise_name"], weight_used, actual_reps, now),
        )

        update_personal_record(conn, user_id, current_set["exercise_name"], weight_used, actual_reps, now)

        remaining = conn.execute(
            "SELECT COUNT(*) AS count FROM session_sets WHERE session_id = ? AND completed = 0",
            (session_id,),
        ).fetchone()["count"]
        completed_sets = conn.execute(
            "SELECT COUNT(*) AS count FROM session_sets WHERE session_id = ? AND completed = 1",
            (session_id,),
        ).fetchone()["count"]

        completed = 1 if remaining == 0 else 0
        status = "completed" if completed else "active"
        conn.execute(
            """
            UPDATE workout_sessions
            SET completed = ?, completed_at = ?, current_set_index = ?, status = ?
            WHERE id = ?
            """,
            (
                completed,
                now if completed else None,
                completed_sets,
                status,
                session_id,
            ),
        )
        if completed:
            mark_workout_day_completed(conn, session["workout_day_id"], date.today())
        conn.commit()

        result = build_session_payload(conn, int(session_id))
        pr_row = conn.execute(
            "SELECT highest_weight, highest_reps FROM personal_records WHERE user_id = ? AND exercise_name = ?",
            (user_id, current_set["exercise_name"]),
        ).fetchone()

    app.logger.info(
        "set completed session_id=%s exercise=%s weight=%s reps=%s",
        session_id,
        current_set["exercise_name"],
        weight_used,
        actual_reps,
    )
    result["latest_result"] = {
        "exercise_name": current_set["exercise_name"],
        "set_number": current_set["set_order"] + 1,
        "weight_used": weight_used,
        "actual_reps": actual_reps,
        "is_pr_weight": bool(pr_row and weight_used >= pr_row["highest_weight"]),
        "is_pr_reps": bool(pr_row and actual_reps >= pr_row["highest_reps"]),
    }
    return result


def update_personal_record(
    conn: sqlite3.Connection,
    user_id: int,
    exercise_name: str,
    weight_used: float,
    reps: int,
    now: str,
) -> None:
    existing = conn.execute(
        "SELECT * FROM personal_records WHERE user_id = ? AND exercise_name = ?",
        (user_id, exercise_name),
    ).fetchone()
    if existing:
        highest_weight = max(existing["highest_weight"], weight_used)
        highest_reps = max(existing["highest_reps"], reps)
        conn.execute(
            """
            UPDATE personal_records
            SET highest_weight = ?, highest_reps = ?, updated_at = ?
            WHERE id = ?
            """,
            (highest_weight, highest_reps, now, existing["id"]),
        )
    else:
        highest_weight = weight_used
        highest_reps = reps
        conn.execute(
            """
            INSERT INTO personal_records (user_id, exercise_name, highest_weight, highest_reps, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, exercise_name, highest_weight, highest_reps, now),
        )
    app.logger.info("PR updated user_id=%s exercise=%s weight=%s reps=%s", user_id, exercise_name, highest_weight, highest_reps)


def fetch_progress_data(user_id: int = DEFAULT_USER_ID) -> dict[str, Any]:
    with closing(get_db_connection()) as conn:
        strength_rows = conn.execute(
            """
            SELECT DATE(created_at) AS logged_on, MAX(weight_used) AS max_weight
            FROM progress_logs
            WHERE user_id = ?
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC
            LIMIT 30
            """,
            (user_id,),
        ).fetchall()
        body_weight_rows = conn.execute(
            """
            SELECT DATE(created_at) AS logged_on, weight
            FROM body_weight_logs
            WHERE user_id = ?
            ORDER BY created_at ASC
            LIMIT 30
            """,
            (user_id,),
        ).fetchall()
        weekly_rows = conn.execute(
            """
            SELECT STRFTIME('%W', started_at) AS week_number, COUNT(*) AS sessions
            FROM workout_sessions
            WHERE user_id = ? AND completed = 1
            GROUP BY STRFTIME('%Y-%W', started_at)
            ORDER BY STRFTIME('%Y-%W', started_at) ASC
            LIMIT 12
            """,
            (user_id,),
        ).fetchall()
        exercise_rows = conn.execute(
            """
            SELECT exercise_name, DATE(created_at) AS logged_on, MAX(weight_used) AS max_weight
            FROM progress_logs
            WHERE user_id = ?
            GROUP BY exercise_name, DATE(created_at)
            ORDER BY created_at DESC
            LIMIT 50
            """,
            (user_id,),
        ).fetchall()

    exercise_history: dict[str, list[dict[str, Any]]] = {}
    for row in exercise_rows:
        exercise_history.setdefault(row["exercise_name"], []).append(dict(row))

    return {
        "strength_progress": [dict(row) for row in strength_rows],
        "body_weight": [dict(row) for row in body_weight_rows],
        "weekly_consistency": [dict(row) for row in weekly_rows],
        "exercise_history": exercise_history,
    }


def get_dashboard_data(user_id: int = DEFAULT_USER_ID) -> dict[str, Any]:
    today_name = date.today().strftime("%A")
    week_start = date.today() - timedelta(days=date.today().weekday())
    week_end = week_start + timedelta(days=6)

    with closing(get_db_connection()) as conn:
        ensure_user_exists(conn, user_id)
        apply_weekly_completion_resets(conn, user_id=user_id)
        profile = row_to_dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())
        todays_workout = conn.execute(
            """
            SELECT wd.id, wd.day_name, wd.category, wd.is_completed, wd.last_completed_date, p.plan_name AS workout_name
            FROM workout_days wd
            JOIN plans p ON p.id = wd.plan_id
            WHERE p.user_id = ? AND wd.day_name = ?
            ORDER BY p.updated_at DESC, wd.sort_order ASC
            LIMIT 1
            """,
            (user_id, today_name),
        ).fetchone()
        day_cards = conn.execute(
            """
            SELECT wd.id, wd.day_name, wd.category, wd.is_completed, wd.last_completed_date, p.plan_name AS workout_name
            FROM workout_days wd
            JOIN plans p ON p.id = wd.plan_id
            WHERE p.user_id = ?
            ORDER BY CASE wd.day_name
                WHEN 'Monday' THEN 1
                WHEN 'Tuesday' THEN 2
                WHEN 'Wednesday' THEN 3
                WHEN 'Thursday' THEN 4
                WHEN 'Friday' THEN 5
                WHEN 'Saturday' THEN 6
                WHEN 'Sunday' THEN 7
            END, wd.sort_order
            """,
            (user_id,),
        ).fetchall()
        completion_stats = conn.execute(
            """
            SELECT COUNT(*) AS total_sessions,
                   SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completed_sessions
            FROM workout_sessions
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()
        weekly_rows = conn.execute(
            """
            SELECT DATE(started_at) AS session_day, COUNT(*) AS completed
            FROM workout_sessions
            WHERE user_id = ? AND completed = 1 AND DATE(started_at) BETWEEN ? AND ?
            GROUP BY DATE(started_at)
            ORDER BY DATE(started_at)
            """,
            (user_id, week_start.isoformat(), week_end.isoformat()),
        ).fetchall()
        active_session = conn.execute(
            """
            SELECT id FROM workout_sessions
            WHERE user_id = ? AND status = 'active'
            ORDER BY started_at DESC
            LIMIT 1
            """,
            (user_id,),
        ).fetchone()

    return {
        "success": True,
        "profile": profile,
        "today_name": today_name,
        "todays_workout": build_workout_day_state(todays_workout) if todays_workout else None,
        "day_cards": [build_workout_day_state(row) for row in day_cards],
        "weekly_progress": {
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "completed_this_week": sum(row["completed"] for row in weekly_rows),
            "target": 5,
            "days": [dict(row) for row in weekly_rows],
        },
        "completion_stats": {
            "total_sessions": completion_stats["total_sessions"] or 0,
            "completed_sessions": completion_stats["completed_sessions"] or 0,
        },
        "resume_session_id": active_session["id"] if active_session else None,
    }


def get_history_data(user_id: int = DEFAULT_USER_ID) -> dict[str, Any]:
    with closing(get_db_connection()) as conn:
        ensure_user_exists(conn, user_id)
        apply_weekly_completion_resets(conn, user_id=user_id)
        sessions = conn.execute(
            """
            SELECT ws.id, ws.started_at, ws.completed_at, wd.day_name, wd.category, p.plan_name AS workout_name
            FROM workout_sessions ws
            JOIN workout_days wd ON wd.id = ws.workout_day_id
            JOIN plans p ON p.id = wd.plan_id
            WHERE ws.user_id = ? AND ws.completed = 1
            ORDER BY ws.started_at DESC
            LIMIT 20
            """,
            (user_id,),
        ).fetchall()

        session_payload = []
        for session in sessions:
            set_rows = conn.execute(
                """
                SELECT exercise_name, target_reps, actual_reps, weight_used, set_order
                FROM session_sets
                WHERE session_id = ?
                ORDER BY set_order, id
                """,
                (session["id"],),
            ).fetchall()
            session_payload.append(
                {
                    **dict(session),
                    "sets": [
                        {
                            **dict(row),
                            "set_number": row["set_order"] + 1,
                        }
                        for row in set_rows
                    ],
                }
            )

        prs = conn.execute(
            """
            SELECT exercise_name, highest_weight, highest_reps AS most_reps
            FROM personal_records
            WHERE user_id = ?
            ORDER BY highest_weight DESC, highest_reps DESC
            """,
            (user_id,),
        ).fetchall()

    return {
        "success": True,
        "sessions": session_payload,
        "prs": [dict(row) for row in prs],
    }


@app.context_processor
def inject_app_shell() -> dict[str, Any]:
    return {"current_year": date.today().year}


@app.after_request
def add_cache_headers(response: Any) -> Any:
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


@app.get("/")
def home() -> str:
    return render_template("login.html", page_title="LiftLog | Welcome", active_page="login")


@app.get("/dashboard")
def dashboard_page() -> str:
    return render_template("dashboard.html", page_title="LiftLog | Dashboard", active_page="dashboard")


@app.get("/workout-creator")
def workout_creator_page() -> str:
    return render_template("workout_creator.html", page_title="LiftLog | Workout Creator", active_page="workout_creator")


@app.get("/live-workout")
def live_workout_page() -> str:
    return render_template("live_workout.html", page_title="LiftLog | Live Workout", active_page="live_workout")


@app.get("/progress")
def progress_page() -> str:
    return render_template("progress.html", page_title="LiftLog | Progress", active_page="progress")


@app.get("/profile")
def profile_page() -> str:
    return render_template("profile.html", page_title="LiftLog | Profile", active_page="profile")


@app.get("/sw.js")
def service_worker() -> Any:
    return app.send_static_file("sw.js")


@app.route("/favicon.ico")
def favicon() -> Any:
    return send_from_directory(os.path.join(app.root_path, "static"), "favicon.ico", mimetype="image/vnd.microsoft.icon")


@app.get("/.well-known/appspecific/com.chrome.devtools.json")
def chrome_devtools_probe() -> tuple[str, int]:
    return ("", 204)


@app.get("/api/profile")
def api_profile() -> Any:
    return json_success(profile=get_profile())


@app.post("/api/profile")
def api_save_profile() -> Any:
    profile = save_profile(request.get_json(force=True) or {})
    return json_success(profile=profile)


@app.get("/api/dashboard")
def api_dashboard() -> Any:
    return jsonify(get_dashboard_data())


@app.get("/api/workouts")
def api_workouts() -> Any:
    return json_success(workouts=load_workout_plan())


@app.post("/api/workouts")
def api_create_workout() -> Any:
    workout = save_workout_plan(request.get_json(force=True) or {})
    return json_success(workout=workout)


@app.put("/api/workouts/<int:workout_id>")
def api_update_workout(workout_id: int) -> Any:
    workout = save_workout_plan(request.get_json(force=True) or {}, plan_id=workout_id)
    return json_success(workout=workout)


@app.delete("/api/workouts/<int:workout_id>")
def api_delete_workout(workout_id: int) -> Any:
    if not delete_workout_plan(workout_id, user_id=DEFAULT_USER_ID):
        raise ValueError("Workout plan not found")
    return json_success()


@app.get("/api/workouts/<int:workout_id>")
def api_get_workout(workout_id: int) -> Any:
    workout = load_workout_plan(plan_id=workout_id)
    if not workout:
        raise ValueError("Workout plan not found")
    return json_success(workout=workout)


@app.get("/api/live-workout")
def api_live_workout() -> Any:
    workout_day_id = request.args.get("workout_day_id", type=int)
    session_id = request.args.get("session_id", type=int)
    try:
        return jsonify(create_or_resume_live_workout(workout_day_id=workout_day_id, session_id=session_id))
    except ValueError as error:
        if workout_day_id is None and session_id is None and "No workout found for today" in str(error):
            return json_success(session=None, current_set=None, sets=[], completed_sets=0, remaining_sets=0, progress=0)
        raise


@app.post("/api/live-workout")
def api_start_live_workout() -> Any:
    payload = request.get_json(silent=True) or {}
    workout_day_id = payload.get("workout_day_id")
    return jsonify(create_or_resume_live_workout(workout_day_id=int(workout_day_id) if workout_day_id else None))


@app.post("/api/live-set")
def api_save_live_set() -> Any:
    return jsonify(save_live_set(request.get_json(force=True) or {}))


@app.get("/api/progress")
def api_progress() -> Any:
    return json_success(**fetch_progress_data())


@app.get("/api/history")
def api_history() -> Any:
    return jsonify(get_history_data())


@app.post("/api/reset-data")
def api_reset_data() -> Any:
    clear_all_user_data()
    return json_success(profile=get_profile(), message="All profile and training data cleared")


@app.post("/api/body-weight")
def api_body_weight() -> Any:
    payload = request.get_json(force=True) or {}
    weight = payload.get("weight")
    if weight in ("", None):
        raise ValueError("weight is required")
    with closing(get_db_connection()) as conn:
        ensure_user_exists(conn, DEFAULT_USER_ID)
        now = utc_now()
        conn.execute(
            "INSERT INTO body_weight_logs (user_id, weight, created_at) VALUES (?, ?, ?)",
            (DEFAULT_USER_ID, float(weight), now),
        )
        conn.execute(
            "UPDATE users SET weight = ?, updated_at = ? WHERE id = ?",
            (float(weight), now, DEFAULT_USER_ID),
        )
        conn.commit()
    return json_success()


@app.post("/api/live/start/<int:workout_day_id>")
def api_legacy_start_live_workout(workout_day_id: int) -> Any:
    return jsonify(create_or_resume_live_workout(workout_day_id=workout_day_id))


@app.get("/api/live/session/current")
def api_legacy_current_session() -> Any:
    try:
        return jsonify(create_or_resume_live_workout())
    except ValueError:
        return json_success(session=None, current_set=None)


@app.get("/api/live/session/<int:session_id>")
def api_legacy_get_session(session_id: int) -> Any:
    return jsonify(create_or_resume_live_workout(session_id=session_id))


@app.post("/api/live/session/<int:session_id>/set")
def api_legacy_complete_set(session_id: int) -> Any:
    payload = request.get_json(force=True) or {}
    payload["session_id"] = session_id
    return jsonify(save_live_set(payload))


@app.errorhandler(ValueError)
def handle_value_error(error: ValueError) -> tuple[Any, int]:
    return jsonify({"success": False, "error": str(error)}), 400


@app.errorhandler(Exception)
def handle_unexpected_error(error: Exception) -> tuple[Any, int]:
    app.logger.exception("Unhandled error: %s", error)
    return jsonify({"success": False, "error": "Internal server error"}), 500


@app.template_filter("json")
def to_json_filter(value: Any) -> str:
    return json.dumps(value)


init_db()


if __name__ == "__main__":
    app.run(debug=True)
