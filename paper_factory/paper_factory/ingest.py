"""Ingest PASS-reviewed papers into the Next.js app's Postgres DB.

Builds a fresh run-dir bundle (``candidates.json`` + ``evaluations.json`` + ``figures/``)
from the reviewed-and-passed papers, then shells out to the existing TS ingest script
(``scripts/ingest.ts``) which validates, dedups, and writes Postgres. No new DB-write code.
"""

from __future__ import annotations

import copy
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from . import config
from .db import Store
from .models import Paper, ReviewDecision, Stage, dumps
from .pdf import safe_id


def passed_papers(store: Store) -> list[Paper]:
    """Reviewed papers marked PASS that carry an evaluation and aren't yet ingested."""
    out = []
    for p in store.list_papers():
        if (
            p.review_decision is ReviewDecision.PASS
            and p.evaluation_json is not None
            and p.stage is not Stage.INGESTED
        ):
            out.append(p)
    return out


def build_bundle(papers: list[Paper], out_dir: Path) -> Path:
    figures_dir = out_dir / "figures"
    out_dir.mkdir(parents=True, exist_ok=True)
    figures_dir.mkdir(parents=True, exist_ok=True)

    candidates = []
    evaluations = []
    for p in papers:
        candidates.append(p.to_candidate_record())
        ev = copy.deepcopy(p.evaluation_json) or {}
        figure = ev.get("figure")
        if figure and p.figure_path and Path(p.figure_path).exists():
            sid = safe_id(p.id)
            rendered = f"figures/{sid}.png"
            shutil.copy2(p.figure_path, out_dir / rendered)
            figure["renderedPath"] = rendered
        evaluations.append(ev)

    (out_dir / "candidates.json").write_text(dumps(candidates), encoding="utf-8")
    (out_dir / "evaluations.json").write_text(dumps(evaluations), encoding="utf-8")
    return out_dir


def run_ingest_script(run_dir: Path) -> subprocess.CompletedProcess:
    """Invoke ``npm run ingest -- <run-dir>`` from the repo root."""
    return subprocess.run(
        ["npm", "run", "ingest", "--", str(run_dir)],
        cwd=config.REPO_ROOT,
        capture_output=True,
        text=True,
    )


def ingest_passed(store: Store) -> tuple[Path, subprocess.CompletedProcess, list[Paper]]:
    """Build a bundle from passed papers, run the TS ingest, and mark INGESTED on success."""
    papers = passed_papers(store)
    if not papers:
        raise ValueError("no PASS-reviewed papers ready to ingest")

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M%S")
    run_dir = config.EXPORT_DIR / f"ingest-{ts}"
    build_bundle(papers, run_dir)

    result = run_ingest_script(run_dir)
    if result.returncode == 0:
        from .db import now

        for p in papers:
            store.update_fields(p.id, stage=Stage.INGESTED, ingested_at=now(), failed_step=None)
    return run_dir, result, papers
