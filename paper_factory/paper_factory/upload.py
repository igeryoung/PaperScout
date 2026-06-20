"""Import a folder of locally-collected PDFs + their resolved metadata into the store.

The ``collect-pdf-metadata`` skill writes ``<folder>/candidates.json`` — a ``CandidateRecord[]``
where each record additionally carries ``pdfFile`` (the PDF's filename in the folder) and,
when the online match was low-confidence, ``needsReview: true``.

Unlike the inbox importer (crawled papers: PDF-less, ``PENDING``, unassigned), every record
here already has a local PDF. So we create a fresh batch named after the folder, copy each
PDF straight into the batch folder as ``<sid>-main.pdf`` (where truncate/crop/export expect
it), and start the paper at ``DOWNLOADED``.

Dedup, per id (``<source>:<sourcePaperId>`` or ``<source>:url:<sourceUrl>``):
  * id absent           -> insert a new paper in the batch,
  * id exists, no PDF   -> attach the uploaded PDF and pull it into the batch,
  * id exists, has PDF  -> skip (already have it) and report.
"""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import config
from .db import Store
from .models import Batch, Paper, Stage, make_paper_id
from .pdf import safe_id


@dataclass
class UploadResult:
    batch: Batch
    created: int = 0
    attached: int = 0
    skipped_has_pdf: list[str] = field(default_factory=list)
    missing_pdf: list[str] = field(default_factory=list)
    needs_review: list[str] = field(default_factory=list)

    def summary(self) -> str:
        lines = [
            f"Batch “{self.batch.name}” (#{self.batch.id}):",
            f"  {self.created} created, {self.attached} attached to existing papers.",
        ]
        if self.skipped_has_pdf:
            lines.append(f"  {len(self.skipped_has_pdf)} skipped (already had a PDF).")
        if self.missing_pdf:
            lines.append(f"  {len(self.missing_pdf)} skipped (pdfFile not found in folder).")
        if self.needs_review:
            lines.append(
                f"  ⚠ {len(self.needs_review)} flagged needsReview — verify their metadata."
            )
        return "\n".join(lines)


def _record_to_paper(rec: dict[str, Any], batch_id: int) -> Paper:
    source = rec["source"]
    spid = rec.get("sourcePaperId")
    source_url = rec["sourceUrl"]
    return Paper(
        id=make_paper_id(source, spid, source_url),
        title=rec["title"],
        authors=list(rec.get("authors") or []),
        abstract=rec.get("abstract"),
        venue=rec.get("venue"),
        published_date=rec["publishedDate"],
        source_url=source_url,
        pdf_url=rec.get("pdfUrl"),
        source_paper_id=spid,
        source=source,
        code_urls=list(rec.get("codeUrls") or []),
        additional_sources=list(rec.get("additionalSources") or []),
        stage=Stage.DOWNLOADED,
        batch_id=batch_id,
    )


def import_folder(store: Store, folder: Path, batch_name: str) -> UploadResult:
    """Import ``<folder>/candidates.json`` into a new batch. Raises ValueError on a bad folder."""
    folder = Path(folder)
    manifest = folder / "candidates.json"
    if not manifest.exists():
        raise ValueError(
            f"{folder} has no candidates.json — run the collect-pdf-metadata skill on it first."
        )
    records = json.loads(manifest.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise ValueError("candidates.json is not a JSON array of CandidateRecord")

    batch = store.create_batch(batch_name)
    result = UploadResult(batch=batch)
    batch_folder = config.batch_dir(batch.id)
    batch_folder.mkdir(parents=True, exist_ok=True)

    for rec in records:
        pdf_file = rec.get("pdfFile")
        if not pdf_file:
            raise ValueError(f"record missing 'pdfFile': {rec.get('title', rec)!r}")
        src = folder / pdf_file
        if not src.exists():
            result.missing_pdf.append(pdf_file)
            continue

        try:
            paper = _record_to_paper(rec, batch.id)
        except KeyError as e:
            raise ValueError(f"record missing required field {e}") from e

        existing = store.get_paper(paper.id)
        if existing is not None and existing.pdf_path:
            result.skipped_has_pdf.append(pdf_file)
            continue

        dest = batch_folder / f"{safe_id(paper.id)}-main.pdf"
        shutil.copy2(src, dest)

        if existing is None:
            store.upsert_paper(paper)  # inserts core fields, batch_id, stage=DOWNLOADED
            store.update_fields(paper.id, pdf_path=str(dest), failed_step=None)
            result.created += 1
        else:
            # Attach to an existing PDF-less paper and pull it into this batch; only
            # advance the stage, never regress one that's further along.
            fields: dict[str, Any] = {
                "pdf_path": str(dest),
                "batch_id": batch.id,
                "failed_step": None,
            }
            if existing.stage.order < Stage.DOWNLOADED.order:
                fields["stage"] = Stage.DOWNLOADED
            store.update_fields(paper.id, **fields)
            result.attached += 1

        if rec.get("needsReview"):
            result.needs_review.append(pdf_file)

    return result
