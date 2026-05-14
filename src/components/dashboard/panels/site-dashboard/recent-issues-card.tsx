import type { RecentIssueRow } from "./types";

type RecentIssuesCardProps = {
  rows: RecentIssueRow[];
  dateLabel: string;
};

export function RecentIssuesCard({ rows, dateLabel }: RecentIssuesCardProps) {
  return (
    <article className="dashboard-card flex h-[374px] min-h-0 flex-col rounded-xl border border-slate-200 bg-slate-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">최근 발견 이슈</h2>
          <p className="mt-1 truncate text-xs font-medium text-[#8a94a6]">{dateLabel}</p>
        </div>
        <p className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#8a94a6]">
          총
          <span className="text-sm font-bold text-slate-950">{rows.length}건</span>
        </p>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-2xl bg-white px-4 text-center text-sm font-medium text-slate-500">
            표시할 이슈가 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(({ analyzerLabel, issue, issueGuides, severity, wcagCriterion }) => (
              <div key={issue.id} className="rounded-2xl bg-white px-3 py-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span
                    className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold text-white"
                    style={{ backgroundColor: severity.color }}
                  >
                    {severity.label}
                  </span>
                  <span className="truncate rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                    {issue.issueCode}
                  </span>
                  <span className="truncate rounded-full bg-slate-950 px-2 py-1 text-[11px] font-bold text-white">
                    WCAG {wcagCriterion.criterion}
                  </span>
                  <span className="truncate rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600">
                    {analyzerLabel}
                  </span>
                </div>
                <p className="mt-2 truncate text-sm font-bold text-slate-950" title={issue.issueTitle}>
                  {issue.issueTitle}
                </p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{issue.message}</p>
                {issue.locationPath && (
                  <div className="mt-2 rounded-lg bg-slate-50 px-2 py-2">
                    <p className="text-[10px] font-bold text-slate-400">문제 위치</p>
                    <p className="mt-1 truncate font-mono text-[11px] leading-4 text-slate-600" title={issue.locationPath}>
                      {issue.locationPath}
                    </p>
                  </div>
                )}
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <p className="shrink-0 text-[11px] font-bold text-[#ef6a50]">AI 가이드</p>
                    <p className="min-w-0 truncate text-[11px] font-semibold text-slate-500" title={wcagCriterion.title}>
                      {wcagCriterion.title}
                    </p>
                  </div>
                  {issueGuides.length === 0 ? (
                    <>
                      <p className="mt-2 text-xs font-bold text-slate-900">개선 가이드 준비 중</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                        이슈 위치와 컴포넌트 역할을 확인한 뒤 WCAG 기준에 맞는 수정안을 연결해 주세요.
                      </p>
                    </>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {issueGuides.map((guide) => (
                        <div key={guide.id} className="rounded-lg bg-white px-2 py-2">
                          <p className="text-xs font-bold text-slate-900">{guide.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{guide.guideContent}</p>
                          {guide.recommendation && (
                            <p className="mt-2 text-[11px] font-medium leading-4 text-slate-600">{guide.recommendation}</p>
                          )}
                          {guide.exampleCode && (
                            <pre className="mt-2 max-h-16 overflow-auto rounded-lg bg-slate-950 px-2 py-2 text-[10px] leading-4 text-white">
                              <code>{guide.exampleCode}</code>
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
