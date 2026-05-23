-- User-owned paper collections, paper state, and view history.
CREATE TYPE "UserPaperStatus" AS ENUM ('UNREAD', 'READING', 'READ', 'ARCHIVED');

CREATE TABLE "user_papers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "paper_id" UUID NOT NULL,
  "liked" BOOLEAN NOT NULL DEFAULT false,
  "status" "UserPaperStatus" NOT NULL DEFAULT 'UNREAD',
  "note" TEXT,
  "last_viewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_papers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "paper_collections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "paper_collections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "paper_collection_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "collection_id" UUID NOT NULL,
  "paper_id" UUID NOT NULL,
  "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "paper_collection_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "paper_view_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "paper_id" UUID NOT NULL,
  "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "paper_view_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_papers_user_id_paper_id_key" ON "user_papers"("user_id", "paper_id");
CREATE INDEX "user_papers_user_id_status_idx" ON "user_papers"("user_id", "status");
CREATE INDEX "user_papers_user_id_liked_idx" ON "user_papers"("user_id", "liked");
CREATE INDEX "user_papers_paper_id_idx" ON "user_papers"("paper_id");

CREATE UNIQUE INDEX "paper_collections_user_id_name_key" ON "paper_collections"("user_id", "name");
CREATE INDEX "paper_collections_user_id_is_default_idx" ON "paper_collections"("user_id", "is_default");

CREATE UNIQUE INDEX "paper_collection_items_collection_id_paper_id_key" ON "paper_collection_items"("collection_id", "paper_id");
CREATE INDEX "paper_collection_items_paper_id_idx" ON "paper_collection_items"("paper_id");

CREATE INDEX "paper_view_history_user_id_viewed_at_idx" ON "paper_view_history"("user_id", "viewed_at");
CREATE INDEX "paper_view_history_paper_id_idx" ON "paper_view_history"("paper_id");

ALTER TABLE "user_papers"
  ADD CONSTRAINT "user_papers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_papers"
  ADD CONSTRAINT "user_papers_paper_id_fkey"
  FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "paper_collections"
  ADD CONSTRAINT "paper_collections_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "paper_collection_items"
  ADD CONSTRAINT "paper_collection_items_collection_id_fkey"
  FOREIGN KEY ("collection_id") REFERENCES "paper_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "paper_collection_items"
  ADD CONSTRAINT "paper_collection_items_paper_id_fkey"
  FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "paper_view_history"
  ADD CONSTRAINT "paper_view_history_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "paper_view_history"
  ADD CONSTRAINT "paper_view_history_paper_id_fkey"
  FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
