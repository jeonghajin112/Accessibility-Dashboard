import { motion } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info, LoaderCircle, MoveRight, Search } from "lucide-react";

import type { DashboardViewModel, ScoreResult, SeverityLevel } from "@/types/accessibility-domain";

import { categoryLabelMap, chartTokens, severityLabelMap } from "../shared/constants";
import { PanelMessage } from "../shared/display";
import { CurrentOpenIssuesCard } from "./dashboard/current-open-issues-card";
import { buildRecentScanRows, RecentScanJobsCard } from "./dashboard/recent-scan-jobs-card";
import { buildMonthlyScoreSummaries, buildTopIssueSummaries } from "../shared/score-utils";
import {
  buildClosedPolygonPath,
  buildRecentMonthKeys,
  buildSmoothAreaPath,
  buildSmoothLinePath,
  buildTrendChartPoints,
  formatDateOnly,
  polarToCartesian
} from "../shared/utils";

const MONTHLY_TOOLTIP_WIDTH = 104;
const MONTHLY_TOOLTIP_HEIGHT = 72;
const MONTHLY_TOOLTIP_MARGIN = 8;
const issueCodeLabelMap: Record<string, string> = {
  "5.1.1": "적절한 대체 텍스트 제공",
  "img-alt": "대체 텍스트",
  "heading-order": "제목 구조",
  "color-contrast": "색상 대비",
  "keyboard-focus": "초점 표시",
  "label-missing": "레이블/지시사항"
};
const issueCodeSummaryMap: Record<string, string> = {
  "5.1.1": "정보성 이미지에 대체 텍스트가 필요합니다.",
  "img-alt": "이미지 의미를 스크린리더가 전달할 수 있도록 대체 텍스트가 필요합니다.",
  "heading-order": "제목, 목록, 관계 정보가 화면 구조뿐 아니라 의미 구조로도 전달되어야 합니다.",
  "color-contrast": "텍스트와 배경의 대비가 충분해야 저시력 사용자도 내용을 읽을 수 있습니다.",
  "keyboard-focus": "키보드 탐색 중 현재 초점 위치가 시각적으로 명확하게 보여야 합니다.",
  "label-missing": "입력 폼에는 목적을 알 수 있는 레이블과 필요한 안내가 제공되어야 합니다."
};
const wcagPageTransitionVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? 14 : -14
  }),
  center: {
    opacity: 1,
    x: 0
  }
};

function getIssueCategoryKey(issueCode: string): "perceivable" | "operable" | "understandable" | "robust" {
  const kwcagGroup = issueCode.trim().match(/^([5-8])(?:\.|$)/)?.[1];
  if (kwcagGroup === "5") {
    return "perceivable";
  }
  if (kwcagGroup === "6") {
    return "operable";
  }
  if (kwcagGroup === "7") {
    return "understandable";
  }
  if (kwcagGroup === "8") {
    return "robust";
  }

  if (issueCode === "5.1.1" || issueCode.includes("contrast") || issueCode.includes("alt")) {
    return "perceivable";
  }
  if (issueCode.includes("keyboard") || issueCode.includes("focus")) {
    return "operable";
  }
  if (issueCode.includes("label") || issueCode.includes("heading")) {
    return "understandable";
  }
  return "robust";
}

function getKwcagLabel(issueCode: string): string {
  const normalizedIssueCode = issueCode.trim();
  return normalizedIssueCode ? `KWCAG ${normalizedIssueCode}` : "KWCAG 기준";
}

function getFloatingMonthlyTooltipPosition(pointerX: number, pointerY: number) {
  if (typeof window === "undefined") {
    return { x: pointerX, y: pointerY };
  }

  return {
    x: Math.min(
      Math.max(pointerX, MONTHLY_TOOLTIP_MARGIN),
      Math.max(MONTHLY_TOOLTIP_MARGIN, window.innerWidth - MONTHLY_TOOLTIP_WIDTH - MONTHLY_TOOLTIP_MARGIN)
    ),
    y: Math.min(
      Math.max(pointerY, MONTHLY_TOOLTIP_MARGIN),
      Math.max(MONTHLY_TOOLTIP_MARGIN, window.innerHeight - MONTHLY_TOOLTIP_HEIGHT - MONTHLY_TOOLTIP_MARGIN)
    )
  };
}

