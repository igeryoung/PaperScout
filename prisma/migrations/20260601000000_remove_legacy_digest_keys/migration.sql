-- Strip the legacy `experiments` and `strengthsLimitations` sections from
-- the `digest` JSON blob on every existing evaluation row. New evaluations
-- written under the v3 schema never include these keys.
UPDATE "paper_evaluations"
SET "digest" = "digest" - 'experiments' - 'strengthsLimitations'
WHERE "digest" IS NOT NULL
  AND ("digest" ? 'experiments' OR "digest" ? 'strengthsLimitations');
