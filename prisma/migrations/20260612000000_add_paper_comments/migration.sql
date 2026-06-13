-- Public per-paper user comments (replaces the score display on the paper page).
CREATE TABLE "paper_comments" (
    "id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paper_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "paper_comments_paper_id_created_at_idx" ON "paper_comments"("paper_id", "created_at");
CREATE INDEX "paper_comments_user_id_idx" ON "paper_comments"("user_id");

ALTER TABLE "paper_comments" ADD CONSTRAINT "paper_comments_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "paper_comments" ADD CONSTRAINT "paper_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
