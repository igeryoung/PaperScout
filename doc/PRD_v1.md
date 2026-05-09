# PRD: Computer Vision Paper Search, Ranking, and Collection System V1

## 1. Product Overview

### Product Name

Working name: **PaperScout CV**

### Product Vision

Build an AI-powered paper collection and recommendation system for computer vision researchers that automatically discovers, evaluates, ranks, and stores recent papers, helping users filter out low-value papers and focus on high-quality research.

### V1 Product Focus

V1 focuses on a **computer vision paper collection system** with AI-assisted ranking and recommendation.

The system should:

1. Collect recent computer vision papers from selected sources.
2. Store all collected papers in a structured database.
3. Deduplicate papers across sources and future runs.
4. Rank papers using LLM-based quality judgment and metadata signals.
5. Recommend the top 10 papers from 30 daily candidates.
6. Allow users to rate papers from 1–5 stars and optionally leave comments.
7. Save feedback for future use, but not yet use it to modify ranking automatically.

---

## 2. Target Users

### Primary Users

The system is designed for:

1. **Individual PhD students**
2. **Academic researchers**
3. **Industry AI researchers**

### Initial Domain

V1 is scoped to:

> **Computer vision papers only**

The user does not manually enter arbitrary topics in V1. The search domain is fixed to computer vision.

---

## 3. Core User Problem

Researchers face too many daily papers, especially in AI and computer vision. Existing tools show many papers but do not reliably filter for actual research value.

The product should help users answer:

> “Which new computer vision papers are actually worth reading today?”

The system should not simply collect papers. It should help users avoid low-quality, incremental, or noisy papers and surface papers with stronger novelty, methodology, experiments, venue credibility, and author credibility.

---

## 4. Product Goals

### V1 Goals

1. Build a reliable **paper collection database**.
2. Collect daily computer vision papers from trusted sources.
3. Prevent duplicate paper collection and duplicate LLM evaluation.
4. Generate ranked recommendations from collected papers.
5. Store all ranking results, explanations, summaries, and metadata.
6. Provide a simple ranked-list user experience.
7. Collect user ratings and comments for future personalization or ranking improvement.

### Non-Goals for V1

V1 will not include:

1. General topic search across all academic fields.
2. User-defined arbitrary research topics.
3. Automatic daily background generation.
4. Personalized ranking based on previous feedback.
5. Team or lab collaboration.
6. Citation graph analysis.
7. Literature review generation.
8. Export to Zotero, Mendeley, BibTeX, Markdown, or PDF.
9. Full-text semantic search across the user’s library.
10. Global ranking model training from user feedback.

---

## 5. Core V1 Workflow

### Main Workflow

1. User opens the system.
2. User clicks **Generate Today’s Recommendations**.
3. System collects recent computer vision papers from configured sources.
4. System gathers **30 candidate papers**.
5. System deduplicates candidates against existing database records.
6. System stores all 30 papers in the database.
7. System performs initial metadata and abstract screening for all 30 papers.
8. System selects the top 15 likely candidates for deeper PDF analysis.
9. System downloads and analyzes full PDFs for those 15 candidates where available.
10. System ranks all 30 candidates.
11. System displays the **top 10 recommended papers**.
12. User can expand paper details.
13. User can rate each paper from **1–5 stars**.
14. User can optionally leave a comment.
15. Ratings and comments are stored for future use.

---

## 6. V1 Sources

The system will collect papers from:

1. **arXiv**
2. **OpenReview**
3. **Hugging Face trending papers / papers feed**

### Source Purpose

| Source       | Purpose                                                  |
| ------------ | -------------------------------------------------------- |
| arXiv        | Main source for recent preprints                         |
| OpenReview   | Peer-reviewed, workshop, and conference submissions      |
| Hugging Face | Community attention and practical implementation signals |

### Source Handling

The system should normalize records from different sources into a common paper schema.

A paper may appear across multiple sources. For example, the same paper may have:

