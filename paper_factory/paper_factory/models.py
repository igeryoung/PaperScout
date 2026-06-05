"""Domain model: pipeline stages, coarse buckets, and row dataclasses."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class Stage(str, Enum):
    """Fine-grained per-paper position in the pipeline.

    Ordered; ``order`` drives "can this paper advance / resume" logic and the
    coarse bucket mapping below.
    """

    PENDING = "PENDING"
    DOWNLOADED = "DOWNLOADED"
    TRUNCATED = "TRUNCATED"
    CROPPED = "CROPPED"
    EXPORTED = "EXPORTED"
    EVALUATED = "EVALUATED"
    REVIEWED = "REVIEWED"
    INGESTED = "INGESTED"

    @property
    def order(self) -> int:
        return _STAGE_ORDER[self]

    @property
    def bucket(self) -> "Bucket":
        if self is Stage.PENDING:
            return Bucket.PENDING
        if self in (Stage.REVIEWED, Stage.INGESTED):
            return Bucket.FINISH
        return Bucket.PROCESSING


_STAGE_ORDER = {s: i for i, s in enumerate(Stage)}


class Bucket(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    FINISH = "finish"


class ReviewDecision(str, Enum):
    PASS = "PASS"
    REJECT = "REJECT"


@dataclass
class Batch:
    id: int
    name: str
    created_at: str
    note: Optional[str] = None


@dataclass
class Paper:
    id: str  # "<SOURCE>:<sourcePaperId>"
    title: str
    authors: list[str]
    abstract: Optional[str]
    venue: Optional[str]
    published_date: str
    source_url: str
    pdf_url: Optional[str]
    source_paper_id: Optional[str]
    source: str
    code_urls: list[str] = field(default_factory=list)
    additional_sources: list[dict[str, Any]] = field(default_factory=list)

    stage: Stage = Stage.PENDING
    review_decision: Optional[ReviewDecision] = None
    batch_id: Optional[int] = None

    pdf_path: Optional[str] = None
    truncated_pdf_path: Optional[str] = None
    truncate_page: Optional[int] = None
    figure_path: Optional[str] = None
    figure_label: Optional[str] = None
    figure_page: Optional[int] = None
    figure_caption_en: Optional[str] = None
    figure_caption_zh: Optional[str] = None

    evaluation_json: Optional[dict[str, Any]] = None
    failed_step: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    ingested_at: Optional[str] = None

    @property
    def bucket(self) -> Bucket:
        return self.stage.bucket

    @property
    def total_score(self) -> Optional[int]:
        if not self.evaluation_json:
            return None
        scores = self.evaluation_json.get("scores") or {}
        return scores.get("total")

    def to_candidate_record(self) -> dict[str, Any]:
        """Shape matching ``src/server/schema/candidate.ts`` (CandidateRecord)."""
        return {
            "title": self.title,
            "authors": self.authors,
            "abstract": self.abstract,
            "venue": self.venue,
            "publishedDate": self.published_date,
            "sourceUrl": self.source_url,
            "pdfUrl": self.pdf_url,
            "sourcePaperId": self.source_paper_id,
            "source": self.source,
            "codeUrls": self.code_urls,
            "additionalSources": self.additional_sources,
        }


def make_paper_id(source: str, source_paper_id: Optional[str], source_url: str) -> str:
    """Stable primary key. Falls back to the source URL when no paper id exists."""
    if source_paper_id:
        return f"{source}:{source_paper_id}"
    return f"{source}:url:{source_url}"


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)