function DashboardLoadingState() {
  const skeletonLine = "animate-pulse rounded-full bg-slate-200/80";

  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
        <LoaderCircle className="h-4 w-4 animate-spin text-[#ef6a50]" strokeWidth={2} />
        대시보드 데이터를 불러오는 중...
      </div>

      <div className="grid overflow-visible gap-3 xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="grid min-w-0 overflow-visible gap-3 xl:grid-cols-[minmax(220px,0.8fr)_minmax(220px,0.8fr)_minmax(280px,1.4fr)] xl:grid-rows-[280px_348px] 2xl:grid-cols-[minmax(240px,0.78fr)_minmax(240px,0.78fr)_minmax(320px,1.44fr)]">
          <article className="dashboard-card order-1 flex h-[280px] min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-4">
            <div className={`${skeletonLine} h-4 w-36`} />
            <div className="mt-8 space-y-2">
              <div className={`${skeletonLine} h-8 w-20`} />
              <div className={`${skeletonLine} h-3 w-28`} />
            </div>
            <div className="mt-auto h-[132px] overflow-hidden rounded-b-[24px] bg-slate-100/80 p-4">
              <div className="mt-16 h-16 rounded-[50%] border-t-4 border-[#ef6a50]/40" />
            </div>
          </article>

          <div className="order-2 grid h-[280px] min-h-0 gap-3 lg:grid-cols-2 xl:col-span-2 xl:col-start-2 xl:row-start-1">
            {Array.from({ length: 2 }).map((_, index) => (
              <article key={index} className="dashboard-card flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-4">
                <div className={`${skeletonLine} h-4 w-32`} />
                <div className={`${skeletonLine} mt-3 h-8 w-24`} />
                <div className="mt-auto grid grid-cols-4 items-end gap-3">
                  {[44, 74, 52, 64].map((height, barIndex) => (
                    <div key={barIndex} className="flex h-28 items-end">
                      <div
                        className="w-full animate-pulse rounded-xl bg-slate-200/80"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>

          {Array.from({ length: 3 }).map((_, index) => (
            <article
              key={index}
              className="dashboard-card flex h-[348px] min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className={`${skeletonLine} h-4 w-40`} />
              <div className="mt-6 grid flex-1 place-items-center">
                <div className="h-36 w-36 animate-pulse rounded-full border-[18px] border-slate-200/80" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className={`${skeletonLine} h-3`} />
                <div className={`${skeletonLine} h-3`} />
                <div className={`${skeletonLine} h-3`} />
              </div>
            </article>
          ))}
        </div>

        <article className="dashboard-card flex min-h-[628px] flex-col rounded-xl border border-slate-200 bg-white p-4">
          <div className={`${skeletonLine} h-4 w-40`} />
          <div className="mt-6 space-y-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="h-9 w-9 animate-pulse rounded-full bg-slate-200/80" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className={`${skeletonLine} h-3 w-2/3`} />
                  <div className={`${skeletonLine} h-2 w-1/2`} />
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}

export function DashboardPanel({
  data,
  isLoading,
  errorMessage,
  isDarkMode,
  onSiteClick
}: {
  data: DashboardViewModel | null;
  isLoading: boolean;
  errorMessage: string;
  isDarkMode: boolean;
  onSiteClick: (input: { projectId: number; siteId: number }) => void;
}) {
  const [hoveredIssueInfo, setHoveredIssueInfo] = useState<{ category: string; x: number; y: number } | null>(null);
  const [hoveredMonthlyPoint, setHoveredMonthlyPoint] = useState<{ month: string; score: number; x: number; y: number } | null>(null);
  const [isMonthlyInfoVisible, setIsMonthlyInfoVisible] = useState(false);
  const [isIssueRatioInfoVisible, setIsIssueRatioInfoVisible] = useState(false);
  const [isAverageScoreInfoVisible, setIsAverageScoreInfoVisible] = useState(false);
  const [isWcagInfoVisible, setIsWcagInfoVisible] = useState(false);
  const [reportSearchQuery, setReportSearchQuery] = useState("");
  const [reportSearchMode, setReportSearchMode] = useState<"project" | "site">("project");
  const [selectedReportProjectId, setSelectedReportProjectId] = useState<number | null>(null);
  const [selectedReportSiteId, setSelectedReportSiteId] = useState<number | null>(null);
  const [wcagViolationPage, setWcagViolationPage] = useState(0);
  const [wcagViolationDirection, setWcagViolationDirection] = useState(0);
  const [hoveredRadarMetric, setHoveredRadarMetric] = useState<{
    key: string;
    label: string;
    value: number;
    x: number;
    y: number;
  } | null>(null);
  const [issueAnimationKey, setIssueAnimationKey] = useState(0);
  const issueChartRef = useRef<HTMLDivElement | null>(null);
  const monthlyChartRef = useRef<HTMLDivElement | null>(null);
  const radarChartRef = useRef<HTMLDivElement | null>(null);
  const reportSearchInputRef = useRef<HTMLInputElement | null>(null);
  const issueMaskIdBase = useId();
  const donutRadius = 88;
  const donutCircumference = 2 * Math.PI * donutRadius;

  useEffect(() => {
    setHoveredIssueInfo(null);
    setHoveredMonthlyPoint(null);
    setIsMonthlyInfoVisible(false);
    setIsIssueRatioInfoVisible(false);
    setIsAverageScoreInfoVisible(false);
    setIsWcagInfoVisible(false);
    setWcagViolationPage(0);
    setWcagViolationDirection(0);
    setHoveredRadarMetric(null);
    setIssueAnimationKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!data) {
      return;
    }

    const selectedProjectExists =
      selectedReportProjectId === null || data.organizations.some((project) => project.id === selectedReportProjectId);
    const selectedSiteExists =
      selectedReportSiteId === null ||
      data.organizations.some((project) => project.evaluationTargets.some((site) => site.id === selectedReportSiteId));

    if (!selectedProjectExists) {
      setSelectedReportProjectId(null);
      setSelectedReportSiteId(null);
      setReportSearchMode("project");
      return;
    }

    if (!selectedSiteExists) {
      setSelectedReportSiteId(null);
    }
  }, [data, selectedReportProjectId, selectedReportSiteId]);

  if (isLoading) {
    return <DashboardLoadingState />;
  }

  if (errorMessage.length > 0) {
    return <PanelMessage label={`대시보드 로드 실패: ${errorMessage}`} isError />;
  }

  if (!data) {
    return <PanelMessage label="대시보드 데이터가 없습니다." />;
  }

  const scoreByEvaluationRequestModelId = new Map(data.scoreResults.map((score) => [score.evaluationRequestId, score]));
  const topIssueSummaries = buildTopIssueSummaries(data.issueResults);
  const monthlyScoreSummaries = buildMonthlyScoreSummaries(data.scoreResults);
  const scanRows = buildRecentScanRows(data);

  const requestIdByAnalysisResultId = new Map(
    data.analysisResults.map((analysisResult) => [analysisResult.id, analysisResult.evaluationRequestId])
  );
  const latestRequestByTargetId = new Map<number, (typeof data.evaluationRequests)[number]>();
  for (const request of data.evaluationRequests) {
    const current = latestRequestByTargetId.get(request.evaluationTargetId);
    const requestTime = Date.parse(request.updatedAt);
    const currentTime = current ? Date.parse(current.updatedAt) : 0;
    if (!current || requestTime > currentTime) {
      latestRequestByTargetId.set(request.evaluationTargetId, request);
    }
  }

  const latestRequestIds = new Set([...latestRequestByTargetId.values()].map((request) => request.id));
  const hasAnalysisRequestLinks = requestIdByAnalysisResultId.size > 0;
  const currentIssueResults = hasAnalysisRequestLinks
    ? (data.issueResults ?? []).filter((issue) => {
        const requestId = requestIdByAnalysisResultId.get(issue.analysisResultId);
        return typeof requestId === "number" && latestRequestIds.has(requestId);
      })
    : (data.issueResults ?? []);
  const baseIssueCategoryKeys = ["perceivable", "operable", "understandable", "robust"] as const;
  const emptyIssueCategorySummary = {
    count: 0,
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0
  };
  const categoryRows = baseIssueCategoryKeys.map((category) => ({
    category,
    label: categoryLabelMap[category] ?? category,
    ...emptyIssueCategorySummary
  }));
  const categoryRowByKey = new Map(categoryRows.map((row) => [row.category, row]));
  for (const issue of currentIssueResults) {
    const category = getIssueCategoryKey(issue.issueCode);
    const categoryRow = categoryRowByKey.get(category);
    if (!categoryRow) {
      continue;
    }
    categoryRow.count += 1;
    categoryRow[issue.severity] += 1;
  }
  const totalCategoryCount = categoryRows.reduce((sum, row) => sum + row.count, 0);
  const categoryColors = chartTokens.donutPalette;
  const categoryPercentages = (() => {
    if (totalCategoryCount <= 0 || categoryRows.length === 0) {
      return categoryRows.map(() => 0);
    }
    const rawPercentages = categoryRows.map((row) => (row.count / totalCategoryCount) * 100);
    const floored = rawPercentages.map((value) => Math.floor(value));
    let remaining = 100 - floored.reduce((sum, value) => sum + value, 0);
    const remainders = rawPercentages
      .map((value, index) => ({ index, remainder: value - floored[index]! }))
      .sort((a, b) => b.remainder - a.remainder);

    for (let i = 0; i < remaining; i += 1) {
      const target = remainders[i];
      if (!target) {
        break;
      }
      floored[target.index] += 1;
    }

    return floored;
  })();
  let donutOffset = 0;
  const donutSegments = categoryRows.map((row, index) => {
    const fraction = totalCategoryCount > 0 ? row.count / totalCategoryCount : 0;
    const dash = fraction * donutCircumference;
    const segment = {
      ...row,
      color: categoryColors[index % categoryColors.length],
      percentage: categoryPercentages[index] ?? 0,
      dash,
      offset: -donutOffset
    };
    donutOffset += dash;
    return segment;
  });
  const activeDonutCategory = hoveredIssueInfo
    ? donutSegments.find((segment) => segment.category === hoveredIssueInfo.category) ?? null
    : null;
  const issueMaskId = `${issueMaskIdBase}-${issueAnimationKey}`;

  const fallbackMonthlyLabels = buildRecentMonthKeys(6);
  const buildMonthWindow = (endMonth: string, monthCount: number) => {
    const [yearValue, monthValue] = endMonth.split("-").map((value) => Number(value));
    if (!Number.isInteger(yearValue) || !Number.isInteger(monthValue)) {
      return fallbackMonthlyLabels;
    }

    return Array.from({ length: monthCount }, (_, index) => {
      const date = new Date(yearValue, monthValue - monthCount + index, 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    });
  };
  const monthlyScoreRows = [...monthlyScoreSummaries]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-6);
  const monthlySeriesRaw = monthlyScoreRows.map((item) => item.averageScore);
  const monthlyLabels =
    monthlyScoreRows.length >= 2
      ? monthlyScoreRows.map((item) => item.month)
      : monthlyScoreRows.length === 1
        ? buildMonthWindow(monthlyScoreRows[0]!.month, 6)
        : fallbackMonthlyLabels;
  const monthlySeries =
    monthlyScoreRows.length >= 2
      ? monthlySeriesRaw
      : monthlyScoreRows.length === 1
        ? monthlyLabels.map(() => monthlyScoreRows[0]!.averageScore)
        : [72, 81, 76, 88, 85, 84];
  const currentMonthlyScoreResultModel = monthlySeries[monthlySeries.length - 1] ?? 0;
  const severityKeys = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
  const severityTrendColors: Record<SeverityLevel, string> = {
    CRITICAL: "#ef4444",
    HIGH: "#f97316",
    MEDIUM: "#f59e0b",
    LOW: "#38bdf8"
  };
  const emptySeverityCounts: Record<SeverityLevel, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0
  };
  const currentOpenSeverityCounts = { ...emptySeverityCounts };

  if (currentIssueResults.length > 0 || hasAnalysisRequestLinks) {
    for (const issue of currentIssueResults) {
      currentOpenSeverityCounts[issue.severity] += 1;
    }
  } else {
    for (const issue of topIssueSummaries) {
      currentOpenSeverityCounts[issue.severity] += issue.count;
    }
  }

  const currentOpenIssueCount = severityKeys.reduce((sum, severity) => sum + currentOpenSeverityCounts[severity], 0);
  const severitySegments = severityKeys.map((severity) => {
    const count = currentOpenSeverityCounts[severity];
    const percentage = currentOpenIssueCount > 0 ? (count / currentOpenIssueCount) * 100 : 0;
    return {
      severity,
      label: severityLabelMap[severity],
      count,
      percentage,
      roundedPercentage: Math.round(percentage),
      color: severityTrendColors[severity]
    };
  });
  const maxSeveritySegmentCount = Math.max(1, ...severitySegments.map((segment) => segment.count));
  const severityBarRows = severitySegments.map((segment) => ({
    ...segment,
    heightPercentage:
      segment.count > 0 ? Math.max((segment.count / maxSeveritySegmentCount) * 100, 8) : 0
  }));
  const wcagViolationSummary = new Map<
    string,
    {
      issueCode: string;
      count: number;
      severityCounts: Record<SeverityLevel, number>;
      issueTitles: Set<string>;
      descriptions: Set<string>;
      categories: Set<string>;
    }
  >();
  const addWcagViolation = (input: {
    issueCode: string;
    issueTitle?: string;
    message?: string;
    severity: SeverityLevel;
    count: number;
  }) => {
    const issueCode = input.issueCode.trim().length > 0 ? input.issueCode.trim() : "issue-unclassified";
    const current =
      wcagViolationSummary.get(issueCode) ??
      {
        issueCode,
        count: 0,
        severityCounts: { ...emptySeverityCounts },
        issueTitles: new Set<string>(),
        descriptions: new Set<string>(),
        categories: new Set<string>()
      };

    current.count += input.count;
    current.severityCounts[input.severity] += input.count;
    current.issueTitles.add(input.issueTitle ?? issueCodeLabelMap[issueCode] ?? issueCode);
    current.descriptions.add(input.message ?? issueCodeSummaryMap[issueCode] ?? "해당 이슈 유형의 반복 발생 여부를 우선 확인해 주세요.");
    current.categories.add(getIssueCategoryKey(issueCode));
    wcagViolationSummary.set(issueCode, current);
  };

  if (currentIssueResults.length > 0 || hasAnalysisRequestLinks) {
    for (const issue of currentIssueResults) {
      addWcagViolation({
        issueCode: issue.issueCode,
        issueTitle: issue.issueTitle,
        message: issue.message,
        severity: issue.severity,
        count: 1
      });
    }
  } else {
    for (const issue of topIssueSummaries) {
      addWcagViolation({
        issueCode: issue.issueCode,
        severity: issue.severity,
        count: issue.count
      });
    }
  }

  const wcagViolationRows = [...wcagViolationSummary.values()]
    .map((row) => {
      const dominantSeverity = severityKeys.reduce((current, severity) =>
        row.severityCounts[severity] > row.severityCounts[current] ? severity : current
      );
      return {
        issueCode: row.issueCode,
        kwcagLabel: getKwcagLabel(row.issueCode),
        shortRef: row.issueCode,
        label: [...row.issueTitles][0] ?? "이슈 유형 미확인",
        description: [...row.descriptions][0] ?? "해당 이슈 유형의 반복 발생 여부를 우선 확인해 주세요.",
        categoryLabel: [...row.categories]
          .map((category) => categoryLabelMap[category] ?? category)
          .filter((category, index, categories) => categories.indexOf(category) === index)
          .join(" · "),
        count: row.count,
        dominantSeverity,
        severityLabel: severityLabelMap[dominantSeverity]
      };
    })
    .sort((a, b) => b.count - a.count || a.issueCode.localeCompare(b.issueCode));
  const wcagViolationPages = wcagViolationRows.slice(0, 5);
  const activeWcagViolationPage = Math.min(wcagViolationPage, Math.max(wcagViolationPages.length - 1, 0));
  const activeWcagViolation = wcagViolationPages[activeWcagViolationPage] ?? null;
  const canMoveWcagViolationBackward = activeWcagViolationPage > 0;
  const canMoveWcagViolationForward = activeWcagViolationPage < wcagViolationPages.length - 1;
  const handleWcagViolationPageChange = (nextPage: number) => {
    if (nextPage === activeWcagViolationPage) {
      return;
    }

    setWcagViolationDirection(nextPage > activeWcagViolationPage ? 1 : -1);
    setWcagViolationPage(nextPage);
  };
  const reportSiteEntries = data.organizations.flatMap((project) =>
    project.evaluationTargets.map((site) => ({
      project,
      site
    }))
  );
  const selectedReportSiteEntry =
    selectedReportSiteId === null ? null : reportSiteEntries.find((entry) => entry.site.id === selectedReportSiteId) ?? null;
  const selectedReportProject =
    selectedReportProjectId === null
      ? selectedReportSiteEntry?.project ?? null
      : data.organizations.find((project) => project.id === selectedReportProjectId) ?? selectedReportSiteEntry?.project ?? null;
  const selectedReportSite = selectedReportSiteEntry?.site ?? null;
  const reportSearchFilterLabel = reportSearchMode === "project" ? "프로젝트" : "사이트";
  const reportSearchToggleLabel = reportSearchMode === "project" ? "사이트" : "프로젝트";
  const reportSearchPlaceholder = reportSearchMode === "project" ? "프로젝트 이름 검색..." : "사이트 이름 검색...";
  const normalizedReportSearchQuery = reportSearchQuery.trim().toLowerCase();

  type ReportSearchOption =
    | { kind: "project"; id: number; label: string; description: string }
    | { kind: "site"; id: number; projectId: number; label: string; description: string };

  const matchesReportSearchQuery = (values: string[]) =>
    normalizedReportSearchQuery.length > 0 &&
    values.some((value) => value.toLowerCase().includes(normalizedReportSearchQuery));

  const reportSearchOptions: ReportSearchOption[] =
    normalizedReportSearchQuery.length === 0
      ? []
      : reportSearchMode === "project"
        ? data.organizations
            .filter((project) => matchesReportSearchQuery([project.name]))
            .map((project) => ({
              kind: "project" as const,
              id: project.id,
              label: project.name,
              description: `${project.evaluationTargets.length}개 사이트`
            }))
            .slice(0, 6)
        : reportSiteEntries
            .filter((entry) => {
              if (selectedReportProject && entry.project.id !== selectedReportProject.id) {
                return false;
              }
              return matchesReportSearchQuery([entry.site.name]);
            })
            .map((entry) => ({
              kind: "site" as const,
              id: entry.site.id,
              projectId: entry.project.id,
              label: entry.site.name,
              description: entry.project.name
            }))
            .slice(0, 6);

  const handleSelectReportSearchOption = (option: ReportSearchOption) => {
    if (option.kind === "project") {
      setSelectedReportProjectId(option.id);
      setSelectedReportSiteId(null);
      setReportSearchMode("site");
    } else {
      setSelectedReportProjectId(option.projectId);
      setSelectedReportSiteId(option.id);
      setReportSearchMode("site");
    }

    setReportSearchQuery("");
  };

  const reportScopeSiteIds =
    selectedReportSite !== null
      ? new Set([selectedReportSite.id])
      : selectedReportProject !== null
        ? new Set(selectedReportProject.evaluationTargets.map((site) => site.id))
        : new Set<number>();
  const reportScopeRows =
    reportScopeSiteIds.size > 0 ? scanRows.filter((row) => reportScopeSiteIds.has(row.siteId)) : scanRows;
  const latestReportScanRow = reportScopeRows.find((row) => row.totalScore !== null) ?? reportScopeRows[0] ?? null;
  const scopedLatestReportRows =
    selectedReportProject !== null && selectedReportSite === null
      ? selectedReportProject.evaluationTargets
          .map((site) => reportScopeRows.find((row) => row.siteId === site.id && row.totalScore !== null) ?? reportScopeRows.find((row) => row.siteId === site.id))
          .filter((row): row is (typeof scanRows)[number] => Boolean(row))
      : latestReportScanRow
        ? [latestReportScanRow]
        : [];
  const latestReportRequestIds = new Set(scopedLatestReportRows.map((row) => row.id));
  const latestReportIssues =
    latestReportRequestIds.size > 0 && hasAnalysisRequestLinks
      ? (data.issueResults ?? []).filter((issue) => {
          const requestId = requestIdByAnalysisResultId.get(issue.analysisResultId);
          return typeof requestId === "number" && latestReportRequestIds.has(requestId);
        })
      : [];
  const latestReportScoredRows = scopedLatestReportRows.filter((row) => row.totalScore !== null);
  const latestReportScore =
    selectedReportProject !== null && selectedReportSite === null
      ? latestReportScoredRows.length > 0
        ? Math.round(
            latestReportScoredRows.reduce((sum, row) => sum + (row.totalScore ?? 0), 0) / latestReportScoredRows.length
          )
        : null
      : latestReportScanRow?.totalScore ?? null;
  const latestReportProjectTitle = selectedReportProject?.name ?? latestReportScanRow?.project ?? "리포트 대기";
  const latestReportSiteTitle =
    selectedReportSite?.name ??
    (selectedReportProject ? `${selectedReportProject.evaluationTargets.length}개 사이트 요약` : latestReportScanRow?.site ?? "최근 평가 없음");
  const isProjectReportSummary = selectedReportProject !== null && selectedReportSite === null;
  const latestReportDate = reportScopeRows[0]?.updatedAt ?? latestReportScanRow?.updatedAt ?? null;
  const latestReportDirectSiteTarget = selectedReportSiteEntry
    ? {
        projectId: selectedReportSiteEntry.project.id,
        siteId: selectedReportSiteEntry.site.id
      }
    : latestReportScanRow && latestReportScanRow.projectId !== null
      ? {
          projectId: latestReportScanRow.projectId,
          siteId: latestReportScanRow.siteId
        }
      : null;
  const latestReportSeverityCounts = { ...emptySeverityCounts };
  const addLatestReportFinding = (input: {
    count: number;
    severity: SeverityLevel;
  }) => {
    latestReportSeverityCounts[input.severity] += input.count;
  };

  if (latestReportRequestIds.size > 0 && hasAnalysisRequestLinks) {
    for (const issue of latestReportIssues) {
      addLatestReportFinding({
        count: 1,
        severity: issue.severity
      });
    }
  } else if (latestReportScanRow) {
    for (const issue of topIssueSummaries) {
      addLatestReportFinding({
        count: issue.count,
        severity: issue.severity
      });
    }
  }

  const latestReportIssueCount = severityKeys.reduce((sum, severity) => sum + latestReportSeverityCounts[severity], 0);
  const latestReportMaxSeverityCount = Math.max(1, ...severityKeys.map((severity) => latestReportSeverityCounts[severity]));
  const latestReportSeverityBars = severityKeys.map((severity) => ({
    severity,
    label: severityLabelMap[severity],
    count: latestReportSeverityCounts[severity],
    color: severityTrendColors[severity],
    heightPercentage:
      latestReportSeverityCounts[severity] > 0
        ? Math.max((latestReportSeverityCounts[severity] / latestReportMaxSeverityCount) * 100, 12)
        : 0
  }));
  const latestReportScoreHistory =
    reportScopeSiteIds.size > 0
      ? [...data.evaluationRequests]
          .filter((request) => reportScopeSiteIds.has(request.evaluationTargetId))
          .map((request) => ({
            score: scoreByEvaluationRequestModelId.get(request.id)?.totalScore ?? null,
            time: Date.parse(request.updatedAt)
          }))
          .filter((row): row is { score: number; time: number } => row.score !== null && !Number.isNaN(row.time))
          .sort((a, b) => a.time - b.time)
          .slice(-6)
      : latestReportScanRow
        ? [...data.evaluationRequests]
            .filter((request) => request.evaluationTargetId === latestReportScanRow.siteId)
            .map((request) => ({
              score: scoreByEvaluationRequestModelId.get(request.id)?.totalScore ?? null,
              time: Date.parse(request.updatedAt)
            }))
            .filter((row): row is { score: number; time: number } => row.score !== null && !Number.isNaN(row.time))
            .sort((a, b) => a.time - b.time)
            .slice(-6)
        : [];
  const latestReportScoreTrendSeries =
    latestReportScoreHistory.length >= 2
      ? latestReportScoreHistory.map((row) => row.score)
      : latestReportScore !== null
        ? Array.from({ length: 6 }, () => latestReportScore)
        : monthlySeries.slice(-6);
  const latestReportScoreTrendLabels = latestReportScoreTrendSeries.map((_, index) => `${index + 1}`);
  const latestReportScoreTrendWidth = 220;
  const latestReportScoreTrendHeight = 82;
  const latestReportScoreTrendPoints = buildTrendChartPoints(latestReportScoreTrendSeries, latestReportScoreTrendLabels, {
    width: latestReportScoreTrendWidth,
    height: latestReportScoreTrendHeight,
    paddingLeft: 0,
    paddingRight: 0,
    centerY: 48,
    amplitude: 16,
    topY: 16,
    bottomY: 76,
    domainMin: 0,
    domainMax: 100
  });
  const latestReportScoreTrendBaseY = 82;
  const latestReportScoreTrendStartPath = buildSmoothLinePath(
    latestReportScoreTrendPoints.map((point) => ({
      ...point,
      y: latestReportScoreTrendBaseY
    }))
  );
  const latestReportScoreTrendPath = buildSmoothLinePath(latestReportScoreTrendPoints);
  const latestReportScoreTrendStartAreaPath = buildSmoothAreaPath(
    latestReportScoreTrendPoints.map((point) => ({
      ...point,
      y: latestReportScoreTrendBaseY
    })),
    latestReportScoreTrendBaseY
  );
  const latestReportScoreTrendAreaPath = buildSmoothAreaPath(latestReportScoreTrendPoints, latestReportScoreTrendBaseY);
  const monthlyChartHeight = 204;
  const monthlyChartPoints = buildTrendChartPoints(monthlySeries, monthlyLabels, {
    width: 620,
    height: monthlyChartHeight,
    paddingLeft: 0,
    paddingRight: 0,
    centerY: 112,
    amplitude: 38
  });
  const monthlyChartBaseY = monthlyChartHeight;
  const monthlyChartStartPoints = monthlyChartPoints.map((point) => ({
    ...point,
    y: monthlyChartBaseY
  }));
  const monthlyChartStartLinePath = buildSmoothLinePath(monthlyChartStartPoints);
  const monthlyChartLinePath = buildSmoothLinePath(monthlyChartPoints);
  const monthlyChartStartAreaPath = buildSmoothAreaPath(monthlyChartStartPoints, monthlyChartBaseY);
  const monthlyChartAreaPath = buildSmoothAreaPath(monthlyChartPoints, monthlyChartBaseY);
  const activeMonthlyPoint = hoveredMonthlyPoint
    ? monthlyChartPoints.find((point) => point.month === hoveredMonthlyPoint.month) ?? null
    : null;
  const monthlyAreaTopOpacity = isDarkMode ? 0.07 : 0.16;
  const monthlyAreaBottomOpacity = isDarkMode ? 0.01 : 0.05;
  const monthlyChartStroke = isDarkMode ? "rgba(255, 255, 255, 0.94)" : chartTokens.accentStrong;
  const monthlyChartAreaTopColor = isDarkMode ? "#ffffff" : chartTokens.accentStrong;
  const monthlyChartAreaBottomColor = isDarkMode ? "#ffffff" : chartTokens.accent;
  const monthlyChartPointColor = isDarkMode ? "#ffffff" : chartTokens.accentStrong;
  const monthlyChartPointGlow = isDarkMode ? "rgba(255, 255, 255, 0.18)" : "rgba(239, 106, 80, 0.16)";
  const monthlyChartLineGlow = isDarkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(239, 106, 80, 0.13)";
  const currentScoreResultModelValueColor = isDarkMode ? "#ffffff" : "#0f172a";
  const currentScoreResultModelUnitColor = isDarkMode ? "#cbd5e1" : "#64748b";
  const currentScoreResultModelLabelColor = isDarkMode ? "#94a3b8" : "#64748b";
  const getAverageScore = (selector: (scoreResult: ScoreResult) => number) =>
    data.scoreResults.length > 0
      ? Math.round(data.scoreResults.reduce((sum, scoreResult) => sum + selector(scoreResult), 0) / data.scoreResults.length)
      : 0;
  const radarRows = [
    {
      key: "cv",
      label: "시각",
      value: getAverageScore((scoreResult) => scoreResult.cvScore)
    },
    {
      key: "rule_based",
      label: "규칙",
      value: getAverageScore((scoreResult) => scoreResult.ruleScore)
    },
    {
      key: "difficulty",
      label: "텍스트",
      value: getAverageScore((scoreResult) => scoreResult.aiScore)
    }
  ];
  const radarRowsForPlot = radarRows.map((row) => ({
    ...row,
    visualValue: row.value
  }));
  const radarCenter = 130;
  const radarRadius = 96;
  const radarAxisPoints = radarRows.map((_, index) =>
    polarToCartesian(
      radarCenter,
      radarCenter,
      radarRadius,
      -90 + (360 / radarRows.length) * index
    )
  );
  const radarValuePoints = radarRowsForPlot.map((row, index) =>
    polarToCartesian(
      radarCenter,
      radarCenter,
      (radarRadius * row.visualValue) / 100,
      -90 + (360 / radarRows.length) * index
    )
  );
  const radarPolygonPath = buildClosedPolygonPath(radarValuePoints);
  const activeRadarMetric = hoveredRadarMetric
    ? radarRowsForPlot.find((row) => row.key === hoveredRadarMetric.key) ?? null
    : null;
  const activeRadarPoint = activeRadarMetric
    ? radarValuePoints[radarRowsForPlot.findIndex((row) => row.key === activeRadarMetric.key)] ?? null
    : null;
  const radarGridLevels = [0.25, 0.5, 0.75, 1];
  const radarStroke = isDarkMode ? "rgba(255, 255, 255, 0.9)" : chartTokens.accentStrong;
  const radarFill = isDarkMode ? "rgba(255, 255, 255, 0.08)" : chartTokens.accentSoft;
  const radarGridStroke = isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(148, 163, 184, 0.16)";
  const radarAxisStroke = isDarkMode ? "rgba(255, 255, 255, 0.12)" : "rgba(148, 163, 184, 0.18)";
  const radarLabelColor = isDarkMode ? "rgba(255, 255, 255, 0.72)" : "#64748b";
  const legendText = isDarkMode ? "#94a3b8" : "#64748b";
  const activeLegendText = isDarkMode ? "#dbe4f3" : "#0f172a";
  return (
    <div className="space-y-3">
      <>
          <div className="grid overflow-visible gap-3 xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
            <div className="grid min-w-0 overflow-visible gap-3 xl:grid-cols-[minmax(220px,0.8fr)_minmax(220px,0.8fr)_minmax(280px,1.4fr)] xl:grid-rows-[280px_348px] 2xl:grid-cols-[minmax(240px,0.78fr)_minmax(240px,0.78fr)_minmax(320px,1.44fr)]">
            <article className="dashboard-card relative z-10 order-1 flex h-[280px] min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-1 xl:col-span-1 xl:col-start-1 xl:row-start-1">
              <div className="relative flex items-center gap-1 px-3 pt-3">
                <p className="text-sm font-semibold leading-5 text-slate-900">월별 접근성 점수 추이</p>
                <button
                  type="button"
                  className="inline-flex h-5 w-5 shrink-0 translate-y-[1px] items-center justify-center rounded-full text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                  aria-label="월별 접근성 점수 추이 설명"
                  onMouseEnter={() => setIsMonthlyInfoVisible(true)}
                  onMouseLeave={() => setIsMonthlyInfoVisible(false)}
                  onFocus={() => setIsMonthlyInfoVisible(true)}
                  onBlur={() => setIsMonthlyInfoVisible(false)}
                >
                  <Info size={15} strokeWidth={1.9} />
                </button>
                {isMonthlyInfoVisible && (
                  <div
                    className="pointer-events-none absolute left-3 top-8 z-[130] w-56 rounded-lg bg-slate-950 px-3 py-2 text-left text-[11px] font-medium leading-relaxed text-white shadow-[0_14px_32px_rgba(2,6,23,0.28)]"
                    role="tooltip"
                  >
                    최근 월별 평가 결과의 접근성 총점을 비교해 점수 흐름을 보여줍니다.
                  </div>
                )}
              </div>
              <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-visible rounded-[28px] bg-white pt-3">
                <div className="px-4">
                  <p className="text-[11px] font-semibold tracking-[0.08em]" style={{ color: currentScoreResultModelLabelColor }}>
                    현재 점수
                  </p>
                  <p
                    className="-ml-1 mt-0.5 text-[2rem] font-bold leading-none tracking-[-0.05em]"
                    style={{ color: currentScoreResultModelValueColor }}
                  >
                    <span className="tracking-[0.035em]">{currentMonthlyScoreResultModel}</span>
                    <span className="ml-1 text-xl font-semibold tracking-normal" style={{ color: currentScoreResultModelUnitColor }}>
                      점
                    </span>
                  </p>
                </div>
              <div ref={monthlyChartRef} className="relative mt-auto h-[158px]">
                <div className="absolute inset-0 overflow-hidden rounded-b-[28px]">
                  <svg viewBox={`0 0 620 ${monthlyChartHeight}`} preserveAspectRatio="none" className="h-[158px] w-full">
                      <defs>
                        <linearGradient id="monthly-score-area" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor={monthlyChartAreaTopColor} stopOpacity={monthlyAreaTopOpacity} />
                          <stop offset="100%" stopColor={monthlyChartAreaBottomColor} stopOpacity={monthlyAreaBottomOpacity} />
                        </linearGradient>
                        <linearGradient id="monthly-score-line" x1="0" x2="1" y1="0" y2="0">
                          <stop offset="0%" stopColor={monthlyChartStroke} stopOpacity="0.72" />
                          <stop offset="50%" stopColor={monthlyChartStroke} stopOpacity="1" />
                          <stop offset="100%" stopColor={monthlyChartStroke} stopOpacity="0.86" />
                        </linearGradient>
                      </defs>
                      <motion.path
                        key="dashboard-monthly-area"
                        initial={{ d: monthlyChartStartAreaPath, opacity: 0.2 }}
                        animate={{ d: monthlyChartAreaPath, opacity: 1 }}
                        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                        fill="url(#monthly-score-area)"
                      />
                      <motion.path
                        key="dashboard-monthly-line-glow"
                        initial={{ d: monthlyChartStartLinePath }}
                        animate={{ d: monthlyChartLinePath }}
                        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                        fill="none"
                        stroke={monthlyChartLineGlow}
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <motion.path
                        key="dashboard-monthly-line"
                        initial={{ d: monthlyChartStartLinePath }}
                        animate={{ d: monthlyChartLinePath }}
                        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                        fill="none"
                        stroke="url(#monthly-score-line)"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {monthlyChartPoints.map((point) => (
                        <g key={point.month}>
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r={10}
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseMove={(event) => {
                              const tooltipPosition = getFloatingMonthlyTooltipPosition(event.clientX + 12, event.clientY - 18);
                              setHoveredMonthlyPoint({
                                month: point.month,
                                score: point.score,
                                x: tooltipPosition.x,
                                y: tooltipPosition.y
                              });
                            }}
                            onMouseLeave={() => setHoveredMonthlyPoint(null)}
                          />
                        </g>
                      ))}
                  </svg>
                  {activeMonthlyPoint && hoveredMonthlyPoint && (
                    <>
                      <span
                        className="pointer-events-none absolute h-5 w-5 rounded-full"
                        style={{
                          left: `${(activeMonthlyPoint.x / 620) * 100}%`,
                          top: `${(activeMonthlyPoint.y / monthlyChartHeight) * 100}%`,
                          transform: "translate(-50%, -50%)",
                          backgroundColor: monthlyChartPointGlow
                        }}
                      />
                      <span
                        className="pointer-events-none absolute h-2.5 w-2.5 rounded-full"
                        style={{
                          left: `${(activeMonthlyPoint.x / 620) * 100}%`,
                          top: `${(activeMonthlyPoint.y / monthlyChartHeight) * 100}%`,
                          transform: "translate(-50%, -50%)",
                          backgroundColor: monthlyChartPointColor
                        }}
                      />
                    </>
                  )}
                </div>
                {activeMonthlyPoint && hoveredMonthlyPoint && typeof document !== "undefined" && createPortal(
                  <div
                    role="tooltip"
                    className="pointer-events-none fixed z-[9999] min-w-24 rounded-lg px-3 py-2 text-left"
                    style={{
                      left: hoveredMonthlyPoint.x,
                      top: hoveredMonthlyPoint.y,
                      backgroundColor: "rgba(8, 8, 10, 0.96)",
                      border: "1px solid rgba(255, 255, 255, 0.08)"
                    }}
                  >
                    <p className="text-[11px] font-semibold" style={{ color: chartTokens.tooltipSubtle }}>
                      {hoveredMonthlyPoint.month}
                    </p>
                    <p className="mt-1 text-sm font-bold" style={{ color: chartTokens.tooltipText }}>
                      {hoveredMonthlyPoint.score}점
                    </p>
                  </div>,
                  document.body
                )}
              </div>
              </div>
            </article>

            <div className="order-2 grid h-[280px] min-h-0 gap-3 lg:grid-cols-2 xl:col-span-2 xl:col-start-2 xl:row-start-1">
            <CurrentOpenIssuesCard
              issueCount={currentOpenIssueCount}
              rows={severityBarRows}
              labelColor={currentScoreResultModelLabelColor}
              valueColor={currentScoreResultModelValueColor}
              unitColor={currentScoreResultModelUnitColor}
            />

            <article className="dashboard-card relative flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-1">
              <div className="flex min-h-[30px] items-start justify-between gap-3 px-4 pt-3">
                <div className="min-w-0">
                  <div className="relative flex items-center gap-1">
                    <p className="text-sm font-semibold leading-5 text-slate-900">반복 이슈 유형</p>
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 shrink-0 translate-y-[1px] items-center justify-center rounded-full text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      aria-label="반복 이슈 유형 설명"
                      onMouseEnter={() => setIsWcagInfoVisible(true)}
                      onMouseLeave={() => setIsWcagInfoVisible(false)}
                      onFocus={() => setIsWcagInfoVisible(true)}
                      onBlur={() => setIsWcagInfoVisible(false)}
                    >
                      <Info size={15} strokeWidth={1.9} />
                    </button>
                    {isWcagInfoVisible && (
                      <div
                        className="pointer-events-none absolute left-3 top-8 z-[130] w-64 rounded-lg bg-slate-950 px-3 py-2 text-left text-[11px] font-medium leading-relaxed text-white shadow-[0_14px_32px_rgba(2,6,23,0.28)]"
                        role="tooltip"
                      >
                        이슈 코드별 미해결 건수를 발생 건수가 많은 순서로 보여줍니다.
                      </div>
                    )}
                  </div>
                </div>
                {wcagViolationPages.length > 1 && (
                  <nav className="flex shrink-0 items-center gap-1" aria-label="반복 이슈 유형 이동">
                    <button
                      type="button"
                      aria-label="이전 반복 이슈 유형"
                      disabled={!canMoveWcagViolationBackward}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full bg-transparent transition disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 ${
                        isDarkMode
                          ? "text-slate-500 hover:bg-white/10 hover:text-slate-100 focus-visible:bg-white/10 focus-visible:ring-white/15"
                          : "text-slate-600 hover:bg-slate-200/80 focus-visible:bg-slate-200/80 focus-visible:ring-slate-300"
                      }`}
                      onClick={() => handleWcagViolationPageChange(activeWcagViolationPage - 1)}
                    >
                      <svg width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path
                          d="M22.499 12.85a.9.9 0 0 1 .57.205l.067.06a.9.9 0 0 1 .06 1.206l-.06.066-5.585 5.586-.028.027.028.027 5.585 5.587a.9.9 0 0 1 .06 1.207l-.06.066a.9.9 0 0 1-1.207.06l-.066-.06-6.25-6.25a1 1 0 0 1-.158-.212l-.038-.08a.9.9 0 0 1-.03-.606l.03-.083a1 1 0 0 1 .137-.226l.06-.066 6.25-6.25a.9.9 0 0 1 .635-.263Z"
                          fill="currentColor"
                          stroke="currentColor"
                          strokeWidth=".078"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label="다음 반복 이슈 유형"
                      disabled={!canMoveWcagViolationForward}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full bg-transparent transition disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 ${
                        isDarkMode
                          ? "text-slate-500 hover:bg-white/10 hover:text-slate-100 focus-visible:bg-white/10 focus-visible:ring-white/15"
                          : "text-slate-600 hover:bg-slate-200/80 focus-visible:bg-slate-200/80 focus-visible:ring-slate-300"
                      }`}
                      onClick={() => handleWcagViolationPageChange(activeWcagViolationPage + 1)}
                    >
                      <svg className="rotate-180" width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path
                          d="M22.499 12.85a.9.9 0 0 1 .57.205l.067.06a.9.9 0 0 1 .06 1.206l-.06.066-5.585 5.586-.028.027.028.027 5.585 5.587a.9.9 0 0 1 .06 1.207l-.06.066a.9.9 0 0 1-1.207.06l-.066-.06-6.25-6.25a1 1 0 0 1-.158-.212l-.038-.08a.9.9 0 0 1-.03-.606l.03-.083a1 1 0 0 1 .137-.226l.06-.066 6.25-6.25a.9.9 0 0 1 .635-.263Z"
                          fill="currentColor"
                          stroke="currentColor"
                          strokeWidth=".078"
                        />
                      </svg>
                    </button>
                  </nav>
                )}
              </div>

              {activeWcagViolation ? (
                <div className="relative mt-2 flex min-h-0 flex-1 flex-col">
                  <motion.div
                    key={activeWcagViolation.issueCode}
                    custom={wcagViolationDirection}
                    variants={wcagPageTransitionVariants}
                    initial="enter"
                    animate="center"
                    transition={{ duration: 0.24, ease: "easeOut" }}
                    className="flex min-h-0 flex-1 flex-col rounded-[28px] bg-white pt-3"
                  >
                    <div className="flex h-full flex-col px-5">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold tracking-[0.08em]" style={{ color: "#64748b" }}>
                          {activeWcagViolation.kwcagLabel}
                        </p>
                        <p className="mt-1 text-[1.75rem] font-bold leading-none text-slate-900">
                          {activeWcagViolation.count}
                          <span className="ml-1 text-xl font-semibold tracking-normal" style={{ color: currentScoreResultModelUnitColor }}>
                            건
                          </span>
                        </p>
                      </div>
                      <div className="mt-auto min-w-0 translate-y-[-24px]">
                        <p
                          className="line-clamp-1 text-[1.42rem] font-bold leading-tight text-slate-900"
                          title={activeWcagViolation.label}
                        >
                          {activeWcagViolation.label}
                        </p>
                        <p className="mt-2 line-clamp-2 text-[17px] font-medium leading-relaxed" style={{ color: "#64748b" }}>
                          {activeWcagViolation.description}
                        </p>
                      </div>
                    </div>
                  </motion.div>

                </div>
              ) : (
                <div className="mt-2 flex min-h-0 flex-1 items-center justify-center rounded-[28px] bg-white p-2 text-sm font-semibold text-slate-500">
                  표시할 반복 이슈 유형이 없습니다.
                </div>
              )}
            </article>
            </div>

              <article className="dashboard-card order-4 flex h-[348px] min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-1 xl:col-span-1 xl:col-start-2 xl:row-start-2">
                <div className="min-h-[36px] px-3 pt-3">
                  <div className="relative flex items-center gap-1">
                    <p className="text-sm font-semibold leading-5 text-slate-900">분석 유형별 평균 점수</p>
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 shrink-0 translate-y-[1px] items-center justify-center rounded-full text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      aria-label="분석 유형별 평균 점수 설명"
                      onMouseEnter={() => setIsAverageScoreInfoVisible(true)}
                      onMouseLeave={() => setIsAverageScoreInfoVisible(false)}
                      onFocus={() => setIsAverageScoreInfoVisible(true)}
                      onBlur={() => setIsAverageScoreInfoVisible(false)}
                    >
                      <Info size={15} strokeWidth={1.9} />
                    </button>
                    {isAverageScoreInfoVisible && (
                      <div
                        className="pointer-events-none absolute left-0 top-7 z-[130] w-64 rounded-lg bg-slate-950 px-3 py-2 text-left text-[11px] font-medium leading-relaxed text-white shadow-[0_14px_32px_rgba(2,6,23,0.28)]"
                        role="tooltip"
                      >
                        전체 평가 결과를 기준으로 시각 기반, 규칙 기반, 텍스트 기반 평균 점수를 비교해 보여줍니다.
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-1 flex min-h-0 flex-1 flex-col rounded-[28px] bg-transparent px-2 py-1">
                <div ref={radarChartRef} className="relative flex min-w-0 flex-1 items-center justify-center pt-0">
                  <div className="relative h-[242px] w-[242px]">
                    <motion.svg
                      viewBox="0 0 260 260"
                      className="h-full w-full overflow-visible"
                      initial={{ opacity: 0, y: 10, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {radarGridLevels.map((level) => {
                        const points = radarRows.map((_, index) =>
                          polarToCartesian(
                            radarCenter,
                            radarCenter,
                            radarRadius * level,
                            -90 + (360 / radarRows.length) * index
                          )
                        );

                        return (
                          <path
                            key={level}
                            d={buildClosedPolygonPath(points)}
                            fill="none"
                            stroke={radarGridStroke}
                            strokeWidth="1"
                          />
                        );
                      })}

                      {radarAxisPoints.map((point, index) => (
                        <line
                          key={radarRows[index]!.key}
                          x1={radarCenter}
                          y1={radarCenter}
                          x2={point.x}
                          y2={point.y}
                          stroke={radarAxisStroke}
                          strokeWidth="1"
                        />
                      ))}

                      <motion.path
                        d={radarPolygonPath}
                        fill={radarFill}
                        stroke={radarStroke}
                        strokeWidth="2.2"
                        initial={{ opacity: 0, pathLength: 0 }}
                        animate={{ opacity: 1, pathLength: 1 }}
                        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
                      />

                      {activeRadarPoint && (
                        <>
                          <circle cx={activeRadarPoint.x} cy={activeRadarPoint.y} r="8" fill={isDarkMode ? "rgba(255,255,255,0.12)" : chartTokens.accentSoft} />
                          <circle cx={activeRadarPoint.x} cy={activeRadarPoint.y} r="4" fill={radarStroke} />
                        </>
                      )}

                      {radarValuePoints.map((point, index) => (
                        <circle
                          key={`${radarRows[index]!.key}-target`}
                          cx={point.x}
                          cy={point.y}
                          r="12"
                          fill="transparent"
                          className="cursor-pointer"
                          onMouseMove={(event) => {
                            const rect = radarChartRef.current?.getBoundingClientRect();
                            if (!rect) {
                              return;
                            }
                            setHoveredRadarMetric({
                              key: radarRows[index]!.key,
                              label: radarRows[index]!.label,
                              value: radarRows[index]!.value,
                              x: event.clientX - rect.left + 12,
                              y: event.clientY - rect.top - 18
                            });
                          }}
                          onMouseLeave={() => setHoveredRadarMetric(null)}
                        />
                      ))}

                      {radarAxisPoints.map((point, index) => (
                        <text
                          key={`${radarRows[index]!.key}-label`}
                          x={point.x}
                          y={point.y}
                          dy={point.y < radarCenter ? -10 : point.y > radarCenter ? 16 : 4}
                          dx={point.x < radarCenter ? -6 : point.x > radarCenter ? 6 : 0}
                          textAnchor={
                            point.x < radarCenter ? "end" : point.x > radarCenter ? "start" : "middle"
                          }
                          fill={radarLabelColor}
                          fontSize="12.5"
                          fontWeight="600"
                        >
                          {radarRows[index]!.label}
                        </text>
                      ))}
                    </motion.svg>
                  </div>
                  {hoveredRadarMetric && (
                    <div
                      className="pointer-events-none absolute z-20 min-w-24 rounded-lg px-3 py-2 text-left"
                      style={{
                        left: hoveredRadarMetric.x,
                        top: hoveredRadarMetric.y,
                        backgroundColor: "rgba(8, 8, 10, 0.96)",
                        border: "1px solid rgba(255, 255, 255, 0.08)"
                      }}
                    >
                      <p className="text-[11px] font-semibold" style={{ color: chartTokens.tooltipSubtle }}>
                        {hoveredRadarMetric.label}
                      </p>
                      <p className="mt-1 text-sm font-bold" style={{ color: chartTokens.tooltipText }}>
                        {hoveredRadarMetric.value}점
                      </p>
                    </div>
                  )}
                </div>
                </div>
              </article>

              <article className="dashboard-card order-5 flex h-[348px] min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-1 xl:col-span-1 xl:col-start-3 xl:row-start-2">
                <div className="min-h-[36px] px-3 pt-3">
                  <p className="text-sm font-semibold text-slate-900">접근성 평가 리포트 요약</p>
                </div>
                <div className="mx-auto mt-6 flex w-[90%] max-w-[620px] items-center gap-3">
                  <div className="relative flex min-w-[240px] max-w-[440px] flex-1 items-center gap-2">
                    <button
                      type="button"
                      aria-label="리포트 검색"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                      onClick={() => reportSearchInputRef.current?.focus()}
                    >
                      <Search aria-hidden="true" className="h-4 w-4" strokeWidth={1.9} />
                    </button>
                    <div className="flex h-9 min-w-0 flex-1 items-center rounded-xl bg-white px-2">
                      <span className="inline-flex h-7 shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700">
                        {reportSearchFilterLabel}
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#ef6a50]" />
                      </span>
                      <input
                        ref={reportSearchInputRef}
                        type="search"
                        aria-label={`${reportSearchFilterLabel} 검색`}
                        value={reportSearchQuery}
                        onChange={(event) => setReportSearchQuery(event.target.value)}
                        placeholder={reportSearchPlaceholder}
                        className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400 focus:ring-0"
                      />
                    </div>
                    {normalizedReportSearchQuery.length > 0 && (
                      <div className="report-search-popover absolute left-0 top-11 z-[140] w-full overflow-hidden rounded-xl border border-slate-200 text-left shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
                        {reportSearchOptions.length > 0 ? (
                          reportSearchOptions.map((option) => (
                            <button
                              key={`${option.kind}-${option.id}`}
                              type="button"
                              className="report-search-option block w-full px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-200"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                handleSelectReportSearchOption(option);
                              }}
                              onClick={() => handleSelectReportSearchOption(option)}
                            >
                              <span className="report-search-option-title block truncate text-xs font-bold">{option.label}</span>
                              <span className="report-search-option-description mt-0.5 block truncate text-[11px] font-medium">
                                {option.description}
                              </span>
                            </button>
                          ))
                        ) : (
                          <p className="px-3 py-2 text-xs font-medium" style={{ color: "#64748b" }}>
                            검색 결과가 없습니다.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`${reportSearchToggleLabel} 검색으로 변경`}
                    onClick={() => {
                      setReportSearchMode((current) => (current === "project" ? "site" : "project"));
                      setReportSearchQuery("");
                      reportSearchInputRef.current?.focus();
                    }}
                    className="inline-flex h-8 shrink-0 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
                  >
                    {reportSearchToggleLabel}
                  </button>
                  <button
                    type="button"
                    aria-label="현재 리포트 사이트로 들어가기"
                    disabled={!latestReportDirectSiteTarget}
                    onClick={() => {
                      if (!latestReportDirectSiteTarget) {
                        return;
                      }
                      onSiteClick(latestReportDirectSiteTarget);
                    }}
                    className="inline-flex h-8 w-14 shrink-0 items-center justify-center rounded-full bg-[#ef6a50] text-white disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef6a50]/35"
                  >
                    <MoveRight aria-hidden="true" className="h-5 w-7" strokeWidth={2.1} />
                  </button>
                </div>
                <div className="mx-auto mt-auto mb-6 grid h-[198px] min-h-0 w-[90%] max-w-[620px] grid-cols-3 gap-4">
                  <div className="relative flex min-w-0 flex-col overflow-hidden rounded-[28px] bg-white p-4">
                    <div className="min-w-0">
                      {!isProjectReportSummary && (
                        <p className="truncate text-xs font-semibold" style={{ color: "#64748b" }} title={latestReportProjectTitle}>
                          {latestReportProjectTitle}
                        </p>
                      )}
                      <p
                        className={`${isProjectReportSummary ? "mt-0" : "mt-2"} line-clamp-2 text-[1.25rem] font-bold leading-tight tracking-[-0.02em] text-slate-900`}
                        title={isProjectReportSummary ? latestReportProjectTitle : latestReportSiteTitle}
                      >
                        {isProjectReportSummary ? latestReportProjectTitle : latestReportSiteTitle}
                      </p>
                      <span className="mt-4 block h-1.5 w-14 rounded-full bg-[#ef6a50]" />
                    </div>
                    <div className="mt-auto min-w-0">
                      <p className="text-[10px] font-semibold" style={{ color: "#64748b" }}>평가일</p>
                      <p className="mt-1 truncate text-xs font-bold text-slate-900">
                        {formatDateOnly(latestReportDate)}
                      </p>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-col overflow-hidden rounded-[28px] bg-white">
                    <div className="relative z-10 px-4 pt-4">
                      <p className="text-[11px] font-semibold" style={{ color: "#64748b" }}>현재 점수</p>
                      <p className="-ml-0.5 mt-0.5 text-[2.2rem] font-bold leading-none tracking-[-0.05em] text-slate-900">
                        {latestReportScore ?? "-"}
                        {latestReportScore !== null && (
                          <span className="ml-1 text-lg font-semibold tracking-normal" style={{ color: "#64748b" }}>점</span>
                        )}
                      </p>
                    </div>

                    <div className="relative mt-auto h-[116px] min-w-0 overflow-hidden">
                      <svg
                        viewBox={`0 0 ${latestReportScoreTrendWidth} ${latestReportScoreTrendHeight}`}
                        preserveAspectRatio="none"
                        className="absolute inset-0 h-full w-full"
                        role="img"
                        aria-label={`최근 접근성 점수 추이. 현재 ${latestReportScore ?? 0}점`}
                      >
                        <defs>
                          <linearGradient id="latest-report-score-area" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor={monthlyChartAreaTopColor} stopOpacity={monthlyAreaTopOpacity} />
                            <stop offset="100%" stopColor={monthlyChartAreaBottomColor} stopOpacity={monthlyAreaBottomOpacity} />
                          </linearGradient>
                          <linearGradient id="latest-report-score-line" x1="0" x2="1" y1="0" y2="0">
                            <stop offset="0%" stopColor={monthlyChartStroke} stopOpacity="0.72" />
                            <stop offset="50%" stopColor={monthlyChartStroke} stopOpacity="1" />
                            <stop offset="100%" stopColor={monthlyChartStroke} stopOpacity="0.86" />
                          </linearGradient>
                        </defs>
                        <motion.path
                          d={latestReportScoreTrendAreaPath}
                          initial={{ d: latestReportScoreTrendStartAreaPath }}
                          animate={{ d: latestReportScoreTrendAreaPath }}
                          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                          fill="url(#latest-report-score-area)"
                        />
                        <motion.path
                          d={latestReportScoreTrendPath}
                          initial={{ d: latestReportScoreTrendStartPath }}
                          animate={{ d: latestReportScoreTrendPath }}
                          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                          fill="none"
                          stroke={monthlyChartLineGlow}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="5"
                        />
                        <motion.path
                          d={latestReportScoreTrendPath}
                          initial={{ d: latestReportScoreTrendStartPath }}
                          animate={{ d: latestReportScoreTrendPath }}
                          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                          fill="none"
                          stroke="url(#latest-report-score-line)"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                        />
                      </svg>
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-col overflow-hidden rounded-[28px] bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold" style={{ color: "#64748b" }}>심각도별 문제</p>
                      <p className="shrink-0 text-sm font-bold text-slate-900">
                        {latestReportIssueCount}
                        <span className="ml-0.5 text-[11px] font-semibold" style={{ color: "#64748b" }}>건</span>
                      </p>
                    </div>

                    <div className="mt-auto h-[122px]">
                      <div className="relative h-[78px] border-b border-slate-200/70">
                        <div className="grid h-full grid-cols-4 items-end gap-3 pb-0">
                          {latestReportSeverityBars.map((bar) => (
                            <div key={bar.severity} className="flex h-full min-w-0 items-end justify-center">
                              <motion.div
                                className="w-5 rounded-md"
                                style={{ backgroundColor: bar.color }}
                                initial={{ height: 0 }}
                                animate={{ height: `${bar.heightPercentage}%` }}
                                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-3 pt-3 text-center">
                        {latestReportSeverityBars.map((bar) => (
                          <div key={`${bar.severity}-label`} className="min-w-0">
                            <p className="text-xs font-bold leading-none text-slate-900">
                              {bar.count}
                            </p>
                            <p className="mt-1 truncate text-[9px] font-semibold" style={{ color: "#64748b" }}>
                              {bar.label}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article className="dashboard-card order-3 flex h-[348px] min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-1 xl:col-span-1 xl:col-start-1 xl:row-start-2">
                <div className="min-h-[36px] px-3 pt-3">
                  <div className="relative flex items-center gap-1">
                    <p className="text-sm font-semibold leading-5 text-slate-900">이슈 분야별 비율</p>
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 shrink-0 translate-y-[1px] items-center justify-center rounded-full text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                      aria-label="이슈 분야별 비율 설명"
                      onMouseEnter={() => setIsIssueRatioInfoVisible(true)}
                      onMouseLeave={() => setIsIssueRatioInfoVisible(false)}
                      onFocus={() => setIsIssueRatioInfoVisible(true)}
                      onBlur={() => setIsIssueRatioInfoVisible(false)}
                    >
                      <Info size={15} strokeWidth={1.9} />
                    </button>
                    {isIssueRatioInfoVisible && (
                      <div
                        className="pointer-events-none absolute left-0 top-7 z-[130] w-60 rounded-lg bg-slate-950 px-3 py-2 text-left text-[11px] font-medium leading-relaxed text-white shadow-[0_14px_32px_rgba(2,6,23,0.28)]"
                        role="tooltip"
                      >
                        현재 집계된 이슈를 접근성 분야별 비중으로 나눠 보여줍니다.
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-1 flex min-h-0 flex-1 flex-col rounded-[28px] bg-transparent p-3">
                <div
                  ref={issueChartRef}
                  className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-0"
                >
                  <>
                    <div className="flex h-[174px] min-w-0 items-center justify-center self-center overflow-visible">
                      <motion.svg
                        key={issueAnimationKey}
                        viewBox="0 0 260 260"
                        className="h-[174px] w-[174px]"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.2, ease: "linear" }}
                          style={{ transform: "rotate(-90deg) scaleX(-1)", transformOrigin: "50% 50%" }}
                        >
                          <defs>
                            <mask id={issueMaskId}>
                              <rect x="0" y="0" width="260" height="260" fill="black" />
                              <motion.circle
                                cx="130"
                                cy="130"
                                r={donutRadius}
                                fill="none"
                                stroke="white"
                                strokeWidth="42"
                                strokeDasharray={`${donutCircumference} ${donutCircumference}`}
                                initial={{ strokeDashoffset: donutCircumference }}
                                animate={{ strokeDashoffset: 0 }}
                                transition={{ duration: 0.95, ease: "linear" }}
                              />
                            </mask>
                          </defs>
                          <circle
                            cx="130"
                            cy="130"
                            r={donutRadius}
                            fill="none"
                            stroke="rgba(148, 163, 184, 0.08)"
                            strokeWidth="22"
                          />
                          {donutSegments.map((segment) => (
                            <circle
                              key={segment.category}
                              cx="130"
                              cy="130"
                              r={donutRadius}
                              fill="none"
                              stroke={segment.color}
                              strokeOpacity={hoveredIssueInfo?.category === segment.category ? 0.88 : 0.68}
                              strokeWidth={hoveredIssueInfo?.category === segment.category ? 28 : 22}
                              strokeDasharray={`${segment.dash} ${donutCircumference - segment.dash}`}
                              strokeDashoffset={segment.offset}
                              strokeLinecap="butt"
                              mask={`url(#${issueMaskId})`}
                              className="cursor-pointer transition-all duration-150"
                              onMouseMove={(event) => {
                                const rect = issueChartRef.current?.getBoundingClientRect();
                                if (!rect) {
                                  return;
                                }
                                setHoveredIssueInfo({
                                  category: segment.category,
                                  x: event.clientX - rect.left + 18,
                                  y: event.clientY - rect.top - 16
                                });
                              }}
                              onMouseLeave={() => setHoveredIssueInfo(null)}
                            />
                          ))}
                        </motion.svg>
                      </div>

                      <div className="grid w-full max-w-[300px] grid-cols-2 items-center justify-items-center gap-x-4 gap-y-1 text-center">
                        {donutSegments.map((segment) => (
                          <div
                            key={segment.category}
                            className="flex items-center justify-center gap-1.5 px-1 py-0.5 text-[11px] transition-colors"
                            style={{
                              color:
                                hoveredIssueInfo?.category === segment.category ? activeLegendText : legendText
                            }}
                          >
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: segment.color }}
                            />
                            <span className="whitespace-nowrap font-medium">{segment.label}</span>
                            <span className="font-bold">{segment.percentage}%</span>
                          </div>
                        ))}
                      </div>

                      {activeDonutCategory && hoveredIssueInfo && (
                        <div
                          className="pointer-events-none absolute z-20 min-w-28 rounded-lg px-3 py-3 text-left"
                          style={{
                            left: hoveredIssueInfo.x,
                            top: hoveredIssueInfo.y,
                            backgroundColor: "rgba(8, 8, 10, 0.96)",
                            border: "1px solid rgba(255, 255, 255, 0.08)"
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: activeDonutCategory.color }}
                            />
                            <p className="text-sm font-semibold" style={{ color: chartTokens.tooltipText }}>
                              {activeDonutCategory.label}
                            </p>
                          </div>
                          <p className="mt-2 text-2xl font-bold" style={{ color: chartTokens.tooltipText }}>
                            {activeDonutCategory.percentage}%
                          </p>
                          <p className="text-[11px]" style={{ color: chartTokens.tooltipSubtle }}>
                            {activeDonutCategory.count}건
                          </p>
                        </div>
                      )}

                    </>
                </div>
                </div>
              </article>
            </div>

            <RecentScanJobsCard rows={scanRows} onSiteClick={onSiteClick} />
          </div>
      </>
    </div>
  );
}

