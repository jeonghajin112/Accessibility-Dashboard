import type { IssueResultModel, ScoreResult } from "@/types/accessibility-domain";

import { PanelMessage } from "../shared/display";
import { buildTopIssueSummaries, getScoreGrade } from "../shared/score-utils";

export function ReportsPanel({
  issueResults,
  scoreResults,
  isLoading,
  errorMessage
}: {
  issueResults: IssueResultModel[];
  scoreResults: ScoreResult[];
  isLoading: boolean;
  errorMessage: string;
}) {
  if (isLoading) {
    return <PanelMessage label="리포트 데이터를 불러오는 중..." />;
  }

  if (errorMessage.length > 0) {
    return <PanelMessage label={`리포트 로드 실패: ${errorMessage}`} isError />;
  }

  const latestScoreResults = [...scoreResults]
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, 3);
  const topIssues = buildTopIssueSummaries(issueResults).slice(0, 3);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-base font-semibold text-slate-900">최근 리포트</h3>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
          {latestScoreResults.map((scoreResult) => (
            <li key={scoreResult.id}>
              스캔 #{scoreResult.evaluation_request_id} - {getScoreGrade(scoreResult.total_score)} ({scoreResult.total_score}점)
            </li>
          ))}
        </ul>
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-base font-semibold text-slate-900">권장 조치</h3>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
          {topIssues.map((issue) => (
            <li key={`${issue.issue_code}-${issue.severity}-advice`}>
              {issue.issue_code} 개선 ({issue.severity})
            </li>
          ))}
        </ul>
      </article>
    </div>
  );
}
