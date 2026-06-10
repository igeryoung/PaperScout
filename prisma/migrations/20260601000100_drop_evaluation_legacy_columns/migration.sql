-- Drop the three structured-narrative columns that are no longer displayed
-- or written by the evaluate-papers skill. The remaining digest + summary +
-- recommendationReason + strengths/weaknesses cover every surface.
ALTER TABLE "paper_evaluations"
  DROP COLUMN IF EXISTS "key_contribution",
  DROP COLUMN IF EXISTS "methodology_summary",
  DROP COLUMN IF EXISTS "ranking_explanation";
