"""Export a batch as a run-dir bundle for the out-of-GUI evaluation agent.

Produces ``data/factory/exports/<batch>/`` with:
- ``candidates.json``  — the batch's ``CandidateRecord[]`` (validates against candidate.ts)
- ``<id>-main.pdf``    — the batch PDFs (downloads land here directly; the GUI
                         truncates them in place)
- ``figures/<id>.png`` — the GUI-cropped figures (figure caption filled by the eval agent)
- ``crop-hints.json``  — per-paper {figure_label, figure_page, truncated_pdf} so the
                         trimmed eval skill knows what was pre-cropped.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from . import config
from .db import Store
from .models import Paper, Stage, dumps
from .pdf import safe_id


def export_batch(store: Store, batch_id: int) -> Path:
    papers = store.list_papers(batch_id=batch_id)
    if not papers:
        raise ValueError(f"batch {batch_id} has no papers")

    out_dir = config.EXPORT_DIR / f"batch-{batch_id}"
    figures_dir = out_dir / "figures"
    out_dir.mkdir(parents=True, exist_ok=True)
    figures_dir.mkdir(parents=True, exist_ok=True)

    candidates = [p.to_candidate_record() for p in papers]
    (out_dir / "candidates.json").write_text(dumps(candidates), encoding="utf-8")

    hints = []
    for p in papers:
        sid = safe_id(p.id)
        # PDFs downloaded after the batch-folder change already live at
        # out_dir/<sid>-main.pdf (truncation rewrites them in place); only
        # legacy files from pdfs/ or truncated/ still need copying in.
        pdf_src = p.truncated_pdf_path or p.pdf_path
        if pdf_src and Path(pdf_src).exists():
            pdf_dest = out_dir / f"{sid}-main.pdf"
            if Path(pdf_src).resolve() != pdf_dest.resolve():
                shutil.copy2(pdf_src, pdf_dest)
        if p.figure_path and Path(p.figure_path).exists():
            shutil.copy2(p.figure_path, figures_dir / f"{sid}.png")
        hints.append(
            {
                "id": p.id,
                "joinKey": {"source": p.source, "sourcePaperId": p.source_paper_id},
                "safeId": sid,
                "truncatedPdf": f"{sid}-main.pdf" if p.truncated_pdf_path else None,
                "figure": (
                    {
                        "label": p.figure_label,
                        "pageNumber": p.figure_page,
                        "renderedPath": f"figures/{sid}.png",
                    }
                    if p.figure_path
                    else None
                ),
            }
        )
    (out_dir / "crop-hints.json").write_text(dumps(hints), encoding="utf-8")

    # Mark the batch's papers as exported (only advance, never regress).
    for p in papers:
        if p.stage.order < Stage.EXPORTED.order:
            store.update_fields(p.id, stage=Stage.EXPORTED, failed_step=None)

    return out_dir
