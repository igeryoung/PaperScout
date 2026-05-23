-- Keep new UUID primary keys aligned with the existing Prisma client-side uuid()
-- convention used by the original migrations.
ALTER TABLE "user_papers" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "paper_collections" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "paper_collection_items" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "paper_view_history" ALTER COLUMN "id" DROP DEFAULT;
