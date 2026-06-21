"""SQLite store for the factory. Global papers table + persisted batches.

Pure stdlib ``sqlite3`` — no ORM. Row <-> :class:`Paper` mapping lives here so the
rest of the app speaks dataclasses, not tuples.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

from difflib import SequenceMatcher

from . import config
from .models import Batch, Paper, ReviewDecision, Stage, dumps, normalize_title

SCHEMA = """
CREATE TABLE IF NOT EXISTS batches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    note        TEXT,
    archived    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS papers (
    id                  TEXT PRIMARY KEY,
    title               TEXT NOT NULL,
    authors             TEXT NOT NULL,            -- json array
    abstract            TEXT,
    venue               TEXT,
    published_date      TEXT NOT NULL,
    source_url          TEXT NOT NULL,
    pdf_url             TEXT,
    source_paper_id     TEXT,
    source              TEXT NOT NULL,
    code_urls           TEXT NOT NULL DEFAULT '[]',   -- json array
    additional_sources  TEXT NOT NULL DEFAULT '[]',   -- json array

    batch_id            INTEGER REFERENCES batches(id) ON DELETE SET NULL,
    stage               TEXT NOT NULL DEFAULT 'PENDING',
    review_decision     TEXT,

    pdf_path            TEXT,
    truncated_pdf_path  TEXT,
    truncate_page       INTEGER,
    figure_path         TEXT,
    figure_label        TEXT,
    figure_page         INTEGER,
    figure_caption_en   TEXT,
    figure_caption_zh   TEXT,

    evaluation_json     TEXT,                     -- json object (EvaluationRecord)
    failed_step         TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    ingested_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_papers_stage    ON papers(stage);
CREATE INDEX IF NOT EXISTS idx_papers_batch    ON papers(batch_id);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: Optional[Path] = None):
        config.ensure_dirs()
        self.path = path or config.DB_PATH
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.executescript(SCHEMA)
        self.conn.commit()
        self._migrate()

    def _migrate(self) -> None:
        """Add columns missing from databases created by older schema versions."""
        cols = {r["name"] for r in self.conn.execute("PRAGMA table_info(batches)")}
        if "archived" not in cols:
            self.conn.execute(
                "ALTER TABLE batches ADD COLUMN archived INTEGER NOT NULL DEFAULT 0"
            )
            self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    # ---------- batches ----------
    def create_batch(self, name: str, note: Optional[str] = None) -> Batch:
        ts = now()
        cur = self.conn.execute(
            "INSERT INTO batches(name, created_at, note) VALUES (?,?,?)",
            (name, ts, note),
        )
        self.conn.commit()
        return Batch(id=cur.lastrowid, name=name, created_at=ts, note=note)

    def list_batches(self, include_archived: bool = True) -> list[Batch]:
        where = "" if include_archived else "WHERE archived=0"
        rows = self.conn.execute(
            f"SELECT * FROM batches {where} ORDER BY created_at DESC"
        ).fetchall()
        return [
            Batch(
                id=r["id"],
                name=r["name"],
                created_at=r["created_at"],
                note=r["note"],
                archived=bool(r["archived"]),
            )
            for r in rows
        ]

    def set_batch_archived(self, batch_id: int, archived: bool) -> None:
        self.conn.execute(
            "UPDATE batches SET archived=? WHERE id=?",
            (1 if archived else 0, batch_id),
        )
        self.conn.commit()

    def delete_batch(self, batch_id: int) -> None:
        """Delete a batch. Its papers fall back to the unassigned pool via the
        ``ON DELETE SET NULL`` foreign key — papers and their files are untouched."""
        self.conn.execute("DELETE FROM batches WHERE id=?", (batch_id,))
        self.conn.commit()

    def assign_batch(self, paper_ids: Iterable[str], batch_id: int) -> None:
        ts = now()
        self.conn.executemany(
            "UPDATE papers SET batch_id=?, updated_at=? WHERE id=?",
            [(batch_id, ts, pid) for pid in paper_ids],
        )
        self.conn.commit()

    # ---------- papers ----------
    def upsert_paper(self, paper: Paper) -> bool:
        """Insert a new paper or no-op if it already exists. Returns True if inserted.

        Existing papers keep their pipeline state — re-importing the same crawl
        output must never reset progress.
        """
        existing = self.conn.execute(
            "SELECT id FROM papers WHERE id=?", (paper.id,)
        ).fetchone()
        if existing:
            return False
        ts = now()
        self.conn.execute(
            """
            INSERT INTO papers (
                id, title, authors, abstract, venue, published_date, source_url,
                pdf_url, source_paper_id, source, code_urls, additional_sources,
                batch_id, stage, review_decision, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                paper.id, paper.title, dumps(paper.authors), paper.abstract, paper.venue,
                paper.published_date, paper.source_url, paper.pdf_url, paper.source_paper_id,
                paper.source, dumps(paper.code_urls), dumps(paper.additional_sources),
                paper.batch_id,
                paper.stage.value,
                paper.review_decision.value if paper.review_decision else None,
                ts, ts,
            ),
        )
        self.conn.commit()
        return True

    def get_paper(self, paper_id: str) -> Optional[Paper]:
        row = self.conn.execute("SELECT * FROM papers WHERE id=?", (paper_id,)).fetchone()
        return _row_to_paper(row) if row else None

    def list_papers(
        self,
        batch_id: Optional[int] = None,
        bucket: Optional[str] = None,
        stage: Optional[Stage] = None,
    ) -> list[Paper]:
        clauses: list[str] = []
        params: list[Any] = []
        if batch_id is not None:
            clauses.append("batch_id=?")
            params.append(batch_id)
        if stage is not None:
            clauses.append("stage=?")
            params.append(stage.value)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = self.conn.execute(
            f"SELECT * FROM papers {where} ORDER BY created_at DESC", params
        ).fetchall()
        papers = [_row_to_paper(r) for r in rows]
        if bucket is not None:
            papers = [p for p in papers if p.bucket.value == bucket]
        return papers

    def match_titles(self, titles: Iterable[str], *, min_ratio: float = 0.92) -> dict[str, Paper]:
        """Map input titles to an already-stored paper of the same title, if any.

        Lets the "new batch from titles" path reuse a known paper instead of minting
        a duplicate source. Matching is punctuation/case-insensitive: an exact
        normalized hit wins; otherwise the best fuzzy match at/above ``min_ratio``
        (so a dropped subtitle word still resolves). When several rows share a title
        (e.g. the same paper crawled from two sources), the *richest* is returned —
        one that carries a venue first, then the furthest-along pipeline stage — so
        the conference label is preserved. Titles with no match are absent.
        """
        rows = self.conn.execute("SELECT id, title, venue, stage FROM papers").fetchall()
        index: dict[str, list[sqlite3.Row]] = {}
        for r in rows:
            index.setdefault(normalize_title(r["title"]), []).append(r)

        def richness(row: sqlite3.Row) -> tuple[int, int]:
            return (1 if row["venue"] else 0, Stage(row["stage"]).order)

        out: dict[str, Paper] = {}
        for title in titles:
            key = normalize_title(title)
            if not key:
                continue
            candidates = index.get(key)
            if candidates is None:
                candidates = self._fuzzy_candidates(key, index, min_ratio)
            if not candidates:
                continue
            paper = self.get_paper(max(candidates, key=richness)["id"])
            if paper:
                out[title] = paper
        return out

    @staticmethod
    def _fuzzy_candidates(
        key: str, index: dict[str, list[sqlite3.Row]], min_ratio: float
    ) -> list[sqlite3.Row]:
        """Best stored rows for a normalized title that isn't an exact hit.

        Scores every stored title by sequence similarity, but treats a distinctive
        token-aligned prefix as a near-certain match — pasted titles are often
        truncated (a dropped subtitle), which plain similarity under-scores. Returns
        the rows behind the best-scoring title(s), or ``[]`` if nothing clears the bar.
        """
        best_score, best_keys = min_ratio, []
        for k in index:
            if not k:
                continue
            score = SequenceMatcher(None, key, k).ratio()
            shorter, longer = sorted((key, k), key=len)
            # one title is the leading slice of the other, on a word boundary, and
            # long enough to be distinctive -> almost certainly the same paper.
            if len(shorter) >= 20 and (longer == shorter or longer.startswith(shorter + " ")):
                score = max(score, 0.97)
            if score > best_score:
                best_score, best_keys = score, [k]
            elif score == best_score:
                best_keys.append(k)
        return [r for k in best_keys for r in index[k]]

    def update_fields(self, paper_id: str, **fields: Any) -> None:
        """Update arbitrary columns. Stage/review enums are coerced; json columns dumped."""
        if "stage" in fields and isinstance(fields["stage"], Stage):
            fields["stage"] = fields["stage"].value
        if "review_decision" in fields and isinstance(fields["review_decision"], ReviewDecision):
            fields["review_decision"] = fields["review_decision"].value
        if "evaluation_json" in fields and not isinstance(fields["evaluation_json"], (str, type(None))):
            fields["evaluation_json"] = dumps(fields["evaluation_json"])
        fields["updated_at"] = now()
        cols = ", ".join(f"{k}=?" for k in fields)
        self.conn.execute(
            f"UPDATE papers SET {cols} WHERE id=?", (*fields.values(), paper_id)
        )
        self.conn.commit()

    def counts_by_bucket(self) -> dict[str, int]:
        out = {"pending": 0, "processing": 0, "finish": 0}
        for p in self.list_papers():
            out[p.bucket.value] += 1
        return out


def _row_to_paper(row: sqlite3.Row) -> Paper:
    ev = row["evaluation_json"]
    return Paper(
        id=row["id"],
        title=row["title"],
        authors=json.loads(row["authors"]),
        abstract=row["abstract"],
        venue=row["venue"],
        published_date=row["published_date"],
        source_url=row["source_url"],
        pdf_url=row["pdf_url"],
        source_paper_id=row["source_paper_id"],
        source=row["source"],
        code_urls=json.loads(row["code_urls"]),
        additional_sources=json.loads(row["additional_sources"]),
        batch_id=row["batch_id"],
        stage=Stage(row["stage"]),
        review_decision=ReviewDecision(row["review_decision"]) if row["review_decision"] else None,
        pdf_path=row["pdf_path"],
        truncated_pdf_path=row["truncated_pdf_path"],
        truncate_page=row["truncate_page"],
        figure_path=row["figure_path"],
        figure_label=row["figure_label"],
        figure_page=row["figure_page"],
        figure_caption_en=row["figure_caption_en"],
        figure_caption_zh=row["figure_caption_zh"],
        evaluation_json=json.loads(ev) if ev else None,
        failed_step=row["failed_step"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        ingested_at=row["ingested_at"],
    )
