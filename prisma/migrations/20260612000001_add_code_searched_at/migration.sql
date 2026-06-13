-- Track whether we've already searched the web for a paper's code repo.
-- NULL = not yet searched; set with no paper_code_links rows = searched, none found.
ALTER TABLE "papers" ADD COLUMN "code_searched_at" TIMESTAMP(3);
