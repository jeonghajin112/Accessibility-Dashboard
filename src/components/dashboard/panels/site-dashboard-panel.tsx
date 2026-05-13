import type {
  AnalysisResult,
  EvaluationRequestModel,
  EvaluationTargetModel,
  ImprovementGuide,
  IssueResultModel,
  OrganizationModel,
  ScoreResult,
  SeverityLevel
} from "@/types/accessibility-domain";

import { getScoreGrade } from "../shared/score-utils";
import { fallbackWcagCriterion, severityChartItems, wcagCriterionByIssueCode } from "./site-dashboard/constants";
import { RecentIssuesCard } from "./site-dashboard/recent-issues-card";
import { ScoreTrendCard } from "./site-dashboard/score-trend-card";
import { SeverityIssueCountCard } from "./site-dashboard/severity-issue-count-card";
import { SummaryStatCards } from "./site-dashboard/summary-stat-cards";
import type { RecentIssueRow, ScoreChartItem, SiteSummaryItem } from "./site-dashboard/types";
import { formatDateKey, formatDateLabel, formatShortDate, getAnalyzerTypeLabel, normalizeChartData } from "./site-dashboard/utils";

type SiteDashboardPanelProps = {
  organization: OrganizationModel;
  evaluationTarget: EvaluationTargetModel;
  evaluationRequests: EvaluationRequestModel[];
  analysisResults: AnalysisResult[];
  scoreResults: ScoreResult[];
  issueResults: IssueResultModel[];
  improvementGuides: ImprovementGuide[];
};

export function SiteDashboardPanel(props: SiteDashboardPanelProps) {
  const { evaluationTarget, evaluationRequests, analysisResults, improvementGuides, issueResults, scoreResults } = props;
  const targetEvaluationRequests = evaluationRequests.filter((request) => request.evaluation_target_id === evaluationTarget.id);
  const scoreByRequestId = new Map(scoreResults.map((scoreResult) => [scoreResult.evaluation_request_id, scoreResult]));
  const requestIdByAnalysisResultId = new Map(
    analysisResults.map((analysisResult) => [analysisResult.id, analysisResult.evaluation_request_id])
  );
  const analysisResultById = new Map(analysisResults.map((analysisResult) => [analysisResult.id, analysisResult]));
  const issueCountByRequestId = new Map<number, number>();
  const guidesByIssueId = buildGuidesByIssueId(improvementGuides);

  for (const issue of issueResults) {
    const requestId = requestIdByAnalysisResultId.get(issue.analysis_result_id);
    if (requestId === undefined) {
      continue;
    }

    issueCountByRequestId.set(requestId, (issueCountByRequestId.get(requestId) ?? 0) + 1);
  }

  const completedScoreItems = targetEvaluationRequests
    .map((request) => ({
      request,
      scoreResult: scoreByRequestId.get(request.id)
    }))
    .filter((item): item is { request: EvaluationRequestModel; scoreResult: ScoreResult } =>
      typeof item.scoreResult?.total_score === "number"
    )
    .sort((a, b) => Date.parse(a.request.updated_at) - Date.parse(b.request.updated_at));

  const chartData = buildScoreChartData(completedScoreItems, issueCountByRequestId);
  const latestCompletedScoreItem = completedScoreItems[completedScoreItems.length - 1] ?? null;
  const latestRequestId = latestCompletedScoreItem?.request.id ?? null;
  const latestIssues =
    latestRequestId === null
      ? []
      : issueResults.filter((issue) => requestIdByAnalysisResultId.get(issue.analysis_result_id) === latestRequestId);
  const issueSeverityRows = buildIssueSeverityRows(latestIssues);
  const maxIssueSeverityCount = Math.max(...issueSeverityRows.map((row) => row.count), 1);
  const summaryItems = buildSummaryItems({
    latestCompletedScoreItem,
    totalEvaluationRequestCount: targetEvaluationRequests.length
  });
  const recentIssueRows: RecentIssueRow[] = latestIssues.map((issue) => {
    const severity = severityChartItems.find((item) => item.key === issue.severity) ?? severityChartItems[0]!;
    return {
      issue,
      severity,
      wcagCriterion: wcagCriterionByIssueCode[issue.issue_code] ?? fallbackWcagCriterion,
      issueGuides: guidesByIssueId.get(issue.id) ?? [],
      analyzerLabel: getAnalyzerTypeLabel(analysisResultById.get(issue.analysis_result_id)?.analyzer_type)
    };
  });
  const recentIssueDateLabel = latestCompletedScoreItem
    ? formatDateLabel(latestCompletedScoreItem.request.updated_at)
    : "최근 평가 기준";

  return (
    <div className="grid min-h-0 items-stretch gap-3 lg:grid-cols-[minmax(0,38%)_148px_minmax(360px,1fr)]">
      <div className="grid min-h-0 gap-3">
        <ScoreTrendCard chartData={chartData} />
        <SeverityIssueCountCard rows={issueSeverityRows} totalCount={latestIssues.length} maxCount={maxIssueSeverityCount} />
      </div>
      <SummaryStatCards items={summaryItems} />
      <RecentIssuesCard rows={recentIssueRows} dateLabel={recentIssueDateLabel} />
    </div>
  );
}