- arXiv page
- OpenReview page
- Hugging Face paper page
- PDF URL
- Code URL

These should be merged into one canonical paper record where possible.

---

## 7. Paper Collection System

### Collection Behavior

V1 uses automatic collection:

> The system saves all 30 collected papers into the database.

The top 10 are shown as recommendations. The remaining 20 are also stored to prevent redundant future collection, parsing, or judging.

### Collection Organization

V1 uses a hybrid structure:

1. **Query-based daily collection**
   - Example: `computer vision — 2026-05-07`

2. **Auto-generated tags**
   - Example tags:
     - `object detection`
     - `image segmentation`
     - `3D vision`
     - `diffusion`
     - `vision-language model`
     - `video understanding`
     - `medical imaging`
     - `robot perception`

3. **Optional project folders**
   - Planned for later use.
   - V1 may include the database field but does not need a sophisticated project management interface.

---

## 8. Recommendation Output

### Default Output

The user sees a **ranked top-10 paper list**.

Each ranked item should show:

| Field                     | Include in Top-10 List |
| ------------------------- | ---------------------- |
| Rank                      | Yes                    |
| Title                     | Yes                    |
| Authors                   | Yes                    |
| Venue / source            | Yes                    |
| Ranking score             | Yes                    |
| Tags                      | Yes                    |
| Short LLM summary         | Yes                    |
| Reason for recommendation | Yes                    |
| PDF link                  | Yes                    |
| arXiv / source link       | Yes                    |
| Code link                 | Yes, if available      |

### Expanded Paper Details

When a user expands a paper, show:

| Field                        | Include           |
| ---------------------------- | ----------------- |
| Title                        | Yes               |
| Authors                      | Yes               |
| Abstract                     | Yes               |
| Venue / journal / conference | Yes               |
| PDF link                     | Yes               |
| arXiv link                   | Yes               |
| OpenReview link              | Yes, if available |
| Hugging Face link            | Yes, if available |
| Code link                    | Yes, if available |
| LLM-generated summary        | Yes               |
| Key contribution             | Yes               |
| Methodology summary          | Yes               |
| Strengths                    | Yes               |
| Weaknesses                   | Yes               |
| Ranking score                | Yes               |
| Ranking explanation          | Yes               |
| Tags                         | Yes               |
| Star rating                  | Yes               |
| Optional comment             | Yes               |

### Excluded from V1 Display

The following are not required in the default display:

| Field            | V1 Display Decision                                |
| ---------------- | -------------------------------------------------- |
| Citation count   | Exclude                                            |
| Dataset link     | Exclude                                            |
| Related papers   | Exclude                                            |
| Publication date | Not required in default card, but should be stored |

---

## 9. Ranking System

### Ranking Philosophy

The ranking system should prioritize research quality over popularity.

It should identify papers that are:

1. Novel
2. Methodologically rigorous
3. Experimentally strong
4. From credible venues or sources
5. Written by credible authors or institutions

The system should use **LLM-based judgment**, not only metadata.

---

## 10. Ranking Score Design

V1 uses a 100-point ranking score.

| Dimension                       |  Weight |
| ------------------------------- | ------: |
| Novelty / originality           |      25 |
| Methodological rigor            |      25 |
| Experimental quality            |      20 |
| Venue / source credibility      |      15 |
| Author / institution reputation |      15 |
| **Total**                       | **100** |

### Dimension Definitions

#### 1. Novelty / Originality — 25 points

Measures whether the paper introduces a genuinely new idea, method, architecture, dataset, benchmark, theory, or insight.

High score examples:

- Introduces a clearly new method.
- Challenges a dominant assumption.
- Opens a new research direction.
- Provides a substantially better formulation of an existing problem.

Low score examples:

- Minor architectural tweaks.
- Repackaging known methods.
- Weakly motivated incremental changes.

#### 2. Methodological Rigor — 25 points

Measures whether the method is technically sound, well-explained, and logically justified.

