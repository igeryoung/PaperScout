"""Filesystem layout for the factory.

The package lives at ``<repo>/paper_factory/paper_factory``; the repo root is two
parents up. All working data lives under ``<repo>/data/factory`` unless overridden
with the ``PAPER_FACTORY_DATA`` environment variable.
"""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _data_root() -> Path:
    override = os.environ.get("PAPER_FACTORY_DATA")
    if override:
        return Path(override).expanduser().resolve()
    return REPO_ROOT / "data" / "factory"


DATA_ROOT = _data_root()
DB_PATH = DATA_ROOT / "factory.db"
INBOX_DIR = DATA_ROOT / "inbox"
PDF_DIR = DATA_ROOT / "pdfs"
TRUNCATED_DIR = DATA_ROOT / "truncated"
FIGURE_DIR = DATA_ROOT / "figures"
EXPORT_DIR = DATA_ROOT / "exports"

# Used to shell out to the existing TS ingest script.
INGEST_SCRIPT = REPO_ROOT / "scripts" / "ingest.ts"


def ensure_dirs() -> None:
    for d in (DATA_ROOT, INBOX_DIR, PDF_DIR, TRUNCATED_DIR, FIGURE_DIR, EXPORT_DIR):
        d.mkdir(parents=True, exist_ok=True)
