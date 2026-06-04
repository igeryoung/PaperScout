-- The author/institution reputation dimension was removed from the evaluation
-- rubric (5 → 4 dimensions). Recompute total_score as the sum of the four
-- remaining dimensions, then drop the column. Existing dimension scores are
-- left as-is (no rescaling) per the migration directive.
UPDATE "paper_evaluations"
SET "total_score" =
  "novelty_score"
  + "methodological_rigor_score"
  + "experimental_quality_score"
  + "venue_source_credibility_score";

ALTER TABLE "paper_evaluations"
  DROP COLUMN IF EXISTS "author_institution_reputation_score";
