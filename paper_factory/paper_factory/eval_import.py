"""Re-import ``evaluations.json`` produced by the eval agent back into the store.

Matches each ``EvaluationRecord`` to a paper by ``joinKey`` (source + sourcePaperId),
attaches the full record as ``evaluation_json``, copies its figure caption onto the
paper, and advances the paper to ``EVALUATED``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from .db import Store
from .models import Stage, make_paper_id


def _join_key_to_id(join_key: dict[str, Any]) -> str:
    return make_paper_id(join_key["source"], join_key.get("sourcePaperId"), "")


def import_evaluations(store: Store, evaluations_path: Path) -> tuple[int, int]:
    """Returns (matched, unmatched)."""
    data = json.loads(Path(evaluations_path).read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError(f"{evaluations_path} is not a JSON array of EvaluationRecord")

    matched = unmatched = 0
    for rec in data:
        join_key = rec.get("joinKey") or {}
        paper_id = _join_key_to_id(join_key)
        paper = store.get_paper(paper_id)
        if paper is None:
            unmatched += 1
            continue

        fields: dict[str, Any] = {"evaluation_json": rec, "stage": Stage.EVALUATED, "failed_step": None}
        figure = rec.get("figure")
        if figure:
            caption = figure.get("caption") or {}
            fields["figure_caption_en"] = caption.get("en")
            fields["figure_caption_zh"] = caption.get("zh-TW")
            if figure.get("label"):
                fields["figure_label"] = figure["label"]
            if figure.get("pageNumber"):
                fields["figure_page"] = figure["pageNumber"]
        store.update_fields(paper_id, **fields)
        matched += 1
    return matched, unmatched
