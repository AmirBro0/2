from pathlib import Path
import json
import sqlite3
import time


class JobStore:
    def __init__(self, database_path: Path):
        self.database_path = database_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.database_path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=10000")
        return conn

    def initialize(self) -> None:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    input_path TEXT NOT NULL,
                    result_json TEXT,
                    error TEXT,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS jobs_status_created ON jobs(status, created_at)"
            )

    def enqueue(self, job_id: str, input_path: Path) -> None:
        now = time.time()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO jobs(job_id, status, input_path, created_at, updated_at) "
                "VALUES (?, 'queued', ?, ?, ?)",
                (job_id, str(input_path), now, now),
            )

    def get(self, job_id: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        return dict(row) if row else None

    def requeue_interrupted(self) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE jobs SET status = 'queued', updated_at = ? WHERE status = 'processing'",
                (time.time(),),
            )

    def claim_next(self) -> dict | None:
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT job_id, input_path FROM jobs WHERE status = 'queued' "
                "ORDER BY created_at LIMIT 1"
            ).fetchone()
            if row:
                conn.execute(
                    "UPDATE jobs SET status = 'processing', updated_at = ? WHERE job_id = ?",
                    (time.time(), row["job_id"]),
                )
        return dict(row) if row else None

    def complete(self, job_id: str, result: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE jobs SET status = 'done', result_json = ?, error = NULL, "
                "updated_at = ? WHERE job_id = ?",
                (json.dumps(result, ensure_ascii=False), time.time(), job_id),
            )

    def fail(self, job_id: str, error: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE jobs SET status = 'failed', error = ?, updated_at = ? "
                "WHERE job_id = ?",
                (error, time.time(), job_id),
            )

    def expired(self, cutoff: float) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT job_id, input_path FROM jobs "
                "WHERE updated_at < ? AND status IN ('done', 'failed')",
                (cutoff,),
            ).fetchall()
        return [dict(row) for row in rows]

    def delete(self, job_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM jobs WHERE job_id = ?", (job_id,))