High score examples:

- Clear problem formulation.
- Strong technical design.
- Well-motivated components.
- Sound mathematical or algorithmic reasoning.

Low score examples:

- Vague method description.
- Missing implementation details.
- Unsupported design choices.
- Overclaiming beyond evidence.

#### 3. Experimental Quality — 20 points

Measures whether the empirical evaluation is convincing.

High score examples:

- Strong benchmarks.
- Fair baselines.
- Ablation studies.
- Robustness checks.
- Clear quantitative and qualitative evidence.
- Tables and figures support the claims.

Low score examples:

- Weak baselines.
- Missing ablations.
- Cherry-picked examples.
- Small or unclear evaluation.
- Claims not supported by tables or figures.

#### 4. Venue / Source Credibility — 15 points

Measures the credibility of the source.

High score examples:

- Accepted or reviewed at strong venues such as CVPR, ICCV, ECCV, NeurIPS, ICLR, ICML, ACL, Nature, Science, or respected workshops.
- OpenReview record with meaningful discussion.
- Strong community traction on Hugging Face, if technically justified.

Low score examples:

- Unknown source.
- No review record.
- Weak or suspicious publication context.

#### 5. Author / Institution Reputation — 15 points

Measures credibility of authors and institutions.

High score examples:

- Authors with prior high-impact work.
- Recognized research labs.
- Strong academic or industrial research groups.
- Track record in the specific subfield.

Low score examples:

- Unknown authors with no supporting evidence.
- Reputation signal unavailable.
- Institution/source context unclear.

Important: this signal should not dominate ranking. Strong unknown-author papers should still be able to rank highly if the research quality is strong.

---

## 11. Ranking Pipeline

### Candidate Count

Each daily run collects:

> **30 candidate papers**

### Recommendation Count

Each daily run displays:

> **Top 10 recommended papers**

### Stored Count

Each daily run stores:

> **All 30 candidate papers**

---

## 12. Two-Stage Evaluation Pipeline

V1 uses a two-stage ranking pipeline.

### Stage 1: Metadata and Abstract Screening

Applies to all 30 candidates.

Inputs:

- Title
- Authors
- Source
- Venue if available
- Abstract
- Source URL
- PDF URL
- arXiv metadata
- OpenReview metadata
- Hugging Face metadata
- Code URL if available

Outputs:

- Preliminary ranking score
- Preliminary tags
- Initial summary
- Initial recommendation reason
- Candidate shortlist for full PDF analysis

### Stage 2: Full PDF Analysis

Applies to the top 15 likely candidates from Stage 1.

The system should download and parse the full PDF when available.

The PDF analysis should include:

1. Full text
2. Introduction
3. Method section
4. Experiments section
5. Conclusion
6. Tables
7. Figures
8. Figure captions
9. Ablation studies
10. Benchmark comparisons

The system uses this deeper analysis to update:

- Novelty score
- Methodological rigor score
- Experimental quality score
- Strengths
- Weaknesses
- Key contribution
- Methodology summary
- Final ranking score
- Final ranking explanation

### Fallback Behavior

If PDF parsing fails, the system should fall back to:

1. Abstract
2. Source page
3. OpenReview page if available
4. arXiv metadata
5. Hugging Face page metadata

The system should mark the paper as:

> `pdf_analysis_status = failed`

or

> `pdf_analysis_status = unavailable`

---

## 13. LLM Evaluation Requirements

### LLM Judge Output

For each paper, the LLM should produce structured JSON.

Example schema:

```json
{
  "paper_id": "uuid",
  "summary": "Short summary of the paper.",
  "key_contribution": "Main contribution.",
  "methodology_summary": "How the method works.",
  "strengths": ["Strength 1", "Strength 2"],
  "weaknesses": ["Weakness 1", "Weakness 2"],
  "tags": ["segmentation", "vision-language model"],
  "scores": {
    "novelty": 22,
    "methodological_rigor": 21,
    "experimental_quality": 17,
    "venue_source_credibility": 12,
    "author_institution_reputation": 10,
    "total": 82
  },
  "ranking_explanation": "Why this paper is ranked highly or poorly.",
  "recommendation_decision": "recommend | store_only | low_quality"
}
```

