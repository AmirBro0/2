import asyncio
import json
import logging
from pathlib import Path
import sys
import time

from app.config import Settings
from app.store import JobStore


logger = logging.getLogger(__name__)


class JobRunner:
    def __init__(self, settings: Settings, store: JobStore):
        self.settings = settings
        self.store = store
        self._wake = asyncio.Event()
        self._stopping = False

    def wake(self) -> None:
        self._wake.set()

    def stop(self) -> None:
        self._stopping = True
        self.wake()

    async def run(self) -> None:
        last_cleanup = 0.0
        while not self._stopping:
            if time.monotonic() - last_cleanup > 60:
                self._cleanup()
                last_cleanup = time.monotonic()

            job = self.store.claim_next()
            if job:
                await self._process(job)
                continue

            self._wake.clear()
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=1)
            except TimeoutError:
                pass

    async def _process(self, job: dict) -> None:
        job_id = job["job_id"]
        input_path = Path(job["input_path"])
        output_path = self.settings.results_dir / f"{job_id}.json"
        progress_path = self.settings.results_dir / f"{job_id}.progress.json"
        if not input_path.is_file():
            self.store.fail(job_id, "Uploaded video is no longer available.")
            return

        process = None
        try:
            remaining = min(self.settings.job_timeout_sec, 295 - (time.time() - job["created_at"]))
            if remaining < 1:
                self.store.fail(job_id, "Analysis exceeded the time limit in the queue.")
                return
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                "-m",
                "app.run_analysis",
                "--input",
                str(input_path),
                "--output",
                str(output_path),
                "--analyzer",
                self.settings.analyzer_entrypoint,
                "--progress", str(progress_path),
                "--budget", str(max(1, remaining - 3)),
                cwd=str(Path(__file__).resolve().parent.parent),
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                _, stderr = await asyncio.wait_for(
                    process.communicate(), timeout=remaining
                )
            except TimeoutError:
                process.kill()
                await process.communicate()
                self.store.fail(job_id, "Analysis exceeded the time limit.")
                return

            if process.returncode != 0:
                logger.error("Analysis job %s failed: %s", job_id, stderr.decode(errors="replace")[-4000:])
                if self.settings.analyzer_entrypoint == "app.analyzers.unconfigured:analyze_video":
                    message = "The local analysis model has not been connected yet."
                else:
                    message = "Analysis failed. Check server logs."
                self.store.fail(job_id, message)
                return

            result = json.loads(output_path.read_text(encoding="utf-8"))
            self.store.complete(job_id, result)
        except Exception:
            logger.exception("Unexpected error in analysis job %s", job_id)
            self.store.fail(job_id, "Analysis failed. Check server logs.")
        finally:
            input_path.unlink(missing_ok=True)
            output_path.unlink(missing_ok=True)
            for path in (progress_path, progress_path.with_suffix(".tmp")):
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    logger.debug("Progress file is still being read: %s", path.name)

    def _cleanup(self) -> None:
        cutoff = time.time() - self.settings.result_ttl_sec
        for job in self.store.expired(cutoff):
            Path(job["input_path"]).unlink(missing_ok=True)
            for suffix in (".progress.json", ".progress.tmp"):
                try:
                    (self.settings.results_dir / f"{job['job_id']}{suffix}").unlink(missing_ok=True)
                except OSError:
                    pass
            self.store.delete(job["job_id"])
