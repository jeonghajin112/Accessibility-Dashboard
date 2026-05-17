import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import type {
  AnalysisResult,
  EvaluationTargetModel,
  EvaluationRequestModel,
  IssueResultModel,
  OrganizationModel,
  ScoreResult
} from "@/types/accessibility-domain";

import { categoryLabelMap, chartTokens } from "../shared/constants";
import { PanelMessage, renderTargetTypeIcon } from "../shared/display";
import { useDialogAccessibility } from "../shared/use-dialog-accessibility";
import {
  buildSmoothLinePath,
  buildTrendChartPoints,
  formatDateOnly,
  formatMonthShortLabel,
  formatDateTime,
  mapScanStatus,
  toMonthKey
} from "../shared/utils";

type ProjectDetailTab = "summary" | "sites" | "reports";
type ProjectDetailSiteSortKey = "targetType" | "siteName" | "score" | "updatedAt";

function getIssueCategoryKey(issueCode: string): "perceivable" | "operable" | "understandable" | "robust" {
  if (issueCode.includes("contrast") || issueCode.includes("alt")) {
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

function compareMonthKeys(left: string, right: string): number {
  return left.localeCompare(right);
}

function addMonthsToMonthKey(monthKey: string, offset: number): string {
  const [yearValue, monthValue] = monthKey.split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return monthKey;
  }

  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildFixedMonthWindow(startMonth: string, months: number): string[] {
  const result: string[] = [];
  let current = startMonth;

  for (let index = 0; index < months; index += 1) {
    result.push(current);
    current = addMonthsToMonthKey(current, 1);
  }

  return result;
}

export function OrganizationModelDetailPanel({
  organization,
  evaluationRequests,
  analysisResults,
  scoreResults,
  issueResults,
  isDarkMode,
  onOpenCreateSiteModal,
  onSiteClick,
  onUpdateEvaluationTargetModel,
  onDeleteEvaluationTargetModel
}: {
  organization: OrganizationModel;
  evaluationRequests: EvaluationRequestModel[];
  analysisResults: AnalysisResult[];
  scoreResults: ScoreResult[];
  issueResults: IssueResultModel[];
  isDarkMode: boolean;
  onOpenCreateSiteModal: () => void;
  onSiteClick: (siteId: number) => void;
  onUpdateEvaluationTargetModel: (input: {
    projectId: number;
    siteId: number;
    name: string;
    accessUrl: string;
  }) => Promise<void>;
  onDeleteEvaluationTargetModel: (input: { projectId: number; siteId: number }) => Promise<void>;
}) {
  const [activeTab] = useState<ProjectDetailTab>("sites");
  const [siteSortConfig, setSiteSortConfig] = useState<{
    key: ProjectDetailSiteSortKey;
    direction: "asc" | "desc";
  }>({
    key: "updatedAt",
    direction: "desc"
  });
  const [editingEvaluationTargetModel, setEditingEvaluationTargetModel] = useState<EvaluationTargetModel | null>(null);
  const [editSiteName, setEditSiteName] = useState("");
  const [editSiteBaseUrl, setEditSiteBaseUrl] = useState("");
  const [editEvaluationTargetError, setEditEvaluationTargetError] = useState("");
  const [isSavingEvaluationTarget, setIsSavingEvaluationTarget] = useState(false);
  const [deletingEvaluationTargetModel, setDeletingEvaluationTargetModel] = useState<EvaluationTargetModel | null>(null);
  const [deleteEvaluationTargetError, setDeleteEvaluationTargetError] = useState("");
  const [isDeletingEvaluationTarget, setIsDeletingEvaluationTarget] = useState(false);
  const [hoveredMonthlyPoint, setHoveredMonthlyPoint] = useState<{
    month: string;
    score: number | null;
    x: number;
    y: number;
  } | null>(null);

  const projectChartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setHoveredMonthlyPoint(null);
  }, [activeTab]);

  const evaluationTargetIds = new Set(organization.evaluationTargets.map((target) => target.id));
  const organizationEvaluationRequests = evaluationRequests.filter((request) =>
    evaluationTargetIds.has(request.evaluationTargetId)
  );
  const latestScanBySiteId = new Map<number, EvaluationRequestModel>();
  for (const evaluationRequest of organizationEvaluationRequests) {
    const existing = latestScanBySiteId.get(evaluationRequest.evaluationTargetId);
    if (!existing) {
      latestScanBySiteId.set(evaluationRequest.evaluationTargetId, evaluationRequest);
      continue;
    }

    const currentTime = Date.parse(evaluationRequest.updatedAt);
    const existingTime = Date.parse(existing.updatedAt);
    if (currentTime > existingTime) {
      latestScanBySiteId.set(evaluationRequest.evaluationTargetId, evaluationRequest);
    }
  }
  const latestEvaluationRequestIds = new Set(Array.from(latestScanBySiteId.values()).map((request) => request.id));
  const evaluationRequestById = new Map(organizationEvaluationRequests.map((request) => [request.id, request]));
  const organizationEvaluationRequestIds = new Set(organizationEvaluationRequests.map((request) => request.id));
  const requestIdByAnalysisResultId = new Map(
    analysisResults.map((analysisResult) => [analysisResult.id, analysisResult.evaluationRequestId])
  );
  const organizationIssueResults = issueResults.filter((issue) => {
    const requestId = requestIdByAnalysisResultId.get(issue.analysisResultId);
    return typeof requestId === "number" && organizationEvaluationRequestIds.has(requestId);
  });
  const latestOrganizationIssueResults = issueResults.filter((issue) => {
    const requestId = requestIdByAnalysisResultId.get(issue.analysisResultId);
    return typeof requestId === "number" && latestEvaluationRequestIds.has(requestId);
  });
  const projectIssueCount = latestOrganizationIssueResults.length;
  const scoreByEvaluationRequestId = new Map(scoreResults.map((scoreResult) => [scoreResult.evaluationRequestId, scoreResult]));

  const scoredOrganizationRequests = organizationEvaluationRequests
    .map((request) => {
      const scoreResult = scoreByEvaluationRequestId.get(request.id);
      return {
        request,
        scoreResult: scoreResult ?? null,
        totalScore: scoreResult?.totalScore ?? null,
        timestamp: Date.parse(request.updatedAt)
      };
    })
    .filter(
      (
        item
      ): item is {
        request: EvaluationRequestModel;
        scoreResult: ScoreResult;
        totalScore: number;
        timestamp: number;
      } => typeof item.totalScore === "number" && item.scoreResult !== null
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const completedScores = scoredOrganizationRequests.map((item) => item.totalScore);
  const averageScore = completedScores.length
    ? Math.round(completedScores.reduce((sum, value) => sum + value, 0) / completedScores.length)
    : 0;
  const latestScoredRequest = scoredOrganizationRequests[scoredOrganizationRequests.length - 1] ?? null;
  const latestScore = latestScoredRequest?.totalScore ?? averageScore;
  const analysisScorePalette = ["#111111", "#ef6a50", "#38bdf8"];
  const breakdownGaugePalette = ["#34d399", "#38bdf8", "#f59e0b", "#8b5cf6"];
  const summaryTotalScore = latestScoredRequest ? latestScore : null;
  const summaryUpdatedDate = formatDateOnly(organization.updatedAt);
  const summaryAnalysisScoreRows = [
    {
      key: "rule",
      label: "규칙 기반",
      score: latestScoredRequest?.scoreResult.ruleScore ?? null,
      color: analysisScorePalette[0]
    },
    {
      key: "ai",
      label: "AI 분석",
      score: latestScoredRequest?.scoreResult.aiScore ?? null,
      color: analysisScorePalette[1]
    },
    {
      key: "cv",
      label: "시각 분석",
      score: latestScoredRequest?.scoreResult.cvScore ?? null,
      color: analysisScorePalette[2]
    }
  ];
  const projectIssueCountMap = new Map<string, number>();
  for (const issue of organizationIssueResults) {
    const categoryKey = getIssueCategoryKey(issue.issueCode);
    projectIssueCountMap.set(categoryKey, (projectIssueCountMap.get(categoryKey) ?? 0) + 1);
  }
  const projectIssueRows = (["perceivable", "robust", "operable", "understandable"] as const).map((key, index) => ({
    key,
    label: categoryLabelMap[key] ?? key,
    count: projectIssueCountMap.get(key) ?? 0,
    color: breakdownGaugePalette[index % breakdownGaugePalette.length]
  }));
  const maxProjectIssueCount = Math.max(1, ...projectIssueRows.map((row) => row.count));
  const issueCountsByMonth = new Map<string, number>();
  for (const issue of organizationIssueResults) {
    const requestId = requestIdByAnalysisResultId.get(issue.analysisResultId);
    const evaluationRequest = typeof requestId === "number" ? evaluationRequestById.get(requestId) : null;
    const monthKey = toMonthKey(evaluationRequest?.updatedAt ?? issue.createdAt);
    issueCountsByMonth.set(monthKey, (issueCountsByMonth.get(monthKey) ?? 0) + 1);
  }

  const latestScoreByMonth = new Map<string, number>();
  for (const item of scoredOrganizationRequests) {
    const monthKey = toMonthKey(item.request.updatedAt);
    latestScoreByMonth.set(monthKey, item.totalScore);
  }

  const currentMonthKey = toMonthKey(new Date().toISOString());
  const projectScoreMonths = [...latestScoreByMonth.keys()].sort(compareMonthKeys);
  const projectActivityMonths = [...latestScoreByMonth.keys(), ...issueCountsByMonth.keys()].sort(compareMonthKeys);
  const firstScoreMonth = projectScoreMonths[0] ?? null;
  const firstActivityMonth = projectActivityMonths[0] ?? currentMonthKey;
  const lastActivityMonth = projectActivityMonths[projectActivityMonths.length - 1] ?? currentMonthKey;
  const desiredStartMonth = firstScoreMonth ?? firstActivityMonth;
  const latestWindowEndMonth = compareMonthKeys(lastActivityMonth, currentMonthKey) > 0 ? lastActivityMonth : currentMonthKey;
  const latestAllowedStartMonth = addMonthsToMonthKey(latestWindowEndMonth, -11);
  const projectStartMonth =
    compareMonthKeys(desiredStartMonth, latestAllowedStartMonth) < 0 ? latestAllowedStartMonth : desiredStartMonth;
  const projectMonthlyLabels = buildFixedMonthWindow(projectStartMonth, 12);
  const projectMonthlySeriesRaw = projectMonthlyLabels.map((monthKey) => {
    return latestScoreByMonth.get(monthKey) ?? null;
  });
  const projectMonthlySeries = projectMonthlySeriesRaw;
  const projectChartSeries = projectMonthlySeries.map((value) => value ?? 0);
  const projectMonthlyIssueCounts = projectMonthlyLabels.map((monthKey) => issueCountsByMonth.get(monthKey) ?? 0);
  const maxMonthlyIssueCount = Math.max(1, ...projectMonthlyIssueCounts);

  const projectChartWidth = 620;
  const projectChartHeight = 260;
  const projectChartPaddingLeft = 88;
  const projectChartPaddingRight = 54;
  const projectChartGridLeft = 70;
  const projectChartGridRight = 28;
  const projectChartPlotTop = 24;
  const projectChartPlotBottom = 236;
  const projectBarBaseY = projectChartPlotBottom;
  const projectBarMaxHeight = 68;
  const projectBarWidth = 14;
  const projectScoreTicks = [100, 80, 60, 40, 20, 0];
  const projectChartSlotPoints = buildTrendChartPoints(projectChartSeries, projectMonthlyLabels, {
    width: projectChartWidth,
    height: projectChartHeight,
    paddingLeft: projectChartPaddingLeft,
    paddingRight: projectChartPaddingRight,
    centerY: 72,
    amplitude: 18,
    topY: projectChartPlotTop,
    bottomY: projectChartPlotBottom,
    domainMin: 0,
    domainMax: 100
  });
  const projectChartPoints = projectChartSlotPoints.filter((_, index) => projectMonthlySeries[index] !== null);
  const projectChartStartPoints = projectChartPoints.map((point) => ({
    ...point,
    y: 96
  }));
  const projectChartStartLinePath = buildSmoothLinePath(projectChartStartPoints);
  const projectChartLinePath = buildSmoothLinePath(projectChartPoints);
  const projectBarRows = projectMonthlyLabels.map((month, index) => {
    const count = projectMonthlyIssueCounts[index] ?? 0;
    const point = projectChartSlotPoints[index]!;
    const height = count > 0 ? Math.max((count / maxMonthlyIssueCount) * projectBarMaxHeight, 12) : 0;
    return {
      month,
      count,
      x: point.x - projectBarWidth / 2,
      y: projectBarBaseY - height,
      width: projectBarWidth,
      height
    };
  });
  const activeMonthlyPoint = hoveredMonthlyPoint
    ? projectChartPoints.find((point) => point.month === hoveredMonthlyPoint.month) ?? null
    : null;
  const activeMonthlySlot = hoveredMonthlyPoint
    ? projectChartSlotPoints.find((point) => point.month === hoveredMonthlyPoint.month) ?? null
    : null;
  const activeMonthlyBar = hoveredMonthlyPoint
    ? projectBarRows.find((bar) => bar.month === hoveredMonthlyPoint.month) ?? null
    : null;
  const projectHoverZones = projectChartSlotPoints.map((point, index) => {
    const previousPoint = projectChartSlotPoints[index - 1];
    const nextPoint = projectChartSlotPoints[index + 1];
    const left = previousPoint ? (previousPoint.x + point.x) / 2 : projectChartPaddingLeft - 22;
    const right = nextPoint ? (point.x + nextPoint.x) / 2 : projectChartWidth - projectChartPaddingRight + 10;
    return {
      month: point.month,
      score: projectMonthlySeries[index] ?? null,
      x: left,
      width: right - left
    };
  });
  const projectChartStroke = isDarkMode ? "#ffffff" : "#0f172a";
  const projectChartPointColor = isDarkMode ? "#ffffff" : "#0f172a";
  const projectChartPointGlow = isDarkMode ? "rgba(255, 255, 255, 0.18)" : "rgba(15, 23, 42, 0.16)";
  const projectChartGridColor = isDarkMode ? "rgba(148, 163, 184, 0.16)" : "#d8dee8";
  const projectChartTickColor = isDarkMode ? "#94a3b8" : "#64748b";
  const projectBarColor = "#ff8a00";
  const projectBarMaskColor = isDarkMode ? "#11141a" : "#fbfaf7";

  const evaluationTargetById = new Map(organization.evaluationTargets.map((site) => [site.id, site]));

  const siteRows = organization.evaluationTargets.map((site) => {
    const latestScan = latestScanBySiteId.get(site.id);
    const latestScoreResult = latestScan ? scoreByEvaluationRequestId.get(latestScan.id) : undefined;

    return {
      id: site.id,
      targetType: site.targetType,
      name: site.name,
      accessUrl: site.accessUrl,
      status: latestScan ? mapScanStatus(latestScan.status) : "미진행",
      totalScore: latestScoreResult?.totalScore ?? null,
      finishedAt: latestScan?.updatedAt ?? null,
      lastUpdatedAt: latestScan?.updatedAt ?? site.createdAt
    };
  });

  const sortedSiteRows = [...siteRows].sort((a, b) => {
    const updatedDiff = Date.parse(b.lastUpdatedAt) - Date.parse(a.lastUpdatedAt);

    if (siteSortConfig.key === "siteName") {
      const siteNameDiff = a.name.localeCompare(b.name, "ko");
      if (siteNameDiff !== 0) {
        return siteSortConfig.direction === "asc" ? siteNameDiff : -siteNameDiff;
      }

      return siteSortConfig.direction === "asc" ? -updatedDiff : updatedDiff;
    }

    if (siteSortConfig.key === "targetType") {
      const targetTypeDiff = a.targetType.localeCompare(b.targetType, "ko");
      if (targetTypeDiff !== 0) {
        return siteSortConfig.direction === "asc" ? targetTypeDiff : -targetTypeDiff;
      }

      return siteSortConfig.direction === "asc" ? -updatedDiff : updatedDiff;
    }

    if (siteSortConfig.key === "score") {
      const scoreDiff = (b.totalScore ?? -1) - (a.totalScore ?? -1);
      if (scoreDiff !== 0) {
        return siteSortConfig.direction === "desc" ? scoreDiff : -scoreDiff;
      }

      return siteSortConfig.direction === "desc" ? updatedDiff : -updatedDiff;
    }

    return siteSortConfig.direction === "asc" ? -updatedDiff : updatedDiff;
  });

  const handleSiteSort = (key: ProjectDetailSiteSortKey) => {
    setSiteSortConfig((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc"
        };
      }

      return {
        key,
        direction: key === "updatedAt" || key === "score" ? "desc" : "asc"
      };
    });
  };

  const getSiteSortIndicator = (key: ProjectDetailSiteSortKey) => {
    const isActive = siteSortConfig.key === key;

    return (
      <span
        className={cn(
          "inline-flex h-4 w-3 shrink-0 items-center justify-center leading-none",
          isActive ? "opacity-100" : "opacity-0"
        )}
      >
        {siteSortConfig.direction === "asc" ? (
          <ArrowUp size={11} strokeWidth={2.4} className="block" />
        ) : (
          <ArrowDown size={11} strokeWidth={2.4} className="block" />
        )}
      </span>
    );
  };

  const getCenteredSiteSortIndicator = (key: ProjectDetailSiteSortKey) => {
    const isActive = siteSortConfig.key === key;

    return (
      <span
        className={cn(
          "pointer-events-none absolute left-full top-1/2 ml-0.5 inline-flex h-4 w-3 -translate-y-1/2 items-center justify-center leading-none",
          isActive ? "opacity-100" : "opacity-0"
        )}
      >
        {siteSortConfig.direction === "asc" ? (
          <ArrowUp size={11} strokeWidth={2.4} className="block" />
        ) : (
          <ArrowDown size={11} strokeWidth={2.4} className="block" />
        )}
      </span>
    );
  };

  const getSiteStatusBadgeClassName = (status: string) => {
    if (status === finishedStatusLabel) {
      return "site-status-badge site-status-badge-finished";
    }
    if (status === runningStatusLabel) {
      return "site-status-badge site-status-badge-running";
    }
    if (status === failedStatusLabel) {
      return "site-status-badge site-status-badge-failed";
    }
    return "site-status-badge site-status-badge-idle";
  };

  const getTargetTypeInfo = (type: OrganizationModel["evaluationTargets"][number]["targetType"]) => {
    if (type === "모바일 웹") {
      return "모바일 웹";
    }

    if (type === "문서") {
      return "문서";
    }

    return "PC 웹";
  };

  const openEditEvaluationTargetModel = (site: EvaluationTargetModel) => {
    setEditingEvaluationTargetModel(site);
    setEditSiteName(site.name);
    setEditSiteBaseUrl(site.accessUrl);
    setEditEvaluationTargetError("");
  };

  const openDeleteEvaluationTargetModel = (site: EvaluationTargetModel) => {
    setDeletingEvaluationTargetModel(site);
    setDeleteEvaluationTargetError("");
  };

  const closeEditEvaluationTargetModel = () => {
    setEditingEvaluationTargetModel(null);
    setEditEvaluationTargetError("");
  };

  const closeDeleteEvaluationTargetModel = () => {
    setDeletingEvaluationTargetModel(null);
    setDeleteEvaluationTargetError("");
  };

  const editDialogRef = useDialogAccessibility({
    isOpen: editingEvaluationTargetModel !== null,
    onClose: closeEditEvaluationTargetModel,
    closeDisabled: isSavingEvaluationTarget
  });
  const deleteDialogRef = useDialogAccessibility({
    isOpen: deletingEvaluationTargetModel !== null,
    onClose: closeDeleteEvaluationTargetModel,
    closeDisabled: isDeletingEvaluationTarget
  });

  const handleSaveEvaluationTargetModel = async () => {
    if (!editingEvaluationTargetModel) {
      return;
    }

    const name = editSiteName.trim();
    const accessUrl = editSiteBaseUrl.trim();

    if (name.length === 0 || accessUrl.length === 0) {
      setEditEvaluationTargetError("페이지 이름과 주소는 필수입니다.");
      return;
    }

    setIsSavingEvaluationTarget(true);
    setEditEvaluationTargetError("");

    try {
      await onUpdateEvaluationTargetModel({
        projectId: organization.id,
        siteId: editingEvaluationTargetModel.id,
        name,
        accessUrl
      });

      closeEditEvaluationTargetModel();
    } catch (error) {
      setEditEvaluationTargetError(error instanceof Error ? error.message : "페이지 수정 중 오류가 발생했습니다.");
    } finally {
      setIsSavingEvaluationTarget(false);
    }
  };

  const handleConfirmDeleteEvaluationTargetModel = async () => {
    if (!deletingEvaluationTargetModel) {
      return;
    }

    setIsDeletingEvaluationTarget(true);
    setDeleteEvaluationTargetError("");

    try {
      await onDeleteEvaluationTargetModel({
        projectId: organization.id,
        siteId: deletingEvaluationTargetModel.id
      });

      closeDeleteEvaluationTargetModel();
    } catch (error) {
      setDeleteEvaluationTargetError(error instanceof Error ? error.message : "페이지 제거 중 오류가 발생했습니다.");
    } finally {
      setIsDeletingEvaluationTarget(false);
    }
  };

  const finishedStatusLabel = mapScanStatus("finished");
  const failedStatusLabel = mapScanStatus("failed");
  const runningStatusLabel = mapScanStatus("queued");

  const projectTrendChart = (
      <div ref={projectChartRef} className="relative h-[365px] w-full">
        <div className="absolute inset-0 overflow-hidden rounded-b-xl">
          <svg viewBox={`0 0 ${projectChartWidth} ${projectChartHeight}`} preserveAspectRatio="none" className="h-full w-full">
            <defs>
              <linearGradient id="project-monthly-combo-line-v2" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor={projectChartStroke} stopOpacity="0.72" />
                <stop offset="50%" stopColor={projectChartStroke} stopOpacity="1" />
                <stop offset="100%" stopColor={projectChartStroke} stopOpacity="0.86" />
              </linearGradient>
            </defs>

            {projectScoreTicks.map((tick) => {
              const y = projectChartPlotBottom - (tick / 100) * (projectChartPlotBottom - projectChartPlotTop);

              return (
                <g key={`project-score-tick-${tick}`}>
                  <line
                    x1={projectChartGridLeft}
                    x2={projectChartWidth - projectChartGridRight}
                    y1={y}
                    y2={y}
                    stroke={projectChartGridColor}
                    strokeWidth="1"
                  />
                  <text
                    x={projectChartGridLeft - 12}
                    y={y + 4}
                    textAnchor="end"
                    fontFamily="Pretendard, Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
                    fontSize="9"
                    fontWeight="500"
                    fill={projectChartTickColor}
                  >
                    {tick}점
                  </text>
                </g>
              );
            })}

            {activeMonthlySlot && (
              <line
                x1={activeMonthlySlot.x}
                x2={activeMonthlySlot.x}
                y1={projectChartPlotTop}
                y2={projectBarBaseY}
                stroke={isDarkMode ? "rgba(255,255,255,0.34)" : "rgba(15,23,42,0.45)"}
                strokeWidth="1"
                strokeDasharray="4 5"
              />
            )}

            {projectBarRows.map((bar) => (
              <g key={`${bar.month}-aligned-issues`}>
                {bar.count > 0 && (
                  <>
                    <rect
                      x={bar.x - 1}
                      y={bar.y - 1}
                      width={bar.width + 2}
                      height={bar.height + 2}
                      fill={projectBarMaskColor}
                    />
                    <rect
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      rx="4"
                      fill={hoveredMonthlyPoint?.month === bar.month ? "#ff9f2f" : projectBarColor}
                    />
                  </>
                )}
              </g>
            ))}

            <motion.path
              key="project-monthly-combo-line-v2"
              initial={{ d: projectChartStartLinePath }}
              animate={{ d: projectChartLinePath }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
              fill="none"
              stroke="url(#project-monthly-combo-line-v2)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {projectHoverZones.map((zone) => (
              <rect
              key={`${zone.month}-aligned-zone`}
              x={zone.x}
              y={projectChartPlotTop - 12}
              width={zone.width}
              height={projectBarBaseY - projectChartPlotTop + 24}
              fill="transparent"
              className="cursor-pointer"
              onMouseMove={(event) => {
                  const rect = projectChartRef.current?.getBoundingClientRect();
                  if (!rect) {
                    return;
                  }
                  setHoveredMonthlyPoint({
                    month: zone.month,
                    score: zone.score,
                    x: event.clientX - rect.left + 12,
                    y: event.clientY - rect.top - 18
                  });
                }}
                onMouseLeave={() => setHoveredMonthlyPoint(null)}
              />
            ))}
            {projectChartSlotPoints.map((point) => (
              <text
                key={`${point.month}-label`}
                x={point.x}
                y={projectChartHeight - 10}
                textAnchor="middle"
                fontFamily="Pretendard, Noto Sans KR, Apple SD Gothic Neo, Malgun Gothic, sans-serif"
                fontSize="8.75"
                fontWeight="500"
                fill={projectChartTickColor}
              >
                {formatMonthShortLabel(point.month)}
              </text>
            ))}
          </svg>

          {activeMonthlyPoint && hoveredMonthlyPoint && (
            <>
              <span
                className="pointer-events-none absolute h-5 w-5 rounded-full"
                style={{
                  left: `${(activeMonthlyPoint.x / projectChartWidth) * 100}%`,
                  top: `${(activeMonthlyPoint.y / projectChartHeight) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  backgroundColor: projectChartPointGlow
                }}
              />
              <span
                className="pointer-events-none absolute h-2.5 w-2.5 rounded-full"
                style={{
                  left: `${(activeMonthlyPoint.x / projectChartWidth) * 100}%`,
                  top: `${(activeMonthlyPoint.y / projectChartHeight) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  backgroundColor: projectChartPointColor
                }}
              />
              {activeMonthlyBar && activeMonthlyBar.count > 0 && (
                <span
                  className="pointer-events-none absolute rounded-[5px]"
                  style={{
                    left: `${(activeMonthlyBar.x / projectChartWidth) * 100}%`,
                    top: `${(activeMonthlyBar.y / projectChartHeight) * 100}%`,
                    width: `${(activeMonthlyBar.width / projectChartWidth) * 100}%`,
                    height: `${(activeMonthlyBar.height / projectChartHeight) * 100}%`,
                    backgroundColor: "rgba(255, 186, 122, 0.2)"
                  }}
                />
              )}
            </>
          )}
        </div>

        {hoveredMonthlyPoint && (
          <div
            className="pointer-events-none absolute z-20 min-w-24 rounded-lg px-3 py-2 text-left"
            style={{
              left: hoveredMonthlyPoint.x,
              top: hoveredMonthlyPoint.y,
              backgroundColor: "rgba(8, 8, 10, 0.96)",
              border: "1px solid rgba(255, 255, 255, 0.08)"
            }}
          >
            <p className="text-[11px] font-semibold" style={{ color: chartTokens.tooltipSubtle }}>
              {formatMonthShortLabel(hoveredMonthlyPoint.month)}
            </p>
            <p className="mt-1 text-sm font-bold" style={{ color: chartTokens.tooltipText }}>
              {hoveredMonthlyPoint.score === null ? "점수 - 점" : `점수 ${hoveredMonthlyPoint.score}점`}
            </p>
            <p className="mt-1 text-[11px] font-semibold" style={{ color: chartTokens.tooltipSubtle }}>
              문제 {projectBarRows.find((bar) => bar.month === hoveredMonthlyPoint.month)?.count ?? 0}건
            </p>
          </div>
        )}
      </div>
  );
  const summaryRightPlaceholderCard = (
    <section className="min-h-[214px] w-full px-2 py-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="min-h-[132px] rounded-2xl bg-white px-3 py-4">
          <p className="text-xs font-semibold text-[#8b95a1]">종합 점수</p>
          <div className="mt-5 flex items-end gap-1">
            <span className="text-[2.15rem] font-bold leading-none tracking-tight text-slate-950">
              {summaryTotalScore ?? "-"}
            </span>
            <span className="mb-1 text-base font-bold text-slate-500">점</span>
          </div>
        </div>

        <div className="min-h-[132px] rounded-2xl bg-white px-3 py-4">
          <p className="text-xs font-semibold text-[#8b95a1]">발견 문제수</p>
          <div className="mt-5 flex items-end gap-1">
            <span className="text-[2.15rem] font-bold leading-none tracking-tight text-slate-950">{projectIssueCount}</span>
            <span className="mb-1 text-base font-bold text-slate-500">건</span>
          </div>
        </div>

        <div className="min-h-[132px] rounded-2xl bg-white px-3 py-4">
          <p className="text-xs font-semibold text-[#8b95a1]">최근 수정일</p>
          <p className="mt-8 text-[0.95rem] font-bold leading-tight tracking-tight text-slate-950">{summaryUpdatedDate}</p>
        </div>
      </div>
    </section>
  );
  const summaryBreakdownCard = (
    <section className="min-h-[214px] w-full px-2 py-3">
      <div className="grid gap-3">
        {summaryAnalysisScoreRows.map((row) => (
          <div key={row.key} className="grid grid-cols-[76px_minmax(0,1fr)_42px] items-center gap-3 rounded-2xl bg-white px-4 py-4">
            <p className="truncate text-[11px] font-semibold text-slate-700">{row.label}</p>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${typeof row.score === "number" ? Math.min(Math.max(row.score, 0), 100) : 0}%`,
                  backgroundColor: row.color
                }}
              />
            </div>
            <p className="text-right text-[11px] font-bold text-slate-900">
              {typeof row.score === "number" ? Math.round(row.score) : "-"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
  const alignedComboMonthlyTrendCard = (
    <article className="dashboard-card min-h-[480px] rounded-xl border border-slate-200 bg-white px-3 py-3 sm:px-4">
      <div className="grid min-h-[452px] gap-3 lg:grid-cols-[minmax(0,0.82fr)_minmax(440px,540px)]">
        <div className="flex h-full min-h-[452px] items-center px-10 py-9">{projectTrendChart}</div>
        <div className="hidden min-h-0 flex-col gap-3 lg:flex">
          {summaryRightPlaceholderCard}
          {summaryBreakdownCard}
        </div>
      </div>
    </article>
  );
  const issueCountCard = (
    <article className="dashboard-card h-full min-h-[332px] rounded-xl border border-slate-200 bg-white px-4 py-5 sm:px-5 sm:py-6">
      <div className="mb-5">
        <div>
          <p className="text-sm font-semibold text-slate-900">분야별 문제 개수</p>
          <p className="text-xs text-slate-500">현재 프로젝트에서 발견된 접근성 문제를 분야별로 집계했습니다.</p>
        </div>
      </div>

      <div className="mt-16 space-y-4">
        {projectIssueRows.map((row) => {
          const widthRatio = row.count / maxProjectIssueCount;
          return (
            <div key={row.key} className="grid grid-cols-[88px_minmax(0,1fr)_40px] items-center gap-3">
              <p className="text-sm font-medium text-slate-700">{row.label}</p>
              <div className={cn("mx-auto h-5 w-full max-w-[520px] overflow-hidden rounded-full", isDarkMode ? "bg-white/10" : "bg-slate-100")}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: row.color, transformOrigin: "left center" }}
                  initial={{ scaleX: 0, opacity: 0.65 }}
                  animate={{ scaleX: widthRatio, opacity: row.count > 0 ? 1 : 0.45 }}
                  transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <p className="text-right text-sm font-semibold text-slate-900">{row.count}건</p>
            </div>
          );
        })}
      </div>
    </article>
  );
  return (
    <div className="space-y-3 overflow-visible">
      <div className="absolute right-[var(--dashboard-side-gutter)] top-[calc(var(--dashboard-fixed-top)+var(--dashboard-control-size)+5.75rem)] z-50">
        <button
          type="button"
          onClick={onOpenCreateSiteModal}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-transparent bg-[#ef6a50] px-5 text-sm font-bold text-white transition hover:bg-[#e85d43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef6a50]/30"
        >
          <Plus size={18} strokeWidth={2.4} className="-ml-2" />
          페이지 추가
        </button>
      </div>

      {activeTab === "summary" && (
        <div className="mx-auto min-h-[400px] w-full max-w-none">
          <div className="mt-3 min-h-0">{alignedComboMonthlyTrendCard}</div>
        </div>
      )}

      {activeTab === "sites" && (
        <div className="-mt-2 space-y-0">
          <div className="project-list-table overflow-visible bg-transparent">
            <div className="overflow-visible">
              <table className="w-full table-fixed text-left">
              <colgroup>
                <col className="w-[52px]" />
                <col className="w-[23%]" />
                <col className="w-[34%]" />
                <col className="w-[120px]" />
                <col className="w-[110px]" />
                <col className="w-[160px]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead className="project-list-head border-b border-slate-200/80 text-xs text-slate-500">
                <tr>
                  <th className="h-8 py-0 font-medium text-center align-middle">
                    <button
                      type="button"
                      onClick={() => handleSiteSort("targetType")}
                      className="flex h-8 w-full items-center justify-center px-0 text-center cursor-pointer select-none"
                    >
                      <span className="relative inline-flex -translate-x-3 items-center justify-center">
                        종류
                        {getCenteredSiteSortIndicator("targetType")}
                      </span>
                    </button>
                  </th>
                  <th className="h-8 py-0 font-medium align-middle">
                    <button
                      type="button"
                      onClick={() => handleSiteSort("siteName")}
                      className="-ml-5 flex h-8 w-full items-center gap-0.5 px-0 text-left cursor-pointer select-none"
                    >
                      페이지 이름
                      {getSiteSortIndicator("siteName")}
                    </button>
                  </th>
                  <th className="h-8 px-4 py-0 font-medium align-middle">주소</th>
                  <th className="h-8 px-4 py-0 font-medium text-center align-middle">상태</th>
                  <th className="h-8 py-0 font-medium text-center align-middle">
                    <button
                      type="button"
                      onClick={() => handleSiteSort("score")}
                      className="flex h-8 w-full items-center justify-center px-4 text-center cursor-pointer select-none"
                    >
                      <span className="relative inline-flex items-center justify-center">
                        최근 점수
                        {getCenteredSiteSortIndicator("score")}
                      </span>
                    </button>
                  </th>
                  <th className="h-8 py-0 font-medium align-middle">
                    <button
                      type="button"
                      onClick={() => handleSiteSort("updatedAt")}
                      className="flex h-8 w-full items-center gap-0.5 px-4 text-left cursor-pointer select-none"
                    >
                      최근 완료 시각
                      {getSiteSortIndicator("updatedAt")}
                    </button>
                  </th>
                  <th className="h-8 px-4 py-0 align-middle" aria-label="페이지 액션" />
                </tr>
              </thead>
              <tbody>
                {sortedSiteRows.length === 0 ? (
                  <tr className="project-list-row">
                    <td colSpan={7} className="px-4 py-6 text-center text-xs text-slate-500">
                      등록된 페이지가 없습니다.
                    </td>
                  </tr>
                ) : (
                  sortedSiteRows.map((row, index) => (
                    <tr
                      key={row.id}
                      onClick={() => onSiteClick(row.id)}
                      className={`project-list-row group cursor-pointer ${
                        index !== sortedSiteRows.length - 1 ? "border-b border-slate-200/80" : ""
                      }`}
                    >
                      <td className="relative px-0 py-1.5 align-middle text-slate-600">
                        <div className="group/target-type relative flex -translate-x-3 items-center justify-center">
                          <span
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition ${
                              isDarkMode ? "group-hover/target-type:bg-white/[0.06]" : "group-hover/target-type:bg-slate-100"
                            }`}
                            aria-label={getTargetTypeInfo(row.targetType)}
                          >
                            {renderTargetTypeIcon(row.targetType)}
                          </span>
                          <span
                            data-tooltip-tone={isDarkMode ? "dark" : "light"}
                            className="project-table-tooltip invisible pointer-events-none absolute left-1/2 top-full z-[9999] mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium group-hover/target-type:visible"
                          >
                            {getTargetTypeInfo(row.targetType)}
                          </span>
                        </div>
                      </td>
                      <td className="px-0 py-1.5 align-middle">
                        <div className="-ml-5 min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-900">{row.name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-1.5 align-middle">
                        <a
                          href={row.accessUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={row.accessUrl}
                          onClick={(event) => event.stopPropagation()}
                          className="inline-block max-w-full truncate text-xs leading-4 text-slate-600 hover:underline"
                        >
                          {row.accessUrl}
                        </a>
                      </td>
                      <td className="px-4 py-1.5 align-middle">
                        <div className="flex items-center justify-center">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold",
                              getSiteStatusBadgeClassName(row.status)
                            )}
                          >
                            {row.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-1.5 align-middle text-center">
                        <span className="text-xs font-medium text-slate-700">
                          {row.totalScore !== null ? `${row.totalScore}점` : "-"}
                        </span>
                      </td>
                      <td className="project-list-updated px-4 py-1.5 align-middle text-xs tabular-nums text-slate-500">
                        {formatDateTime(row.finishedAt)}
                      </td>
                      <td className="relative px-4 py-1.5 text-right align-middle">
                        <div className="group/project-actions absolute right-4 top-1/2 flex h-9 w-[106px] -translate-y-1/2 items-center justify-end">
                          <div className="pointer-events-none absolute right-9 top-1/2 inline-flex h-9 w-[68px] -translate-y-1/2 items-center justify-end gap-1 opacity-0 transition-all duration-200 ease-out group-hover/project-actions:pointer-events-auto group-hover/project-actions:translate-x-0 group-hover/project-actions:opacity-100 translate-x-1">
                            <div className="group/action relative flex items-center">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  const site = evaluationTargetById.get(row.id);
                                  if (site) {
                                    openEditEvaluationTargetModel(site);
                                  }
                                }}
                                aria-label="수정"
                                className={`project-list-icon-action inline-flex h-7 w-7 items-center justify-center rounded-full bg-transparent transition ${
                                  isDarkMode
                                    ? "text-white hover:bg-white/[0.075] hover:text-white"
                                    : "text-slate-700 hover:text-slate-900"
                                }`}
                              >
                                <Pencil size={14} />
                              </button>
                              <span
                                data-tooltip-tone={isDarkMode ? "dark" : "light"}
                                className={`project-table-tooltip invisible pointer-events-none absolute left-1/2 z-[9999] -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium group-hover/action:visible ${
                                  index === 0 ? "top-full mt-2" : "bottom-full mb-2"
                                }`}
                              >
                                수정
                              </span>
                            </div>
                            <div className="group/action relative flex items-center">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  const site = evaluationTargetById.get(row.id);
                                  if (site) {
                                    openDeleteEvaluationTargetModel(site);
                                  }
                                }}
                                aria-label="제거"
                                className={`project-list-icon-action inline-flex h-7 w-7 items-center justify-center rounded-full bg-transparent transition ${
                                  isDarkMode
                                    ? "text-rose-400 hover:bg-white/[0.075] hover:text-rose-300"
                                    : "text-red-600 hover:text-red-700"
                                }`}
                              >
                                <Trash2 size={14} className={isDarkMode ? "text-rose-400" : "text-red-600"} />
                              </button>
                              <span
                                data-tooltip-tone={isDarkMode ? "dark" : "light"}
                                className={`project-table-tooltip invisible pointer-events-none absolute left-1/2 z-[9999] -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium group-hover/action:visible ${
                                  index === 0 ? "top-full mt-2" : "bottom-full mb-2"
                                }`}
                              >
                                제거
                              </span>
                            </div>
                          </div>
                          <div className="group/action relative flex h-7 w-7 items-center justify-center">
                            <button
                              type="button"
                              onClick={(event) => event.stopPropagation()}
                              className={`project-list-action inline-flex h-7 w-7 items-center justify-center rounded-full bg-transparent transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
                                isDarkMode ? "text-white" : "text-slate-700"
                              }`}
                              aria-label={`${row.name} 관리 메뉴`}
                            >
                              <MoreHorizontal size={14} />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "reports" && (
        <div className="space-y-3">
          {issueCountCard}
        </div>
      )}
      {editingEvaluationTargetModel
        ? createPortal(
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
              <div
                className="absolute inset-0"
                onClick={() => {
                  if (!isSavingEvaluationTarget) {
                    closeEditEvaluationTargetModel();
                  }
                }}
              />
              <article
                ref={editDialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="site-edit-title"
                aria-describedby="site-edit-description"
                tabIndex={-1}
                className={`relative z-10 w-full max-w-2xl rounded-2xl border p-5 ${
                  isDarkMode ? "border-[#23272f] bg-[#0C0E11]" : "border-slate-200 bg-white"
                }`}
              >
                <h3 id="site-edit-title" className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-slate-900"}`}>페이지 수정</h3>
                <p id="site-edit-description" className={`mt-1 text-sm ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                  페이지 이름과 주소를 수정할 수 있습니다.
                </p>

                {editEvaluationTargetError.length > 0 && (
                  <PanelMessage label={`페이지 수정 실패: ${editEvaluationTargetError}`} isError />
                )}

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className={`mb-1 block text-sm font-medium ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>페이지 이름</span>
                    <input
                      value={editSiteName}
                      onChange={(event) => setEditSiteName(event.target.value)}
                      className={`h-10 w-full rounded-lg border px-3 text-sm outline-none ${
                        isDarkMode
                          ? "border-[#23272f] bg-[#11141a] text-white placeholder:text-slate-500 focus:border-slate-500"
                          : "border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-400"
                      }`}
                      placeholder="예: 방문 안내"
                    />
                  </label>

                  <label className="block sm:col-span-2">
                    <span className={`mb-1 block text-sm font-medium ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}>기본 주소</span>
                    <input
                      value={editSiteBaseUrl}
                      onChange={(event) => setEditSiteBaseUrl(event.target.value)}
                      className={`h-10 w-full rounded-lg border px-3 text-sm outline-none ${
                        isDarkMode
                          ? "border-[#23272f] bg-[#11141a] text-white placeholder:text-slate-500 focus:border-slate-500"
                          : "border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-400"
                      }`}
                      placeholder="https://example.com"
                    />
                  </label>

                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={isSavingEvaluationTarget}
                    onClick={closeEditEvaluationTargetModel}
                    className={`inline-flex h-9 items-center rounded-lg px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
                      isDarkMode
                        ? "bg-slate-900 font-semibold text-white hover:bg-slate-800"
                        : "border border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={isSavingEvaluationTarget}
                    onClick={() => {
                      void handleSaveEvaluationTargetModel();
                    }}
                    className={`inline-flex h-9 items-center rounded-lg px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
                      isDarkMode
                        ? "border border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50"
                        : "bg-slate-900 font-semibold text-white hover:bg-slate-800"
                    }`}
                  >
                    {isSavingEvaluationTarget ? "저장 중..." : "저장"}
                  </button>
                </div>
              </article>
            </div>,
            document.body
          )
        : null}
      {deletingEvaluationTargetModel
        ? createPortal(
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
              <div
                className="absolute inset-0"
                onClick={() => {
                  if (!isDeletingEvaluationTarget) {
                    closeDeleteEvaluationTargetModel();
                  }
                }}
              />
              <article
                ref={deleteDialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="site-delete-title"
                aria-describedby="site-delete-description"
                tabIndex={-1}
                className={`relative z-10 w-full max-w-md rounded-2xl border p-5 ${
                  isDarkMode ? "border-[#23272f] bg-[#0C0E11]" : "border-slate-200 bg-white"
                }`}
              >
                <h3 id="site-delete-title" className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-slate-900"}`}>페이지 제거</h3>
                <p id="site-delete-description" className={`mt-2 text-sm ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                  <span className={isDarkMode ? "font-medium text-white" : "font-medium text-slate-700"}>
                    {deletingEvaluationTargetModel.name}
                  </span>
                  {" "}페이지를 제거하시겠습니까?
                </p>

                {deleteEvaluationTargetError.length > 0 && (
                  <PanelMessage label={`페이지 제거 실패: ${deleteEvaluationTargetError}`} isError />
                )}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={isDeletingEvaluationTarget}
                    onClick={closeDeleteEvaluationTargetModel}
                    className={`inline-flex h-9 items-center rounded-lg px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
                      isDarkMode
                        ? "bg-slate-900 font-semibold text-white hover:bg-slate-800"
                        : "border border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    아니요
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingEvaluationTarget}
                    onClick={() => {
                      void handleConfirmDeleteEvaluationTargetModel();
                    }}
                    className="inline-flex h-9 items-center rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDeletingEvaluationTarget ? "제거 중..." : "네"}
                  </button>
                </div>
              </article>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
