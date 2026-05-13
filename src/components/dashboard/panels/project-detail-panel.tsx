import { motion } from "framer-motion";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
  buildRecentMonthKeys,
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
    access_url: string;
  }) => Promise<void>;
  onDeleteEvaluationTargetModel: (input: { projectId: number; siteId: number }) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<ProjectDetailTab>("summary");
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
  const [tabIndicatorStyle, setTabIndicatorStyle] = useState({ width: 0, left: 0 });

  const projectChartRef = useRef<HTMLDivElement | null>(null);
  const tabContainerRef = useRef<HTMLDivElement | null>(null);
  const tabButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tabs = [
    { id: "summary" as const, label: "요약" },
    { id: "sites" as const, label: "페이지" },
    { id: "reports" as const, label: "리포트" }
  ];
  const activeTabIndex = tabs.findIndex((tab) => tab.id === activeTab);

  useEffect(() => {
    const updateIndicator = () => {
      const activeButton = tabButtonRefs.current[activeTabIndex];
      const container = tabContainerRef.current;
      if (!activeButton || !container) {
        return;
      }

      const buttonRect = activeButton.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setTabIndicatorStyle({
        width: buttonRect.width,
        left: buttonRect.left - containerRect.left
      });
    };

    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [activeTabIndex]);

  useEffect(() => {
    setHoveredMonthlyPoint(null);
  }, [activeTab]);

  const evaluationTargetIds = new Set(organization.evaluation_targets.map((target) => target.id));
  const organizationEvaluationRequests = evaluationRequests.filter((request) =>
    evaluationTargetIds.has(request.evaluation_target_id)
  );
  const latestScanBySiteId = new Map<number, EvaluationRequestModel>();
  for (const evaluationRequest of organizationEvaluationRequests) {
    const existing = latestScanBySiteId.get(evaluationRequest.evaluation_target_id);
    if (!existing) {
      latestScanBySiteId.set(evaluationRequest.evaluation_target_id, evaluationRequest);
      continue;
    }

    const currentTime = Date.parse(evaluationRequest.updated_at);
    const existingTime = Date.parse(existing.updated_at);
    if (currentTime > existingTime) {
      latestScanBySiteId.set(evaluationRequest.evaluation_target_id, evaluationRequest);
    }
  }
  const latestEvaluationRequestIds = new Set(Array.from(latestScanBySiteId.values()).map((request) => request.id));
  const evaluationRequestById = new Map(organizationEvaluationRequests.map((request) => [request.id, request]));
  const organizationEvaluationRequestIds = new Set(organizationEvaluationRequests.map((request) => request.id));
  const requestIdByAnalysisResultId = new Map(
    analysisResults.map((analysisResult) => [analysisResult.id, analysisResult.evaluation_request_id])
  );
  const organizationIssueResults = issueResults.filter((issue) => {
    const requestId = requestIdByAnalysisResultId.get(issue.analysis_result_id);
    return typeof requestId === "number" && organizationEvaluationRequestIds.has(requestId);
  });
  const latestOrganizationIssueResults = issueResults.filter((issue) => {
    const requestId = requestIdByAnalysisResultId.get(issue.analysis_result_id);
    return typeof requestId === "number" && latestEvaluationRequestIds.has(requestId);
  });
  const projectIssueCount = latestOrganizationIssueResults.length;
  const scoreByEvaluationRequestId = new Map(scoreResults.map((scoreResult) => [scoreResult.evaluation_request_id, scoreResult]));

  const scoredOrganizationRequests = organizationEvaluationRequests
    .map((request) => {
      const scoreResult = scoreByEvaluationRequestId.get(request.id);
      return {
        request,
        scoreResult: scoreResult ?? null,
        totalScore: scoreResult?.total_score ?? null,
        timestamp: Date.parse(request.updated_at)
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
  const summaryUpdatedDate = formatDateOnly(organization.updated_at);
  const summaryAnalysisScoreRows = [
    {
      key: "rule",
      label: "규칙 기반",
      score: latestScoredRequest?.scoreResult.rule_score ?? null,
      color: analysisScorePalette[0]
    },
    {
      key: "ai",
      label: "AI 분석",
      score: latestScoredRequest?.scoreResult.ai_score ?? null,
      color: analysisScorePalette[1]
    },
    {
      key: "cv",
      label: "시각 분석",
      score: latestScoredRequest?.scoreResult.cv_score ?? null,
      color: analysisScorePalette[2]
    }
  ];
  const projectIssueCountMap = new Map<string, number>();
  for (const issue of organizationIssueResults) {
    const categoryKey = getIssueCategoryKey(issue.issue_code);
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
    const requestId = requestIdByAnalysisResultId.get(issue.analysis_result_id);
    const evaluationRequest = typeof requestId === "number" ? evaluationRequestById.get(requestId) : null;
    const monthKey = toMonthKey(evaluationRequest?.updated_at ?? issue.created_at);
    issueCountsByMonth.set(monthKey, (issueCountsByMonth.get(monthKey) ?? 0) + 1);
  }

  const latestScoreByMonth = new Map<string, number>();
  for (const item of scoredOrganizationRequests) {
    const monthKey = toMonthKey(item.request.updated_at);
    latestScoreByMonth.set(monthKey, item.totalScore);
  }

  const projectMonthlyLabels = buildRecentMonthKeys(12);
  const projectMonthlySeriesRaw = projectMonthlyLabels.map((monthKey) => {
    return latestScoreByMonth.get(monthKey) ?? null;
  });
  let lastCarriedScore: number | null = null;
  const projectMonthlySeries = projectMonthlySeriesRaw.map((value) => {
    if (typeof value === "number") {
      lastCarriedScore = value;
      return value;
    }
    return lastCarriedScore;
  });
  const projectChartSeries = projectMonthlySeries.map((value) => value ?? (latestScore ?? averageScore ?? 0));
  const projectMonthlyIssueCounts = projectMonthlyLabels.map((monthKey) => issueCountsByMonth.get(monthKey) ?? 0);
  const maxMonthlyIssueCount = Math.max(1, ...projectMonthlyIssueCounts);

  const projectChartWidth = 620;
  const projectChartHeight = 252;
  const projectBarBaseY = 210;
  const projectBarMaxHeight = 76;
  const projectChartPaddingX = 36;
  const projectBarWidth = 18;
  const projectChartSlotPoints = buildTrendChartPoints(projectChartSeries, projectMonthlyLabels, {
    width: projectChartWidth,
    height: projectChartHeight,
    paddingLeft: projectChartPaddingX,
    paddingRight: projectChartPaddingX,
    centerY: 72,
    amplitude: 18,
    topY: 44,
    bottomY: 132,
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
    const left = previousPoint ? (previousPoint.x + point.x) / 2 : projectChartPaddingX / 2;
    const right = nextPoint ? (point.x + nextPoint.x) / 2 : projectChartWidth - projectChartPaddingX / 2;
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
  const projectChartLineGlow = isDarkMode ? "rgba(255, 255, 255, 0.16)" : "rgba(15, 23, 42, 0.14)";
  const projectBarColor = "#ff8a00";

  const evaluationTargetById = new Map(organization.evaluation_targets.map((site) => [site.id, site]));

  const siteRows = organization.evaluation_targets.map((site) => {
    const latestScan = latestScanBySiteId.get(site.id);
    const latestScoreResult = latestScan ? scoreByEvaluationRequestId.get(latestScan.id) : undefined;

    return {
      id: site.id,
      targetType: site.target_type,
      name: site.name,
      accessUrl: site.access_url,
      status: latestScan ? mapScanStatus(latestScan.status) : "미진행",
      totalScore: latestScoreResult?.total_score ?? null,
      finishedAt: latestScan?.updated_at ?? null,
      lastUpdatedAt: latestScan?.updated_at ?? site.created_at
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
      <span className={cn("inline-flex w-3 shrink-0 justify-center text-[10px]", isActive ? "opacity-100" : "opacity-0")}>
        {siteSortConfig.direction === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  const getCenteredSiteSortIndicator = (key: ProjectDetailSiteSortKey) => {
    const isActive = siteSortConfig.key === key;

    return (
      <span
        className={cn(
          "pointer-events-none absolute left-full top-1/2 ml-1 -translate-y-1/2 text-[10px]",
          isActive ? "opacity-100" : "opacity-0"
        )}
      >
        {siteSortConfig.direction === "asc" ? "↑" : "↓"}
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

  const getTargetTypeInfo = (type: OrganizationModel["evaluation_targets"][number]["target_type"]) => {
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
    setEditSiteBaseUrl(site.access_url);
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
    const access_url = editSiteBaseUrl.trim();

    if (name.length === 0 || access_url.length === 0) {
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
        access_url
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

  const alignedComboMonthlyTrendCard = (
    <article className="dashboard-card flex h-[480px] min-h-[460px] flex-col rounded-xl border border-slate-200 bg-white px-2 pt-5 pb-0 sm:px-3">
      <div className="flex min-h-[40px] items-start justify-between gap-3">
        <div className="min-w-0 pl-1 pt-2 sm:pl-2">
          <p className="text-sm font-semibold text-slate-900">월별 접근성 점수 추이</p>
        </div>
      </div>

      <div ref={projectChartRef} className="relative mt-4 -mx-2 min-h-[260px] flex-1 sm:mx-0">
        <div className="absolute inset-0 overflow-hidden rounded-b-xl">
          <svg viewBox={`0 0 ${projectChartWidth} ${projectChartHeight}`} preserveAspectRatio="none" className="h-full w-full">
            <defs>
              <linearGradient id="project-monthly-combo-line-v2" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor={projectChartStroke} stopOpacity="0.72" />
                <stop offset="50%" stopColor={projectChartStroke} stopOpacity="1" />
                <stop offset="100%" stopColor={projectChartStroke} stopOpacity="0.86" />
              </linearGradient>
            </defs>

            {[52, 92, 132, 172].map((y) => (
              <line
                key={`aligned-guide-${y}`}
                x1={projectChartPaddingX}
                x2={projectChartWidth - projectChartPaddingX}
                y1={y}
                y2={y}
                stroke={isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(148,163,184,0.14)"}
                strokeWidth="1"
              />
            ))}

            {activeMonthlySlot && (
              <line
                x1={activeMonthlySlot.x}
                x2={activeMonthlySlot.x}
                y1="44"
                y2={projectBarBaseY}
                stroke={isDarkMode ? "rgba(255,255,255,0.34)" : "rgba(15,23,42,0.45)"}
                strokeWidth="1"
                strokeDasharray="4 5"
              />
            )}

            {projectBarRows.map((bar) => (
              <g key={`${bar.month}-aligned-issues`}>
                {bar.count > 0 && (
                  <rect
                    x={bar.x}
                    y={bar.y}
                    width={bar.width}
                    height={bar.height}
                    rx="5"
                    fill={hoveredMonthlyPoint?.month === bar.month ? "#ff9f2f" : projectBarColor}
                  />
                )}
              </g>
            ))}

            <motion.path
              key="project-monthly-combo-line-glow-v2"
              initial={{ d: projectChartStartLinePath }}
              animate={{ d: projectChartLinePath }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
              fill="none"
              stroke={projectChartLineGlow}
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
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
                y="36"
                width={zone.width}
                height={projectBarBaseY - 24}
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
            className="pointer-events-none absolute z-20 min-w-24 rounded-lg px-3 py-2 text-left shadow-[0_14px_32px_rgba(2,6,23,0.32)]"
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

        {projectChartSlotPoints.map((point) => (
          <span
            key={`${point.month}-label`}
            className="pointer-events-none absolute bottom-6 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-400"
            style={{ left: `${(point.x / projectChartWidth) * 100}%` }}
          >
            {formatMonthShortLabel(point.month)}
          </span>
        ))}
      </div>
    </article>
  );
  const summaryRightPlaceholderCard = (
    <article className="dashboard-card min-h-[250px] w-[calc(100%+6rem)] max-w-none rounded-xl border border-slate-200 bg-[#f1f1f3] px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">프로젝트 상황</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="min-h-[150px] rounded-2xl bg-white px-5 py-5">
          <p className="text-xs font-semibold text-[#8b95a1]">종합 점수</p>
          <div className="mt-5 flex items-end gap-1">
            <span className="text-[3.1rem] font-bold leading-none tracking-tight text-slate-950">
              {summaryTotalScore ?? "-"}
            </span>
            <span className="mb-1.5 text-xl font-bold text-slate-500">점</span>
          </div>
        </div>

        <div className="min-h-[150px] rounded-2xl bg-white px-5 py-5">
          <p className="text-xs font-semibold text-[#8b95a1]">발견 문제수</p>
          <div className="mt-5 flex items-end gap-1">
            <span className="text-[3.1rem] font-bold leading-none tracking-tight text-slate-950">{projectIssueCount}</span>
            <span className="mb-1.5 text-xl font-bold text-slate-500">건</span>
          </div>
        </div>

        <div className="min-h-[150px] rounded-2xl bg-white px-5 py-5">
          <p className="text-xs font-semibold text-[#8b95a1]">최근 수정일</p>
          <p className="mt-7 text-[1.75rem] font-bold leading-none tracking-tight text-slate-950">{summaryUpdatedDate}</p>
        </div>
      </div>
    </article>
  );
  const summaryBreakdownCard = (
    <article className="dashboard-card mt-3 min-h-[217px] w-[calc(100%+6rem)] max-w-none rounded-xl border border-slate-200 bg-[#f1f1f3] px-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">분석 방식별 점수</p>
        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-400">최신 평가 기준</span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
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
      <div
        ref={tabContainerRef}
        className={cn(
          "absolute right-[var(--dashboard-side-gutter)] top-[calc(var(--dashboard-fixed-top)+var(--dashboard-control-size)+5.75rem)] z-50 flex w-[min(18rem,calc(100vw-2rem))] items-center rounded-full px-1 py-1 backdrop-blur-xl",
          isDarkMode ? "bg-[#1f1f1f]" : "bg-[#e8e8ec]"
        )}
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabButtonRefs.current[index] = element;
              }}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative z-10 inline-flex h-10 flex-1 items-center justify-center rounded-full px-3 py-1 text-sm font-semibold transition-colors",
                isActive
                  ? isDarkMode
                    ? "text-white"
                    : "text-white"
                  : isDarkMode
                    ? "text-slate-400 hover:text-white"
                    : "text-black hover:text-black"
              )}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}

        <motion.div
          animate={tabIndicatorStyle}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className={cn(
            "absolute top-1 bottom-1 rounded-full",
            isDarkMode ? "bg-white/12" : "bg-black"
          )}
        />
      </div>

      {activeTab === "summary" && (
        <div className="mx-auto min-h-[400px] w-full max-w-none">
          <div className="mt-3 min-h-0 lg:grid lg:grid-cols-[minmax(0,0.92fr)_720px] lg:gap-3">
            <div className="min-h-0">{alignedComboMonthlyTrendCard}</div>
            <div className="hidden min-h-0 overflow-visible lg:block">
              {summaryRightPlaceholderCard}
              {summaryBreakdownCard}
            </div>
          </div>
        </div>
      )}

      {activeTab === "sites" && (
        <div className="-mt-2 space-y-0">
          <div className="pointer-events-none relative z-10 -mb-4 flex items-center justify-end">
            <button
              type="button"
              onClick={onOpenCreateSiteModal}
              className="project-create-trigger site-create-trigger pointer-events-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white bg-white px-2 text-[13px] font-semibold text-slate-950 transition"
            >
              페이지 추가
            </button>
          </div>

          <div className="project-list-table overflow-visible bg-transparent">
            <div className="overflow-visible">
              <table className="w-full table-fixed text-left">
              <colgroup>
                <col className="w-[64px]" />
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
                      className="flex h-8 w-full items-center justify-center px-2 text-center cursor-pointer select-none"
                    >
                      <span className="relative inline-flex items-center justify-center">
                        종류
                        {getCenteredSiteSortIndicator("targetType")}
                      </span>
                    </button>
                  </th>
                  <th className="h-8 py-0 font-medium align-middle">
                    <button
                      type="button"
                      onClick={() => handleSiteSort("siteName")}
                      className="flex h-8 w-full items-center gap-1 px-4 text-left cursor-pointer select-none"
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
                      className="flex h-8 w-full items-center gap-1 px-4 text-left cursor-pointer select-none"
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
                      <td className="relative px-2 py-1.5 align-middle text-slate-600">
                        <div className="group/target-type relative flex items-center justify-center">
                          <span
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition ${
                              isDarkMode ? "group-hover/target-type:bg-white/[0.06]" : "group-hover/target-type:bg-slate-100"
                            }`}
                            aria-label={getTargetTypeInfo(row.targetType)}
                          >
                            {renderTargetTypeIcon(row.targetType)}
                          </span>
                          <span
                            className={`pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium opacity-0 transition group-hover/target-type:opacity-100 ${
                              isDarkMode ? "bg-[#11141a] text-white" : "border border-slate-200 bg-white text-slate-900"
                            }`}
                          >
                            {getTargetTypeInfo(row.targetType)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-1.5 align-middle">
                        <div className="min-w-0">
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
                                className={`pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium opacity-0 transition group-hover/action:opacity-100 ${
                                  index === 0 ? "top-full mt-2" : "bottom-full mb-2"
                                } ${
                                  isDarkMode ? "bg-[#11141a] text-white" : "border border-slate-200 bg-white text-slate-900"
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
                                className={`pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium opacity-0 transition group-hover/action:opacity-100 ${
                                  index === 0 ? "top-full mt-2" : "bottom-full mb-2"
                                } ${
                                  isDarkMode ? "bg-[#11141a] text-white" : "border border-slate-200 bg-white text-slate-900"
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