### LLM Judge Constraints

The LLM must:

1. Avoid relying only on hype.
2. Penalize unsupported claims.
3. Penalize weak experiments.
4. Distinguish novelty from engineering scale.
5. Explicitly mention when evidence is insufficient.
6. Use tables and figures when available to evaluate experimental quality.
7. Return structured output that can be stored in the database.
8. Avoid recommending papers solely because they are from famous institutions.

---

## 14. Feedback System

### V1 Feedback Type

Users can provide:

1. **1–5 star rating**
2. **Optional comment**

### Feedback Behavior

In V1:

- Feedback is stored.
- Feedback does not automatically modify ranking.
- Feedback is reserved for future personalization, evaluation, or global ranking improvement.

### Feedback Fields

| Field             | Description                  |
| ----------------- | ---------------------------- |
| User ID           | The user who rated the paper |
| Paper ID          | Rated paper                  |
| Daily run ID      | Context of recommendation    |
| Star rating       | Integer from 1 to 5          |
| Comment           | Optional text                |
| Created timestamp | When feedback was submitted  |

---

## 15. Database Requirements

The database is a core V1 priority.

### Main Entities

1. `papers`
2. `paper_sources`
3. `daily_runs`
4. `paper_run_results`
5. `paper_evaluations`
6. `paper_feedback`
7. `paper_tags`
8. `paper_code_links`
9. `paper_duplicates`

---

## 16. Suggested Database Schema

### Table: `papers`

Stores canonical paper records.

| Field                 | Type      | Required | Notes                               |
| --------------------- | --------- | -------: | ----------------------------------- |
| id                    | UUID      |      Yes | Internal paper ID                   |
| title                 | Text      |      Yes | Canonical title                     |
| normalized_title      | Text      |      Yes | Lowercased, cleaned title for dedup |
| authors               | JSON      |      Yes | List of author names                |
| abstract              | Text      | Nullable | Paper abstract                      |
| venue                 | Text      | Nullable | Conference/journal/workshop         |
| published_date        | Date      | Nullable | Paper publication date              |
| pdf_url               | Text      | Nullable | Main PDF link                       |
| primary_source        | Text      |      Yes | arXiv, OpenReview, Hugging Face     |
| duplicate_fingerprint | Text      |      Yes | Hash for deduplication              |
| created_at            | Timestamp |      Yes | First collected time                |
| updated_at            | Timestamp |      Yes | Last updated time                   |

---

### Table: `paper_sources`

Stores source-specific links and IDs.

| Field           | Type      | Required | Notes                            |
| --------------- | --------- | -------: | -------------------------------- |
| id              | UUID      |      Yes | Source record ID                 |
| paper_id        | UUID      |      Yes | Foreign key to papers            |
| source          | Text      |      Yes | arXiv, OpenReview, Hugging Face  |
| source_url      | Text      |      Yes | Source page URL                  |
| source_paper_id | Text      | Nullable | arXiv ID, OpenReview ID, HF slug |
| pdf_url         | Text      | Nullable | Source PDF URL                   |
| metadata        | JSON      | Nullable | Raw metadata from source         |
| collected_at    | Timestamp |      Yes | Collection time                  |

---

### Table: `daily_runs`

Stores each generation event.

| Field             | Type      |                   Required | Notes                      |
| ----------------- | --------- | -------------------------: | -------------------------- |
| id                | UUID      |                        Yes | Daily run ID               |
| user_id           | UUID      | Nullable in single-user V1 | Future multi-user support  |
| domain            | Text      |                        Yes | Fixed: computer vision     |
| run_date          | Date      |                        Yes | Date of recommendation     |
| trigger_type      | Text      |                        Yes | on_demand                  |
| candidate_count   | Integer   |                        Yes | Default 30                 |
| recommended_count | Integer   |                        Yes | Default 10                 |
| status            | Text      |                        Yes | running, completed, failed |
| created_at        | Timestamp |                        Yes | Start time                 |
| completed_at      | Timestamp |                   Nullable | End time                   |

