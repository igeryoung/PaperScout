-- CreateEnum
CREATE TYPE "Source" AS ENUM ('ARXIV', 'OPENREVIEW', 'HUGGINGFACE');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('ON_DEMAND', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('NEW', 'EXISTING', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "EvaluationStage" AS ENUM ('ABSTRACT_SCREENING', 'FULL_PDF');

-- CreateEnum
CREATE TYPE "RecommendationDecision" AS ENUM ('RECOMMEND', 'STORE_ONLY', 'LOW_QUALITY');

-- CreateEnum
CREATE TYPE "PdfAnalysisStatus" AS ENUM ('SUCCESS', 'FAILED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "TagSource" AS ENUM ('LLM_GENERATED', 'USER_GENERATED');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('ARXIV_ID', 'OPENREVIEW_ID', 'SOURCE_URL', 'NORMALIZED_TITLE', 'FUZZY_TITLE', 'PDF_URL');

-- CreateTable
CREATE TABLE "papers" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "normalized_title" TEXT NOT NULL,
    "authors" JSONB NOT NULL,
    "abstract" TEXT,
    "venue" TEXT,
    "published_date" DATE,
    "pdf_url" TEXT,
    "primary_source" "Source" NOT NULL,
    "duplicate_fingerprint" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_sources" (
    "id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "source" "Source" NOT NULL,
    "source_url" TEXT NOT NULL,
    "source_paper_id" TEXT,
    "pdf_url" TEXT,
    "metadata" JSONB,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_runs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "domain" TEXT NOT NULL DEFAULT 'computer_vision',
    "run_date" DATE NOT NULL,
    "trigger_type" "TriggerType" NOT NULL DEFAULT 'ON_DEMAND',
    "candidate_count" INTEGER NOT NULL DEFAULT 30,
    "recommended_count" INTEGER NOT NULL DEFAULT 10,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "ingest_source_dir" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "daily_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_run_results" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "candidate_rank" INTEGER,
    "final_rank" INTEGER,
    "is_recommended" BOOLEAN NOT NULL DEFAULT false,
    "collection_status" "CollectionStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_run_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_evaluations" (
    "id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "evaluation_stage" "EvaluationStage" NOT NULL,
    "llm_model" TEXT NOT NULL,
    "llm_prompt_version" TEXT NOT NULL,
    "summary" TEXT,
    "key_contribution" TEXT,
    "methodology_summary" TEXT,
    "strengths" JSONB,
    "weaknesses" JSONB,
    "novelty_score" INTEGER NOT NULL,
    "methodological_rigor_score" INTEGER NOT NULL,
    "experimental_quality_score" INTEGER NOT NULL,
    "venue_source_credibility_score" INTEGER NOT NULL,
    "author_institution_reputation_score" INTEGER NOT NULL,
    "total_score" INTEGER NOT NULL,
    "ranking_explanation" TEXT,
    "recommendation_decision" "RecommendationDecision" NOT NULL,
    "pdf_analysis_status" "PdfAnalysisStatus",
    "table_figure_analysis" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_feedback" (
    "id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "run_id" UUID,
    "user_id" UUID,
    "star_rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paper_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_tags" (
    "id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "tag" TEXT NOT NULL,
    "source" "TagSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_code_links" (
    "id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "code_url" TEXT NOT NULL,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_code_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_duplicates" (
    "id" UUID NOT NULL,
    "canonical_paper_id" UUID NOT NULL,
    "duplicate_paper_id" UUID NOT NULL,
    "match_method" "MatchMethod" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_duplicates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "papers_duplicate_fingerprint_key" ON "papers"("duplicate_fingerprint");

-- CreateIndex
CREATE INDEX "papers_normalized_title_idx" ON "papers"("normalized_title");

-- CreateIndex
CREATE INDEX "papers_primary_source_published_date_idx" ON "papers"("primary_source", "published_date");

-- CreateIndex
CREATE INDEX "paper_sources_paper_id_idx" ON "paper_sources"("paper_id");

-- CreateIndex
CREATE INDEX "paper_sources_source_url_idx" ON "paper_sources"("source_url");

-- CreateIndex
CREATE UNIQUE INDEX "paper_sources_source_source_paper_id_key" ON "paper_sources"("source", "source_paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_runs_ingest_source_dir_key" ON "daily_runs"("ingest_source_dir");

-- CreateIndex
CREATE INDEX "daily_runs_run_date_idx" ON "daily_runs"("run_date");

-- CreateIndex
CREATE INDEX "daily_runs_status_idx" ON "daily_runs"("status");

-- CreateIndex
CREATE INDEX "paper_run_results_run_id_final_rank_idx" ON "paper_run_results"("run_id", "final_rank");

-- CreateIndex
CREATE INDEX "paper_run_results_run_id_is_recommended_idx" ON "paper_run_results"("run_id", "is_recommended");

-- CreateIndex
CREATE UNIQUE INDEX "paper_run_results_run_id_paper_id_key" ON "paper_run_results"("run_id", "paper_id");

-- CreateIndex
CREATE INDEX "paper_evaluations_paper_id_llm_prompt_version_idx" ON "paper_evaluations"("paper_id", "llm_prompt_version");

-- CreateIndex
CREATE UNIQUE INDEX "paper_evaluations_paper_id_run_id_evaluation_stage_key" ON "paper_evaluations"("paper_id", "run_id", "evaluation_stage");

-- CreateIndex
CREATE INDEX "paper_feedback_paper_id_idx" ON "paper_feedback"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "paper_feedback_paper_id_run_id_user_id_key" ON "paper_feedback"("paper_id", "run_id", "user_id");

-- CreateIndex
CREATE INDEX "paper_tags_tag_idx" ON "paper_tags"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "paper_tags_paper_id_tag_source_key" ON "paper_tags"("paper_id", "tag", "source");

-- CreateIndex
CREATE UNIQUE INDEX "paper_code_links_paper_id_code_url_key" ON "paper_code_links"("paper_id", "code_url");

-- CreateIndex
CREATE INDEX "paper_duplicates_canonical_paper_id_idx" ON "paper_duplicates"("canonical_paper_id");

-- CreateIndex
CREATE INDEX "paper_duplicates_duplicate_paper_id_idx" ON "paper_duplicates"("duplicate_paper_id");

-- AddForeignKey
ALTER TABLE "paper_sources" ADD CONSTRAINT "paper_sources_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_run_results" ADD CONSTRAINT "paper_run_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "daily_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_run_results" ADD CONSTRAINT "paper_run_results_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_evaluations" ADD CONSTRAINT "paper_evaluations_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_evaluations" ADD CONSTRAINT "paper_evaluations_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "daily_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_feedback" ADD CONSTRAINT "paper_feedback_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_feedback" ADD CONSTRAINT "paper_feedback_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "daily_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_tags" ADD CONSTRAINT "paper_tags_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_code_links" ADD CONSTRAINT "paper_code_links_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_duplicates" ADD CONSTRAINT "paper_duplicates_canonical_paper_id_fkey" FOREIGN KEY ("canonical_paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_duplicates" ADD CONSTRAINT "paper_duplicates_duplicate_paper_id_fkey" FOREIGN KEY ("duplicate_paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