function buildGuidesByIssueId(improvementGuides: ImprovementGuide[]): Map<number, ImprovementGuide[]> {
  const guidesByIssueId = new Map<number, ImprovementGuide[]>();

  for (const guide of improvementGuides) {
    const currentGuides = guidesByIssueId.get(guide.issue_result_id) ?? [];
    currentGuides.push(guide);
    guidesByIssueId.set(guide.issue_result_id, currentGuides);
  }

  return guidesByIssueId;
}

function buildScoreChartData(
  completedScoreItems: Array<{ request: EvaluationRequestModel; scoreResult: ScoreResult }>,
  issueCountByRequestId: Map<number, number>
): ScoreChartItem[] {
  const latestScoreByDate = new Map<string, ScoreChartItem>();

  for (const item of completedScoreItems) {
    const date = item.request.updated_at;
    latestScoreByDate.set(formatDateKey(date), {
      date,
      label: formatShortDate(date),
      score: Math.round(item.scoreResult.total_score),
      issueCount: issueCountByRequestId.get(item.request.id) ?? 0
    });
  }

  return normalizeChartData([...latestScoreByDate.values()].slice(-18));
}

function buildIssueSeverityRows(latestIssues: IssueResultModel[]) {
  const issueSeverityCounts = latestIssues.reduce<Record<SeverityLevel, number>>(
    (counts, issue) => {
      counts[issue.severity] += 1;
      return counts;
    },
    {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    }
  );

  return severityChartItems.map((item) => ({
    ...item,
    count: issueSeverityCounts[item.key],
    percent: latestIssues.length === 0 ? 0 : Math.round((issueSeverityCounts[item.key] / latestIssues.length) * 100)
  }));
}

function buildSummaryItems({
  latestCompletedScoreItem,
  totalEvaluationRequestCount
}: {
  latestCompletedScoreItem: { request: EvaluationRequestModel; scoreResult: ScoreResult } | null;
  totalEvaluationRequestCount: number;
}): SiteSummaryItem[] {
  return [
    {
      label: "평균 점수",
      value: latestCompletedScoreItem ? `${Math.round(latestCompletedScoreItem.scoreResult.total_score)}` : "-",
      unit: "점"
    },
    {
      label: "등급",
      value: latestCompletedScoreItem ? getScoreGrade(latestCompletedScoreItem.scoreResult.total_score) : "-",
      unit: latestCompletedScoreItem ? "등급" : ""
    },
    {
      label: "평가 횟수",
      value: `${totalEvaluationRequestCount}`,
      unit: "건"
    }
  ];
}
