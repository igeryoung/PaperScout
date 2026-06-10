// Pure zod schemas — safe to import on either side of the server boundary.
import { z } from 'zod';
import { SourceEnum } from './candidate';

export const EvaluationStageEnum = z.enum(['ABSTRACT_SCREENING', 'FULL_PDF']);
export const RecommendationDecisionEnum = z.enum(['RECOMMEND', 'STORE_ONLY', 'LOW_QUALITY']);
export const PdfAnalysisStatusEnum = z.enum(['SUCCESS', 'FAILED', 'UNAVAILABLE']);

export const SUPPORTED_LOCALES = ['en', 'zh-TW'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const localizedString = (opts: { max?: number } = {}) =>
  z
    .object({
      en: opts.max ? z.string().min(1).max(opts.max) : z.string().min(1),
      'zh-TW': opts.max ? z.string().min(1).max(opts.max) : z.string().min(1),
    })
    .strict();

const localizedStringList = z
  .object({
    en: z.array(z.string().min(1)).min(1),
    'zh-TW': z.array(z.string().min(1)).min(1),
  })
  .strict();

export const LocalizedStringSchema = localizedString();
export const LocalizedStringListSchema = localizedStringList;
export type LocalizedString = z.infer<typeof LocalizedStringSchema>;
export type LocalizedStringList = z.infer<typeof LocalizedStringListSchema>;

export const ScoresSchema = z
  .object({
    novelty: z.number().int().min(0).max(25),
    methodologicalRigor: z.number().int().min(0).max(30),
    experimentalQuality: z.number().int().min(0).max(30),
    venueSourceCredibility: z.number().int().min(0).max(15),
    total: z.number().int().min(0).max(100),
  })
  .refine(
    (s) =>
      s.total ===
      s.novelty +
        s.methodologicalRigor +
        s.experimentalQuality +
        s.venueSourceCredibility,
    { message: 'scores.total must equal the sum of the 4 dimension scores' },
  );

export const JoinKeySchema = z.object({
  source: SourceEnum,
  sourcePaperId: z.string().min(1),
});

const TagList = z.array(z.string().min(1));

export const FigureSchema = z.object({
  label: z.string().min(1),
  pageNumber: z.number().int().min(1),
  caption: localizedString({ max: 240 }),
  renderedPath: z.string().min(1),
});

export const DigestSchema = z
  .object({
    tldr: localizedString(),
    problemMotivation: localizedString(),
    keyContributions: localizedString(),
    methodOverview: localizedString(),
    resultsInterpretation: localizedString(),
    aiCommentary: localizedString(),
  })
  .strict();

export type Digest = z.infer<typeof DigestSchema>;

export const EvaluationSchema = z
  .object({
    joinKey: JoinKeySchema,
    evaluationStage: EvaluationStageEnum,
    // The paper's own abstract, extracted from the PDF (raw single-value string,
    // not translated — mirrors CandidateRecord.abstract / Paper.abstract). Lets the
    // evaluate step backfill abstracts that collection couldn't get (e.g. OPENACCESS
    // venues, where crawl-conference-list leaves abstract = null). ingest only writes
    // it to Paper.abstract when the candidate's abstract was empty; it never overwrites.
    abstract: z.string().min(1).nullable().default(null),
    scores: ScoresSchema,
    summary: localizedString(),
    recommendationReason: localizedString(),
    strengths: localizedStringList.nullable(),
    weaknesses: localizedStringList.nullable(),
    tags: TagList.default([]),
    recommendationDecision: RecommendationDecisionEnum,
    pdfAnalysisStatus: PdfAnalysisStatusEnum.nullable(),
    tableFigureAnalysis: z.unknown().nullable().default(null),
    figure: FigureSchema.nullable().default(null),
    digest: DigestSchema.nullable().default(null),
  })
  .superRefine((val, ctx) => {
    if (val.evaluationStage === 'FULL_PDF') {
      if (!val.pdfAnalysisStatus) {
        ctx.addIssue({
          code: 'custom',
          path: ['pdfAnalysisStatus'],
          message: 'pdfAnalysisStatus required when evaluationStage = FULL_PDF',
        });
      }
      if (val.pdfAnalysisStatus === 'SUCCESS') {
        if (!val.strengths || val.strengths.en.length === 0 || val.strengths['zh-TW'].length === 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['strengths'],
            message: 'strengths required (≥1 per locale) when pdfAnalysisStatus = SUCCESS',
          });
        }
        if (!val.weaknesses || val.weaknesses.en.length === 0 || val.weaknesses['zh-TW'].length === 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['weaknesses'],
            message: 'weaknesses required (≥1 per locale) when pdfAnalysisStatus = SUCCESS',
          });
        }
        if (!val.digest) {
          ctx.addIssue({
            code: 'custom',
            path: ['digest'],
            message: 'digest required when pdfAnalysisStatus = SUCCESS',
          });
        }
      } else if (val.digest !== null) {
        ctx.addIssue({
          code: 'custom',
          path: ['digest'],
          message:
            'digest must be null when pdfAnalysisStatus != SUCCESS (FULL_PDF stage but PDF unreadable)',
        });
      }
    } else {
      if (val.pdfAnalysisStatus !== null) {
        ctx.addIssue({
          code: 'custom',
          path: ['pdfAnalysisStatus'],
          message: 'pdfAnalysisStatus must be null when evaluationStage = ABSTRACT_SCREENING',
        });
      }
      if (val.figure !== null) {
        ctx.addIssue({
          code: 'custom',
          path: ['figure'],
          message: 'figure must be null when evaluationStage = ABSTRACT_SCREENING',
        });
      }
      if (val.digest !== null) {
        ctx.addIssue({
          code: 'custom',
          path: ['digest'],
          message: 'digest must be null when evaluationStage = ABSTRACT_SCREENING',
        });
      }
    }
    if (val.figure !== null && val.pdfAnalysisStatus !== 'SUCCESS') {
      ctx.addIssue({
        code: 'custom',
        path: ['figure'],
        message: 'figure can only be set when pdfAnalysisStatus = SUCCESS',
      });
    }
  });

export const EvaluationsFileSchema = z.array(EvaluationSchema);

export type Evaluation = z.infer<typeof EvaluationSchema>;
