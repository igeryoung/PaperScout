-- CreateTable
CREATE TABLE "paper_figures" (
    "paper_id" UUID NOT NULL,
    "image_bytes" BYTEA NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT 'image/png',
    "caption" TEXT,
    "figure_label" TEXT,
    "page_number" INTEGER,
    "source_pdf_url" TEXT,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_figures_pkey" PRIMARY KEY ("paper_id")
);

-- AddForeignKey
ALTER TABLE "paper_figures" ADD CONSTRAINT "paper_figures_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
