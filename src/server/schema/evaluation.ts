// Pure zod schemas — safe to import on either side of the server boundary.
import { z } from 'zod';
import { SourceEnum } from './candidate';

export const EvaluationStageEnum = z.enum(['ABSTRACT_SCREENING', 'FULL_PDF']);
export const RecommendationDecisionEnum = z.enum(['RECOMMEND', 'STORE_ONLY', 'LOW_QUALITY']);
export const PdfAnalysisStatusEnum = z.enum(['SUCCESS', 'FAILED', 'UNAVAILABLE']);

export const ScoresSchema = z
  .object({
    novelty: z.number().int().min(0).max(25),
    methodologicalRigor: z.number().int().min(0).max(25),
    experimentalQuality: z.number().int().min(0).max(20),
    venueSourceCredibility: z.number().int().min(0).max(15),
    authorInstitutionReputation: z.number().int().min(0).max(15),
    total: z.number().int().min(0).max(100),
  })
  .refine(
    (s) =>
      s.total ===
      s.novelty +
        s.methodologicalRigor +
        s.experimentalQuality +
        s.venueSourceCredibility +
        s.authorInstitutionReputation,
    { message: 'scores.total must equal the sum of the 5 dimension scores' },
  );

export const JoinKeySchema = z.object({
  source: SourceEnum,
  sourcePaperId: z.string().min(1),
});

const StringList = z.array(z.string().min(1));

export const EvaluationSchema = z
  .object({
    joinKey: JoinKeySchema,
    evaluationStage: EvaluationStageEnum,
    scores: ScoresSchema,
    summary: z.string().min(1),
    recommendationReason: z.string().min(1),
    keyContribution: z.string().nullable(),
    methodologySummary: z.string().nullable(),
    strengths: StringList.nullable(),
    weaknesses: StringList.nullable(),
    tags: StringList.default([]),
    rankingExplanation: z.string().min(1),
    recommendationDecision: RecommendationDecisionEnum,
    pdfAnalysisStatus: PdfAnalysisStatusEnum.nullable(),
    tableFigureAnalysis: z.unknown().nullable().default(null),
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
        if (!val.keyContribution || !val.methodologySummary) {
          ctx.addIssue({
            code: 'custom',
            path: ['keyContribution'],
            message:
              'keyContribution and methodologySummary required when pdfAnalysisStatus = SUCCESS',
          });
        }
        if (!val.strengths || val.strengths.length === 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['strengths'],
            message: 'strengths required (≥1) when pdfAnalysisStatus = SUCCESS',
          });
        }
        if (!val.weaknesses || val.weaknesses.length === 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['weaknesses'],
            message: 'weaknesses required (≥1) when pdfAnalysisStatus = SUCCESS',
          });
        }
      }
    } else {
      if (val.pdfAnalysisStatus !== null) {
        ctx.addIssue({
          code: 'custom',
          path: ['pdfAnalysisStatus'],
          message: 'pdfAnalysisStatus must be null when evaluationStage = ABSTRACT_SCREENING',
        });
      }
    }
  });

export const EvaluationsFileSchema = z.array(EvaluationSchema);

export type Evaluation = z.infer<typeof EvaluationSchema>;
