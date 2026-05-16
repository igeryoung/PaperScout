import { db } from '@/lib/db';
import type {
  EvaluationStage,
  PdfAnalysisStatus,
  RecommendationDecision,
} from '@prisma/client';
import type { LocalizedString, LocalizedStringList } from '@/server/schema/evaluation';

export const evaluationsRepo = {
  upsert: (input: {
    paperId: string;
    runId: string;
    evaluationStage: EvaluationStage;
    llmModel: string;
    llmPromptVersion: string;
    summary: LocalizedString | null;
    keyContribution: LocalizedString | null;
    methodologySummary: LocalizedString | null;
    strengths: LocalizedStringList | null;
    weaknesses: LocalizedStringList | null;
    noveltyScore: number;
    methodologicalRigorScore: number;
    experimentalQualityScore: number;
    venueSourceCredibilityScore: number;
    authorInstitutionReputationScore: number;
    totalScore: number;
    rankingExplanation: LocalizedString | null;
    recommendationReason: LocalizedString | null;
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
        summary: (input.summary ?? null) as never,
        keyContribution: (input.keyContribution ?? null) as never,
        methodologySummary: (input.methodologySummary ?? null) as never,
        strengths: (input.strengths ?? null) as never,
        weaknesses: (input.weaknesses ?? null) as never,
        noveltyScore: input.noveltyScore,
        methodologicalRigorScore: input.methodologicalRigorScore,
        experimentalQualityScore: input.experimentalQualityScore,
        venueSourceCredibilityScore: input.venueSourceCredibilityScore,
        authorInstitutionReputationScore: input.authorInstitutionReputationScore,
        totalScore: input.totalScore,
        rankingExplanation: (input.rankingExplanation ?? null) as never,
        recommendationReason: (input.recommendationReason ?? null) as never,
        recommendationDecision: input.recommendationDecision,
        pdfAnalysisStatus: input.pdfAnalysisStatus,
        tableFigureAnalysis: (input.tableFigureAnalysis ?? null) as never,
      },
      update: {
        llmModel: input.llmModel,
        llmPromptVersion: input.llmPromptVersion,
        summary: (input.summary ?? null) as never,
        keyContribution: (input.keyContribution ?? null) as never,
        methodologySummary: (input.methodologySummary ?? null) as never,
        strengths: (input.strengths ?? null) as never,
        weaknesses: (input.weaknesses ?? null) as never,
        noveltyScore: input.noveltyScore,
        methodologicalRigorScore: input.methodologicalRigorScore,
        experimentalQualityScore: input.experimentalQualityScore,
        venueSourceCredibilityScore: input.venueSourceCredibilityScore,
        authorInstitutionReputationScore: input.authorInstitutionReputationScore,
        totalScore: input.totalScore,
        rankingExplanation: (input.rankingExplanation ?? null) as never,
        recommendationReason: (input.recommendationReason ?? null) as never,
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
