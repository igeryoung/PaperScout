-- Bilingual text columns for i18n (en + zh-TW).
--
-- Converts narrative TEXT columns to JSONB and reshapes the JSONB columns
-- (strengths, weaknesses) so each value is { "en": <original>, "zh-TW": null|[] }.
-- Migration is non-destructive: existing English content is preserved under
-- the "en" key, and "zh-TW" is seeded as NULL (or [] for arrays) for backfill.

-- -- paper_evaluations: text -> jsonb -------------------------------------------------

ALTER TABLE "paper_evaluations"
  ALTER COLUMN "summary" TYPE JSONB USING (
    CASE
      WHEN "summary" IS NULL THEN NULL
      ELSE jsonb_build_object('en', "summary", 'zh-TW', NULL)
    END
  );

ALTER TABLE "paper_evaluations"
  ALTER COLUMN "key_contribution" TYPE JSONB USING (
    CASE
      WHEN "key_contribution" IS NULL THEN NULL
      ELSE jsonb_build_object('en', "key_contribution", 'zh-TW', NULL)
    END
  );

ALTER TABLE "paper_evaluations"
  ALTER COLUMN "methodology_summary" TYPE JSONB USING (
    CASE
      WHEN "methodology_summary" IS NULL THEN NULL
      ELSE jsonb_build_object('en', "methodology_summary", 'zh-TW', NULL)
    END
  );

ALTER TABLE "paper_evaluations"
  ALTER COLUMN "ranking_explanation" TYPE JSONB USING (
    CASE
      WHEN "ranking_explanation" IS NULL THEN NULL
      ELSE jsonb_build_object('en', "ranking_explanation", 'zh-TW', NULL)
    END
  );

ALTER TABLE "paper_evaluations"
  ALTER COLUMN "recommendation_reason" TYPE JSONB USING (
    CASE
      WHEN "recommendation_reason" IS NULL THEN NULL
      ELSE jsonb_build_object('en', "recommendation_reason", 'zh-TW', NULL)
    END
  );

-- -- paper_evaluations: reshape existing JSONB arrays --------------------------------
-- Old shape: ["bullet 1", "bullet 2"]
-- New shape: { "en": ["bullet 1", "bullet 2"], "zh-TW": [] }
-- Skip rows where the value is already an object (idempotent re-runs / partial state).

UPDATE "paper_evaluations"
   SET "strengths" = jsonb_build_object('en', "strengths", 'zh-TW', '[]'::jsonb)
 WHERE "strengths" IS NOT NULL
   AND jsonb_typeof("strengths") = 'array';

UPDATE "paper_evaluations"
   SET "weaknesses" = jsonb_build_object('en', "weaknesses", 'zh-TW', '[]'::jsonb)
 WHERE "weaknesses" IS NOT NULL
   AND jsonb_typeof("weaknesses") = 'array';

-- -- paper_figures.caption: text -> jsonb --------------------------------------------

ALTER TABLE "paper_figures"
  ALTER COLUMN "caption" TYPE JSONB USING (
    CASE
      WHEN "caption" IS NULL THEN NULL
      ELSE jsonb_build_object('en', "caption", 'zh-TW', NULL)
    END
  );
