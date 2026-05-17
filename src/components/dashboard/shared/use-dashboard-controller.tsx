import { FileBarChart2, FolderKanban, LayoutDashboard } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { SidebarItem } from "@/components/ui/sidebar";
import { buildApiUrl } from "@/config/api";
import { fetchDashboardViewModel } from "@/services/backend-api";
import type { CreateEvaluationTargetInput as CreateEvaluationTargetModelInput, DashboardViewModel, MenuType } from "@/types/accessibility-domain";

import type { DashboardRouteState } from "./types";
import { useDashboardTheme } from "./use-dashboard-theme";
import { formatDateTime } from "./utils";

const RESCAN_RESULT_POLL_ATTEMPTS = 12;
const RESCAN_RESULT_POLL_INTERVAL_MS = 2000;

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function getPayloadRequestId(payload: unknown): number | null {
  const requestPayload = isRecord(payload) && isRecord(payload.evaluation_request)
    ? payload.evaluation_request
    : isRecord(payload) && isRecord(payload.data)
      ? payload.data
      : null;
  const requestId = requestPayload?.id;

  return typeof requestId === "number" ? requestId : null;
}

function getLatestRequestForTarget(data: DashboardViewModel | null, targetId: number) {
  return [...(data?.evaluationRequests ?? [])]
    .filter((request) => request.evaluationTargetId === targetId)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] ?? null;
}

function isFinalRequestStatus(status: string) {
  return status === "COMPLETED" || status === "FAILED";
}

function parseDashboardRoute(pathname: string): DashboardRouteState {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] === "reports") {
    return {
      menu: "reports" as MenuType,
      selectedOrganizationModelId: null,
      selectedEvaluationTargetModelId: null
    };
  }

  if (segments[0] === "projects") {
    const projectId = segments[1] ? Number(segments[1]) : null;
    const siteId = (segments[2] === "pages" || segments[2] === "sites") && segments[3] ? Number(segments[3]) : null;

    return {
      menu: "projects" as MenuType,
      selectedOrganizationModelId: projectId && !Number.isNaN(projectId) ? projectId : null,
      selectedEvaluationTargetModelId: siteId && !Number.isNaN(siteId) ? siteId : null
    };
  }

  return {
    menu: "dashboard" as MenuType,
    selectedOrganizationModelId: null,
    selectedEvaluationTargetModelId: null
  };
}