---

### Table: `paper_run_results`

Connects papers to a daily run.

| Field             | Type      | Required | Notes                        |
| ----------------- | --------- | -------: | ---------------------------- |
| id                | UUID      |      Yes | Result ID                    |
| run_id            | UUID      |      Yes | Foreign key to daily_runs    |
| paper_id          | UUID      |      Yes | Foreign key to papers        |
| candidate_rank    | Integer   | Nullable | Rank before final evaluation |
| final_rank        | Integer   | Nullable | Final ranking                |
| is_recommended    | Boolean   |      Yes | True for top 10              |
| collection_status | Text      |      Yes | new, existing, duplicate     |
| created_at        | Timestamp |      Yes | Timestamp                    |

---

### Table: `paper_evaluations`

Stores LLM ranking and analysis results.

| Field                               | Type      | Required | Notes                                  |
| ----------------------------------- | --------- | -------: | -------------------------------------- |
| id                                  | UUID      |      Yes | Evaluation ID                          |
| paper_id                            | UUID      |      Yes | Foreign key to papers                  |
| run_id                              | UUID      |      Yes | Foreign key to daily_runs              |
| evaluation_stage                    | Text      |      Yes | abstract_screening or full_pdf         |
| llm_model                           | Text      |      Yes | Model used                             |
| llm_prompt_version                  | Text      |      Yes | Prompt version                         |
| summary                             | Text      | Nullable | LLM-generated summary                  |
| key_contribution                    | Text      | Nullable | Main contribution                      |
| methodology_summary                 | Text      | Nullable | Method summary                         |
| strengths                           | JSON      | Nullable | List of strengths                      |
| weaknesses                          | JSON      | Nullable | List of weaknesses                     |
| novelty_score                       | Integer   |      Yes | 0–25                                   |
| methodological_rigor_score          | Integer   |      Yes | 0–25                                   |
| experimental_quality_score          | Integer   |      Yes | 0–20                                   |
| venue_source_credibility_score      | Integer   |      Yes | 0–15                                   |
| author_institution_reputation_score | Integer   |      Yes | 0–15                                   |
| total_score                         | Integer   |      Yes | 0–100                                  |
| ranking_explanation                 | Text      | Nullable | Explanation                            |
| recommendation_decision             | Text      |      Yes | recommend, store_only, low_quality     |
| pdf_analysis_status                 | Text      | Nullable | success, failed, unavailable           |
| table_figure_analysis               | JSON      | Nullable | Extracted evidence from tables/figures |
| created_at                          | Timestamp |      Yes | Evaluation time                        |

---

### Table: `paper_feedback`

Stores user ratings.

| Field       | Type      |                   Required | Notes                     |
| ----------- | --------- | -------------------------: | ------------------------- |
| id          | UUID      |                        Yes | Feedback ID               |
| paper_id    | UUID      |                        Yes | Foreign key to papers     |
| run_id      | UUID      |                   Nullable | Related daily run         |
| user_id     | UUID      | Nullable in single-user V1 | Future multi-user support |
| star_rating | Integer   |                        Yes | 1–5                       |
| comment     | Text      |                   Nullable | Optional user comment     |
| created_at  | Timestamp |                        Yes | Feedback time             |
| updated_at  | Timestamp |                        Yes | Last edited time          |

---

### Table: `paper_tags`

Stores generated tags.

| Field      | Type      | Required | Notes                         |
| ---------- | --------- | -------: | ----------------------------- |
| id         | UUID      |      Yes | Tag record ID                 |
| paper_id   | UUID      |      Yes | Foreign key to papers         |
| tag        | Text      |      Yes | Example: segmentation         |
| source     | Text      |      Yes | llm_generated, user_generated |
| created_at | Timestamp |      Yes | Timestamp                     |

