"""Read/maintain the live Postgres papers by shelling out to ``scripts/factory-db.ts``.

The factory never talks to Postgres directly — it calls the TS CLI (via
``npm run --silent factory:db -- <cmd>``) which goes through Prisma, exactly like
``ingest.py`` shells out to ``npm run ingest``. JSON in, JSON out.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Optional

from . import config


class DbLiveError(RuntimeError):
    """Raised when the factory:db CLI exits non-zero."""


def _run(args: list[str]) -> Any:
    proc = subprocess.run(
        ["npm", "run", "--silent", "factory:db", "--", *args],
        cwd=config.REPO_ROOT,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        msg = proc.stderr.strip() or proc.stdout.strip() or "factory:db failed"
        raise DbLiveError(msg)
    out = proc.stdout.strip()
    if not out:
        raise DbLiveError("factory:db returned no output")
    return json.loads(out)


def list_papers(
    q: str = "",
    venue: str = "",
    year: str = "",
    sort: str = "newest",
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    args = ["list", "--sort", sort, "--page", str(page), "--pageSize", str(page_size)]
    if q.strip():
        args += ["--q", q.strip()]
    if venue.strip():
        args += ["--venue", venue.strip()]
    if year.strip():
        args += ["--year", year.strip()]
    return _run(args)


def get_paper(paper_id: str) -> dict[str, Any]:
    return _run(["get", paper_id])


def update_paper(paper_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    with tempfile.NamedTemporaryFile(
        "w", suffix=".json", delete=False, encoding="utf-8"
    ) as fh:
        json.dump(patch, fh, ensure_ascii=False)
        patch_path = fh.name
    try:
        return _run(["update", paper_id, patch_path])
    finally:
        try:
            Path(patch_path).unlink(missing_ok=True)
        except OSError:
            pass


def delete_paper(paper_id: str) -> dict[str, Any]:
    return _run(["delete", paper_id])
