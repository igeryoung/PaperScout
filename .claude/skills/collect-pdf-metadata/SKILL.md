---
name: collect-pdf-metadata
description: Resolve DB-schema metadata for a folder of locally-collected PDFs so they can be uploaded into the Paper Factory GUI for evaluation. For each PDF it searches Semantic Scholar / arXiv by the title read off page 1, writes <folder>/candidates.json (a CandidateRecord[] with an extra pdfFile field per record), and flags any paper it could not confidently match. Use for the "upload my own PDFs" path — NOT the conference crawl (that's crawl-conference-list).
tools: [Bash, Read, Write, WebSearch, WebFetch]
---

# Collect PDF Metadata

The **manual-upload** counterpart to `crawl-conference-list`. The human has gathered a
folder of PDFs by hand; this skill turns each one into a `CandidateRecord` so the GUI's
**Upload folder** action can import them (PDF already in hand → they land at `DOWNLOADED`
and go straight to truncate/crop). Metadata only — **no downloads, no scoring, no DB writes,
no cropping**. Only touch the upload folder.

## Output contract (NON-NEGOTIABLE)

- **File:** `<folder>/candidates.json` — a JSON **array** of `CandidateRecord` objects,
  identical shape to `data/sample/candidates.json` (read it first to lock the shape).
- **Two extra keys per record** (the zod schema is non-strict and strips them, so the file
  still passes `npm run validate:candidates`):
  - `pdfFile` — the PDF's filename inside the folder. **Required on every record** — the GUI
    pairs each record to its local PDF by this exact name.
  - `needsReview` — `true` only when no confident online match was found.
- **Schema:** `src/server/schema/candidate.ts`. The file MUST pass
  `npm run validate:candidates <folder>/candidates.json` before you tell the user to upload.

## Steps

1. **Run the resolver** over the folder:

   ```bash
   python3 .claude/skills/collect-pdf-metadata/resolve_metadata.py /path/to/folder
   ```

   For each `*.pdf` it reads the title off page 1 (PyMuPDF, else `pdftotext`), queries
   **Semantic Scholar** (`/graph/v1/paper/search`) and falls back to the **arXiv API**, then
   maps the best title match to a record:

   | match               | `source`     | `sourceUrl`              | `pdfUrl`               | `sourcePaperId` |
   |---------------------|--------------|--------------------------|------------------------|-----------------|
   | `externalIds.ArXiv` | `ARXIV`      | `arxiv.org/abs/<id>`     | `arxiv.org/pdf/<id>`   | arXiv id        |
   | `externalIds.DOI`   | `OPENACCESS` | `doi.org/<doi>`          | `openAccessPdf.url`    | DOI             |
   | no confident match  | `OPENACCESS` | a Semantic Scholar search URL | `null`            | `null` + `needsReview:true` |

   It prints a per-PDF line and a final list of which PDFs `needsReview`.

2. **Fix the flagged records.** For every `needsReview` record, use **WebSearch / WebFetch**
   to find the paper's real landing page, then patch the record in `candidates.json`:
   replace the placeholder `sourceUrl`, fill `venue` and a real `publishedDate`
   (`YYYY-MM-DD`), set the correct `source` (`ARXIV` / `OPENREVIEW` / `OPENACCESS`), and add
   `pdfUrl` / `sourcePaperId` when you have them. Drop the `needsReview` key once fixed.
   If a paper genuinely has no online presence, leave the PDF-extracted fields but keep a
   sensible valid `sourceUrl` (e.g. the publisher search page) so it still validates.

3. **Validate:** `npm run validate:candidates <folder>/candidates.json` must exit 0. Fix any
   field error it reports (commonly: empty `authors`, a non-URL `sourceUrl`, or a
   `publishedDate` not in `YYYY-MM-DD`).

## Field notes

- `title` / `authors` / `abstract` / `venue` / `publishedDate` come from the online match for
  resolved papers; for `needsReview` papers they come from page 1 (authors may be `["Unknown"]`
  — fix in step 2) and the PDF's creation date (or today).
- `codeUrls` and `additionalSources` default to `[]`; add a GitHub URL or an arXiv
  `additionalSources` entry if you spot one while reviewing.
- `pdfUrl` may be `null` (the local PDF is what gets evaluated; the URL is just provenance).

## Rules

- **One record per PDF.** Never drop a PDF — if it can't be resolved, emit it with
  `needsReview:true`, never omit it.
- **Only the upload folder.** Don't write to `data/factory/inbox/`, the SQLite DB, or
  Postgres — `Upload folder` and the ingest step own those.
- Be polite to the APIs: the script already paces calls (`--sleep`, exponential backoff on
  429/5xx). Don't hammer them in a tight loop.

## Done when

- `<folder>/candidates.json` exists, every record has a `pdfFile` that matches a PDF in the
  folder, and `npm run validate:candidates <folder>/candidates.json` exits 0.
- You report the counts (resolved vs. needs-review) and tell the user to open Paper Factory
  → **Upload folder** → pick that folder.

## Out of scope

- Downloading PDFs, truncating, cropping figures, scoring — the GUI / evaluate steps own those.
- The conference-crawl pool (`crawl-conference-list`) — that path already has full metadata.