---

### Table: `paper_code_links`

Stores code links.

| Field      | Type      | Required | Notes                                    |
| ---------- | --------- | -------: | ---------------------------------------- |
| id         | UUID      |      Yes | Code link ID                             |
| paper_id   | UUID      |      Yes | Foreign key to papers                    |
| code_url   | Text      |      Yes | GitHub, Papers With Code, HF Space, etc. |
| source     | Text      | Nullable | Where code link was found                |
| created_at | Timestamp |      Yes | Timestamp                                |

---

### Table: `paper_duplicates`

Stores duplicate detection decisions.

| Field              | Type      | Required | Notes                                |
| ------------------ | --------- | -------: | ------------------------------------ |
| id                 | UUID      |      Yes | Duplicate record ID                  |
| canonical_paper_id | UUID      |      Yes | Main paper record                    |
| duplicate_paper_id | UUID      |      Yes | Duplicate paper record               |
| match_method       | Text      |      Yes | title_hash, arxiv_id, doi, embedding |
| confidence         | Float     |      Yes | 0–1                                  |
| created_at         | Timestamp |      Yes | Timestamp                            |

---

## 17. Deduplication Requirements

The system must avoid duplicate collection and duplicate evaluation.

### Deduplication Signals

Use these in order:

1. Exact arXiv ID match
2. Exact OpenReview ID match
3. Exact source URL match
4. Normalized title match
5. Title similarity match
6. Author + title fuzzy match
7. PDF URL match
8. Embedding similarity, optional later

### Duplicate Fingerprint

Each paper should have a `duplicate_fingerprint`.

Suggested format:

```text
hash(normalized_title + first_author + year)
```

If arXiv ID exists, use:

```text
arxiv:{arxiv_id}
```

If OpenReview ID exists, use:

```text
openreview:{openreview_id}
```

---

## 18. UI Requirements

### Main Page

The main page should include:

1. Button: **Generate Today’s Recommendations**
2. Status indicator:
   - Collecting papers
   - Deduplicating
   - Evaluating abstracts
   - Analyzing PDFs
   - Ranking
   - Completed

3. Ranked top-10 list
4. Access to today’s full 30-paper collection
5. Basic database/library view

---

### Ranked List Item

Each list item should include:

```text
#1 Paper Title
Authors
Venue / Source
Score: 87 / 100
Tags: segmentation, vision-language model, benchmark
Short summary
Reason for recommendation
[PDF] [arXiv] [OpenReview] [Code]
Rating: ☆ ☆ ☆ ☆ ☆
```

---

### Paper Detail View

The detail view should include:

1. Abstract
2. LLM summary
3. Key contribution
4. Methodology summary
5. Strengths
6. Weaknesses
7. Ranking score breakdown
8. Ranking explanation
9. Links
10. User rating
11. Optional comment box

---

### Library View

The library/database view should allow users to browse stored papers.

V1 filters should include:

1. Date collected
2. Source
3. Recommended vs stored only
4. Tags
5. Score range
6. Star rating

Search can be basic keyword search in V1.

---

## 19. System Architecture

### High-Level Components

1. **Collection Agent**
   - Collects papers from arXiv, OpenReview, Hugging Face.

2. **Normalization Service**
   - Converts source-specific metadata into canonical schema.

3. **Deduplication Service**
   - Prevents duplicate records and duplicate evaluations.

4. **PDF Processing Service**
   - Downloads and parses PDFs.
   - Extracts text, tables, and figure captions.

5. **LLM Evaluation Agent**
   - Scores and summarizes papers.
   - Produces structured ranking output.

6. **Ranking Service**
   - Combines scores.
   - Selects top 10.

7. **Collection Database**
   - Stores papers, sources, runs, evaluations, feedback, and tags.

