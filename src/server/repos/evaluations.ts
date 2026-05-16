import { db } from '@/lib/db';
import type {
  EvaluationStage,
  PdfAnalysisStatus,
  RecommendationDecision,
} from '@prisma/client';

export const evaluationsRepo = {
  upsert: (input: {
    paperId: string;
    runId: string;
    evaluationStage: EvaluationStage;
    llmModel: string;
    llmPromptVersion: string;
    summary: string | null;
    keyContribution: string | null;
    methodologySummary: string | null;
    strengths: string[] | null;
    weaknesses: string[] | null;
    noveltyScore: number;
    methodologicalRigorScore: number;
    experimentalQualityScore: number;
    venueSourceCredibilityScore: number;
    authorInstitutionReputationScore: number;
    totalScore: number;
    rankingExplanation: string | null;
    recommendationReason: string | null;
    recommendationDecision: RecommendationDecision;
    pdfAnalysisStatus: PdfAnalysisStatus | null;
    tableFigureAnalysis?: unknown;
  }) =>
    db.paperEvaluation.upsert({
      where: {
        paperId_runId_evaluationStage: {
          paperId: input.paperId,
          runId: input.runId,
          evaluationStage: input.evaluationStage,
        },
      },
      create: {
        paperId: input.paperId,
        runId: input.runId,
        evaluationStage: input.evaluationStage,
        llmModel: input.llmModel,
        llmPromptVersion: input.llmPromptVersion,
        summary: input.summary,
        keyContribution: input.keyContribution,
        methodologySummary: input.methodologySummary,
        strengths: (input.strengths ?? null) as never,
        weaknesses: (input.weaknesses ?? null) as never,
        noveltyScore: input.noveltyScore,
        methodologicalRigorScore: input.methodologicalRigorScore,
        experimentalQualityScore: input.experimentalQualityScore,
        venueSourceCredibilityScore: input.venueSourceCredibilityScore,
        authorInstitutionReputationScore: input.authorInstitutionReputationScore,
        totalScore: input.totalScore,
        rankingExplanation: input.rankingExplanation,
        recommendationReason: input.recommendationReason,
        recommendationDecision: input.recommendationDecision,
        pdfAnalysisStatus: input.pdfAnalysisStatus,
        tableFigureAnalysis: (input.tableFigureAnalysis ?? null) as never,
      },
      update: {
        llmModel: input.llmModel,
        llmPromptVersion: input.llmPromptVersion,
        summary: input.summary,
        keyContribution: input.keyContribution,
        methodologySummary: input.methodologySummary,
        strengths: (input.strengths ?? null) as never,
        weaknesses: (input.weaknesses ?? null) as never,
        noveltyScore: input.noveltyScore,
        methodologicalRigorScore: input.methodologicalRigorScore,
        experimentalQualityScore: input.experimentalQualityScore,
        venueSourceCredibilityScore: input.venueSourceCredibilityScore,
        authorInstitutionReputationScore: input.authorInstitutionReputationScore,
        totalScore: input.totalScore,
        rankingExplanation: input.rankingExplanation,
        recommendationReason: input.recommendationReason,
        recommendationDecision: input.recommendationDecision,
        pdfAnalysisStatus: input.pdfAnalysisStatus,
        tableFigureAnalysis: (input.tableFigureAnalysis ?? null) as never,
      },
    }),

  findByPaperAndPromptVersion: (paperId: string, llmPromptVersion: string) =>
    db.paperEvaluation.findFirst({
      where: { paperId, llmPromptVersion },
      orderBy: { createdAt: 'desc' },
    }),
};
