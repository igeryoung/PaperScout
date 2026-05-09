// Pure zod schemas — safe to import on either side of the server boundary.
// Used by scripts/ingest.ts and the validate-* CLI scripts (no DB or env access).
import { z } from 'zod';

export const SourceEnum = z.enum(['ARXIV', 'OPENREVIEW', 'HUGGINGFACE']);
export type SourceType = z.infer<typeof SourceEnum>;

export const AdditionalSourceSchema = z.object({
  source: SourceEnum,
  sourceUrl: z.string().url(),
  sourcePaperId: z.string().min(1),
});

export const CandidateSchema = z.object({
  title: z.string().min(1),
  authors: z.array(z.string().min(1)).min(1),
  abstract: z.string().nullable(),
  venue: z.string().nullable(),
  publishedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'publishedDate must be ISO-8601 date YYYY-MM-DD'),
  sourceUrl: z.string().url(),
  pdfUrl: z.string().url().nullable(),
  sourcePaperId: z.string().min(1).nullable(),
  source: SourceEnum,
  codeUrls: z.array(z.string().url()).default([]),
  additionalSources: z.array(AdditionalSourceSchema).default([]),
});

export const CandidatesFileSchema = z.array(CandidateSchema);

export type Candidate = z.infer<typeof CandidateSchema>;