8. **Frontend**
   - Shows ranked list, detail cards, and library.

---

## 20. Functional Requirements

### FR1: Generate Daily Recommendations

The user can click **Generate Today’s Recommendations**.

System must:

1. Start an on-demand daily run.
2. Collect 30 computer vision candidate papers.
3. Store all candidates.
4. Deduplicate against previous records.
5. Rank papers.
6. Show top 10.

---

### FR2: Store All Candidate Papers

The system must store all 30 candidates, not only the top 10.

Each stored candidate must include:

1. Title
2. Authors
3. Abstract, if available
4. Source
5. Source URL
6. PDF URL, if available
7. Venue, if available
8. Published date, if available
9. Collected date
10. Daily run ID
11. Tags
12. Duplicate fingerprint

---

### FR3: Avoid Duplicate Collection

Before inserting a new paper, the system must check whether it already exists.

If duplicate:

1. Do not create a new canonical paper unless necessary.
2. Add missing source metadata to existing paper.
3. Link the paper to the current daily run.
4. Avoid unnecessary repeated PDF analysis unless metadata changed meaningfully.

---

### FR4: Perform Abstract Screening

For all 30 candidates, the system must perform metadata and abstract screening.

Output must include:

1. Preliminary scores
2. Preliminary summary
3. Preliminary tags
4. Preliminary recommendation decision

---

### FR5: Perform Full PDF Analysis for Top 15

The system must perform deeper PDF analysis for the top 15 likely candidates.

Analysis should include:

1. Full text
2. Tables
3. Figures
4. Captions
5. Experimental results
6. Ablation studies
7. Benchmark comparisons

---

### FR6: Generate Final Ranking

The system must produce final scores from 0–100.

The top 10 papers are marked as:

```text
is_recommended = true
```

The remaining 20 are marked as:

```text
is_recommended = false
```

---

### FR7: Show Ranked Top-10 List

The system must show top 10 papers in descending score order.

Each item must include:

1. Rank
2. Title
3. Authors
4. Venue/source
5. Score
6. Tags
7. Summary
8. Recommendation reason
9. Paper links

---

### FR8: Collect User Feedback

Users can rate each paper from 1–5 stars.

Users may optionally add a comment.

Feedback is stored but does not affect V1 ranking.

---

### FR9: Browse Paper Collection

Users can browse the stored paper collection.

Minimum filters:

1. Date
2. Source
3. Tag
4. Recommended status
5. Score range
6. Rating

---

## 21. Non-Functional Requirements

### Performance

Target behavior:

| Action                          | Target                                      |
| ------------------------------- | ------------------------------------------- |
| Collect 30 candidates           | Reasonable interactive latency              |
| Abstract screening              | Batch processing supported                  |
| Full PDF analysis for 15 papers | May take longer, progress should be visible |
| Display top 10                  | Immediately after ranking completes         |

Because full PDF analysis can be slow, the UI must show progress status.

### Reliability

The system should tolerate:

1. Missing abstracts
2. Missing PDFs
3. Failed PDF downloads
4. Failed table extraction
5. Source API failures
6. Duplicate source records
7. Incomplete metadata

### Observability

Log:

1. Source collection status
2. Number of papers collected
3. Number of duplicates
4. Number of failed PDF downloads
5. LLM evaluation failures
6. Ranking completion
7. Feedback submission

### Cost Control

V1 should reduce unnecessary LLM calls by:

1. Deduplicating before evaluation.
2. Reusing previous evaluations when paper content has not changed.
3. Performing full PDF analysis only for top 15 candidates.
4. Storing structured evaluation outputs.

---

## 22. Success Metrics

### Collection Metrics

1. Number of papers collected per daily run.
2. Duplicate rate across sources.
3. Percentage of papers with PDF URLs.
4. Percentage of papers successfully parsed.
5. Percentage of papers with code links.

### Ranking Metrics