export function useDashboardController({
  onBootstrapComplete
}: {
  onBootstrapComplete?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDarkMode, themeMode, setThemeMode } = useDashboardTheme();
  const routeState = useMemo(() => parseDashboardRoute(location.pathname), [location.pathname]);

  const [isSiteCreateOpen, setIsSiteCreateOpen] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardViewModel | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const [isCreatingOrganizationModel, setIsCreatingOrganizationModel] = useState(false);
  const [projectCreateError, setProjectCreateError] = useState("");
  const [newOrganizationModelName, setNewOrganizationModelName] = useState("");
  const [newOrganizationModelDescription, setNewOrganizationModelDescription] = useState("");
  const [isOrganizationCreateOpen, setIsOrganizationCreateOpen] = useState(false);
  const [isRescanningSite, setIsRescanningSite] = useState(false);
  const isRefreshingRef = useRef(false);
  const isBootstrappedRef = useRef(false);

  const loadDashboard = useCallback(
    async ({
      showLoading = false,
      clearOnError = false,
      signal
    }: {
      showLoading?: boolean;
      clearOnError?: boolean;
      signal?: AbortSignal;
    } = {}) => {
      if (isRefreshingRef.current && !showLoading) {
        return null;
      }
      isRefreshingRef.current = true;
      let didAbort = false;

      if (showLoading) {
        setIsDashboardLoading(true);
      }

      try {
        const nextData = await fetchDashboardViewModel(signal);
        setDashboardData(nextData);
        setDashboardError("");
        return nextData;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          didAbort = true;
          return null;
        }
        setDashboardError(error instanceof Error ? error.message : "대시보드 데이터를 가져오지 못했습니다.");
        if (clearOnError) {
          setDashboardData(null);
        }
        return null;
      } finally {
        isRefreshingRef.current = false;

        if (didAbort) {
          return;
        }

        if (showLoading && !isBootstrappedRef.current) {
          isBootstrappedRef.current = true;
          onBootstrapComplete?.();
        }

        if (showLoading) {
          setIsDashboardLoading(false);
        }
      }
    },
    [onBootstrapComplete]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboard({ showLoading: true, clearOnError: true, signal: controller.signal });

    const intervalId = window.setInterval(() => {
      void loadDashboard();
    }, 5000);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [loadDashboard]);

  const selectedOrganizationModel = useMemo(() => {
    if (routeState.selectedOrganizationModelId === null) {
      return null;
    }

    return dashboardData?.organizations.find((organization) => organization.id === routeState.selectedOrganizationModelId) ?? null;
  }, [dashboardData?.organizations, routeState.selectedOrganizationModelId]);

  const selectedEvaluationTargetModel = useMemo(() => {
    if (!selectedOrganizationModel || routeState.selectedEvaluationTargetModelId === null) {
      return null;
    }

    return (
      selectedOrganizationModel.evaluationTargets.find((target) => target.id === routeState.selectedEvaluationTargetModelId) ?? null
    );
  }, [routeState.selectedEvaluationTargetModelId, selectedOrganizationModel]);

  const isProjectDetailView =
    routeState.menu === "projects" &&
    selectedOrganizationModel !== null &&
    selectedEvaluationTargetModel === null;
  const isSiteDetailView =
    routeState.menu === "projects" &&
    selectedOrganizationModel !== null &&
    selectedEvaluationTargetModel !== null;

  useEffect(() => {
    if (!selectedOrganizationModel) {
      setIsSiteCreateOpen(false);
    }
  }, [selectedOrganizationModel]);

  useEffect(() => {
    if (!dashboardData || routeState.selectedOrganizationModelId === null) {
      return;
    }

    const projectStillExists = dashboardData.organizations.some((project) => project.id === routeState.selectedOrganizationModelId);
    if (!projectStillExists) {
      navigate("/projects", { replace: true });
    }
  }, [dashboardData, navigate, routeState.selectedOrganizationModelId]);

  useEffect(() => {
    if (!selectedOrganizationModel || routeState.selectedEvaluationTargetModelId === null) {
      return;
    }

    const siteStillExists = selectedOrganizationModel.evaluationTargets.some(
      (target) => target.id === routeState.selectedEvaluationTargetModelId
    );
    if (!siteStillExists) {
      navigate(`/projects/${routeState.selectedOrganizationModelId}`, { replace: true });
    }
  }, [navigate, routeState.selectedEvaluationTargetModelId, routeState.selectedOrganizationModelId, selectedOrganizationModel]);

  const handleCreateOrganizationModel = useCallback(async () => {
    const name = newOrganizationModelName.trim();
    if (name.length === 0) {
      setProjectCreateError("프로젝트 이름은 필수입니다.");
      return;
    }

    setIsCreatingOrganizationModel(true);
    setProjectCreateError("");

    try {
      const response = await fetch(buildApiUrl("/organizations"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          name,
          description: newOrganizationModelDescription.trim()
        })
      });

      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          payload !== null && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `HTTP ${response.status}`;
        throw new Error(message);
      }

      await loadDashboard({ clearOnError: false });
      setNewOrganizationModelName("");
      setNewOrganizationModelDescription("");
      setIsOrganizationCreateOpen(false);
      navigate("/projects");
    } catch (error) {
      setProjectCreateError(error instanceof Error ? error.message : "프로젝트 생성 중 오류가 발생했습니다.");
    } finally {
      setIsCreatingOrganizationModel(false);
    }
  }, [loadDashboard, navigate, newOrganizationModelDescription, newOrganizationModelName]);

  const handleUpdateOrganizationModel = useCallback(
    async ({ projectId, name, description }: { projectId: number; name: string; description: string }) => {
      const response = await fetch(buildApiUrl(`/organizations/${projectId}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          name,
          description
        })
      });

      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          payload !== null && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `HTTP ${response.status}`;
        throw new Error(message);
      }

      await loadDashboard({ clearOnError: false });
    },
    [loadDashboard]
  );

  const handleDeleteOrganizationModel = useCallback(
    async (projectId: number) => {
      const response = await fetch(buildApiUrl(`/organizations/${projectId}`), {
        method: "DELETE",
        headers: {
          Accept: "application/json"
        }
      });

      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          payload !== null && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `HTTP ${response.status}`;
        throw new Error(message);
      }

      if (routeState.selectedOrganizationModelId === projectId) {
        navigate("/projects", { replace: true });
      }

      await loadDashboard({ clearOnError: false });
    },
    [loadDashboard, navigate, routeState.selectedOrganizationModelId]
  );

  const handleCreateEvaluationTargetModel = useCallback(
    async ({ projectId, name, accessUrl }: CreateEvaluationTargetModelInput) => {
      const response = await fetch(buildApiUrl(`/organizations/${projectId}/evaluation-targets`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          name,
          accessUrl
        })
      });

      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          payload !== null && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `HTTP ${response.status}`;
        throw new Error(message);
      }

      await loadDashboard({ clearOnError: false });
    },
    [loadDashboard]
  );

  const handleUpdateEvaluationTargetModel = useCallback(
    async ({
      projectId,
      siteId,
      name,
      accessUrl
    }: {
      projectId: number;
      siteId: number;
      name: string;
      accessUrl: string;
    }) => {
      const response = await fetch(buildApiUrl(`/organizations/${projectId}/evaluation-targets/${siteId}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          name,
          accessUrl
        })
      });

      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          payload !== null && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `HTTP ${response.status}`;
        throw new Error(message);
      }

      await loadDashboard({ clearOnError: false });
    },
    [loadDashboard]
  );

  const handleDeleteEvaluationTargetModel = useCallback(
    async ({ projectId, siteId }: { projectId: number; siteId: number }) => {
      const response = await fetch(buildApiUrl(`/organizations/${projectId}/evaluation-targets/${siteId}`), {
        method: "DELETE",
        headers: {
          Accept: "application/json"
        }
      });

      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          payload !== null && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `HTTP ${response.status}`;
        throw new Error(message);
      }

      await loadDashboard({ clearOnError: false });
    },
    [loadDashboard]
  );
  const handleRescanEvaluationTargetModel = useCallback(async () => {
    if (!selectedOrganizationModel || !selectedEvaluationTargetModel || isRescanningSite) {
      return;
    }

    const targetId = selectedEvaluationTargetModel.id;
    const previousLatestRequest = getLatestRequestForTarget(dashboardData, targetId);
    setIsRescanningSite(true);
    try {
      const response = await fetch(
        buildApiUrl(`/evaluation-targets/${targetId}/evaluation-requests`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({})
        }
      );

      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          payload !== null && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `HTTP ${response.status}`;
        throw new Error(message);
      }

      const createdRequestId = getPayloadRequestId(payload);
      for (let attempt = 0; attempt < RESCAN_RESULT_POLL_ATTEMPTS; attempt += 1) {
        if (attempt > 0) {
          await wait(RESCAN_RESULT_POLL_INTERVAL_MS);
        }

        const refreshedData = await loadDashboard({ clearOnError: false });
        const latestRequest =
          createdRequestId === null
            ? getLatestRequestForTarget(refreshedData ?? null, targetId)
            : refreshedData?.evaluationRequests.find((request) => request.id === createdRequestId) ?? null;

        if (!latestRequest) {
          continue;
        }

        const isCreatedOrUpdatedRequest =
          createdRequestId !== null ||
          previousLatestRequest === null ||
          latestRequest.id !== previousLatestRequest.id ||
          Date.parse(latestRequest.updatedAt) > Date.parse(previousLatestRequest.updatedAt);

        if (isCreatedOrUpdatedRequest && isFinalRequestStatus(latestRequest.status)) {
          break;
        }
      }
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : "다시 스캔 요청 중 오류가 발생했습니다.");
    } finally {
      setIsRescanningSite(false);
    }
  }, [dashboardData, isRescanningSite, loadDashboard, selectedEvaluationTargetModel, selectedOrganizationModel]);

  const sidebarLinks: SidebarItem[] = useMemo(
    () => [
      {
        label: "대시보드",
        href: "/dashboard",
        icon: <LayoutDashboard size={18} />,
        onClick: () => navigate("/dashboard"),
        active: routeState.menu === "dashboard"
      },
      {
        label: "프로젝트",
        href: "/projects",
        icon: <FolderKanban size={18} />,
        onClick: () => navigate("/projects"),
        active: routeState.menu === "projects" || routeState.menu === "project-create"
      },
      {
        label: "리포트",
        href: "/reports",
        icon: <FileBarChart2 size={18} />,
        onClick: () => navigate("/reports"),
        active: routeState.menu === "reports"
      }
    ],
    [navigate, routeState.menu]
  );

  const headerLabel =
    routeState.menu === "dashboard"
      ? "Dashboard"
      : routeState.menu === "reports"
        ? "Report"
        : isSiteDetailView
          ? "Page Details"
          : isProjectDetailView
            ? "Project Details"
            : "Project";
  const headerTitle =
    routeState.menu === "dashboard"
      ? "대시보드"
      : routeState.menu === "reports"
        ? "리포트"
        : isSiteDetailView
          ? selectedEvaluationTargetModel.name
          : isProjectDetailView
            ? selectedOrganizationModel.name
            : "프로젝트";
  const headerDescription = isSiteDetailView
    ? selectedEvaluationTargetModel.accessUrl
    : isProjectDetailView
      ? selectedOrganizationModel.description || "설명이 없습니다."
      : "";
  const headerDescriptionHref = isSiteDetailView ? headerDescription : "";
  const siteLatestScanLabel = useMemo(() => {
    if (!isSiteDetailView || !selectedEvaluationTargetModel) {
      return "";
    }

    const latestUpdatedAt = (dashboardData?.evaluationRequests ?? [])
      .filter((request) => request.evaluationTargetId === selectedEvaluationTargetModel.id)
      .map((request) => request.updatedAt)
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0];

    return latestUpdatedAt ? formatDateTime(latestUpdatedAt) : "스캔 기록 없음";
  }, [dashboardData?.evaluationRequests, isSiteDetailView, selectedEvaluationTargetModel]);

  const goToProject = useCallback(
    (projectId: number) => {
      navigate(`/projects/${projectId}`);
    },
    [navigate]
  );
  const goToProjectsRoot = useCallback(() => {
    navigate("/projects");
  }, [navigate]);
  const goToSite = useCallback(
    (siteId: number) => {
      if (!selectedOrganizationModel) {
        return;
      }
      navigate(`/projects/${selectedOrganizationModel.id}/pages/${siteId}`);
    },
    [navigate, selectedOrganizationModel]
  );
  const goToSiteByIds = useCallback(
    ({ projectId, siteId }: { projectId: number; siteId: number }) => {
      navigate(`/projects/${projectId}/pages/${siteId}`);
    },
    [navigate]
  );
  const goBackToProject = useCallback(() => {
    if (!selectedOrganizationModel) {
      return;
    }
    navigate(`/projects/${selectedOrganizationModel.id}`);
  }, [navigate, selectedOrganizationModel]);
  return {
    dashboardData,
    dashboardError,
    goBackToProject,
    goToProject,
    goToProjectsRoot,
    goToSite,
    goToSiteByIds,
    handleCreateEvaluationTargetModel,
    handleDeleteEvaluationTargetModel,
    handleCreateOrganizationModel,
    handleUpdateEvaluationTargetModel,
    handleDeleteOrganizationModel,
    handleUpdateOrganizationModel,
    handleRescanEvaluationTargetModel,
    headerDescription,
    headerDescriptionHref,
    headerLabel,
    headerTitle,
    isCreatingOrganizationModel,
    isDashboardLoading,
    isDarkMode,
    isOrganizationCreateOpen,
    isRescanningSite,
    isSiteCreateOpen,
    menu: routeState.menu,
    newOrganizationModelDescription,
    newOrganizationModelName,
    openOrganizationCreateModal: () => {
      setProjectCreateError("");
      setIsOrganizationCreateOpen(true);
    },
    openSiteCreateModal: () => {
      setIsSiteCreateOpen(true);
    },
    projectCreateError,
    selectedEvaluationTargetModel,
    selectedOrganizationModel,
    siteLatestScanLabel,
    setIsOrganizationCreateOpen,
    setIsSiteCreateOpen,
    setNewOrganizationModelDescription,
    setNewOrganizationModelName,
    setThemeMode,
    sidebarLinks,
    themeMode
  };
}
