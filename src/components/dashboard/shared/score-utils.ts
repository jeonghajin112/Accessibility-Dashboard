import type { IssueResultModel, ScoreDetail, ScoreResult, SeverityLevel } from "@/types/accessibility-domain";
import { toMonthKey } from "./utils";

export type TopIssueSummary = {
  issue_code: string;
  severity: SeverityLevel;
  count: number;
};

export type MonthlyScoreSummary = {
  month: string;
  average_score: number;
};

export function getScoreGrade(score: number): string {
  if (score >= 90) {
    return "A";
  }
  if (score >= 80) {
    return "B";
  }
  if (score >= 70) {
    return "C";
  }
  return "D";
}

export function buildScoreDetailMap(scoreDetails: ScoreDetail[]): Map<number, Record<string, number>> {
  const detailMap = new Map<number, Record<string, number>>();

  for (const detail of scoreDetails) {
    const current = detailMap.get(detail.score_result_id) ?? {};
    current[detail.category] = detail.score;
    detailMap.set(detail.score_result_id, current);
  }

  return detailMap;
}

export function buildTopIssueSummaries(issueResults: IssueResultModel[]): TopIssueSummary[] {
  const topIssueMap = new Map<string, TopIssueSummary>();

  for (const issue of issueResults) {
    const key = `${issue.issue_code}:${issue.severity}`;
    const current = topIssueMap.get(key);
    if (current) {
      current.count += 1;
    } else {
      topIssueMap.set(key, {
        issue_code: issue.issue_code,
        severity: issue.severity,
        count: 1
      });
    }
  }

  return [...topIssueMap.values()].sort((a, b) => b.count - a.count).slice(0, 5);
}

export function buildMonthlyScoreSummaries(scoreResults: ScoreResult[]): MonthlyScoreSummary[] {
  const monthMap = new Map<string, { total: number; count: number }>();

  for (const scoreResult of scoreResults) {
    const month = toMonthKey(scoreResult.updated_at);
    const current = monthMap.get(month);
    if (current) {
      current.total += scoreResult.total_score;
      current.count += 1;
    } else {
      monthMap.set(month, { total: scoreResult.total_score, count: 1 });
    }
  }

  return [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, value]) => ({
      month,
      average_score: Math.round(value.total / value.count)
    }));
}