1. Average score of recommended top 10.
2. Distribution of scores across all 30 candidates.
3. Percentage of recommended papers rated 4 or 5 stars.
4. Percentage of recommended papers rated 1 or 2 stars.
5. User comments indicating ranking problems.

### User Engagement Metrics

1. Daily recommendation generation count.
2. Number of expanded paper details.
3. Number of star ratings submitted.
4. Number of comments submitted.
5. Number of papers revisited in library.

### Quality Metrics

1. Top-10 satisfaction rate.
2. Low-quality recommendation rate.
3. Percentage of papers users mark 4–5 stars.
4. Repeated source quality by source type.
5. Ranking explanation usefulness, measured later through feedback.

---

## 23. MVP Scope

### Must Have

1. Fixed domain: computer vision.
2. On-demand generation.
3. arXiv collection.
4. OpenReview collection.
5. Hugging Face paper/trending collection.
6. Collect 30 candidates.
7. Save all 30 candidates.
8. Deduplicate papers.
9. Abstract screening for all 30.
10. Full PDF analysis for top 15.
11. Ranking score from 0–100.
12. Top-10 ranked list.
13. Paper detail view.
14. Star rating from 1–5.
15. Optional comment.
16. Library/database view.
17. Tags.
18. Code link storage when available.

### Should Have

1. Table and figure extraction from PDFs.
2. Ranking explanation.
3. Source-level metadata enrichment.
4. Reuse previous evaluations.
5. Filter by tags, score, source, and date.
6. Basic search in saved collection.

### Could Have

1. Project folders.
2. Markdown export.
3. PDF briefing export.
4. BibTeX export.
5. Zotero integration.
6. Personalized ranking.
7. Citation count enrichment.
8. Related paper graph.

### Won’t Have in V1

1. Multi-domain search.
2. Multi-topic subscriptions.
3. Automatic daily background runs.
4. Team collaboration.
5. Global ranking model learning.
6. Full literature review generation.
7. Complex citation network analysis.

---

## 24. Suggested V1 Build Order

### Phase 1: Collection Database

Build the data foundation first.

Deliverables:

1. Paper schema
2. Source schema
3. Daily run schema
4. Deduplication logic
5. Basic library page
6. Manual paper ingestion test

---

### Phase 2: Source Collection

Add source agents.

Deliverables:

1. arXiv collector
2. OpenReview collector
3. Hugging Face collector
4. Source normalization
5. 30-candidate selection logic

---

### Phase 3: Ranking Pipeline

Add LLM evaluation.

Deliverables:

1. Abstract screening prompt
2. Full PDF parsing
3. Table/figure extraction
4. Full PDF evaluation prompt
5. 100-point scoring
6. Ranking explanation

---

### Phase 4: Recommendation UI

Add user-facing workflow.

Deliverables:

1. Generate Today’s Recommendations button
2. Progress indicator
3. Top-10 ranked list
4. Paper detail expansion
5. Links to PDF/source/code

---

### Phase 5: Feedback and Library

Add user feedback and collection browsing.

Deliverables:

1. 1–5 star rating
2. Optional comment
3. Library filters
4. Daily collection view
5. Recommended vs stored-only distinction

---

## 25. Open Product Decisions for Later

These are intentionally deferred:

1. Should user feedback personalize future rankings?
2. Should global feedback influence all users?
3. Should users be able to define custom topics beyond computer vision?
4. Should the system export to Zotero or BibTeX?
5. Should papers be clustered by subfield?
6. Should the system generate weekly literature summaries?
7. Should citation counts be added later?
8. Should users be able to upload their own PDFs?
9. Should the system support team/shared collections?

---

## 26. Final V1 Definition

V1 is successful when:

> A researcher can click one button, receive a ranked list of the top 10 recent computer vision papers, inspect why each paper was recommended, rate papers, and trust that all collected papers are stored in a reusable database that avoids duplicate future processing.

The core product is not just a search agent. It is a **paper collection and judgment system**.
