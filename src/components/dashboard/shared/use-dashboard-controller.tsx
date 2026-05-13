import { FileBarChart2, FolderKanban, LayoutDashboard } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { SidebarItem } from "@/components/ui/sidebar";
import { buildApiUrl } from "@/config/api";
import type { CreateEvaluationTargetInput as CreateEvaluationTargetModelInput, DashboardApiResponse, DashboardViewModel, MenuType } from "@/types/accessibility-domain";

import { mapDashboardResponseToViewModel } from "./data-mappers";
import type { DashboardRouteState } from "./types";
import { useDashboardTheme } from "./use-dashboard-theme";
import { formatDateTime } from "./utils";

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

const requiredDashboardResponseCollections = [
  "organizations",
  "evaluation_targets",
  "evaluation_requests",
  "analysis_results",
  "issue_results",
  "score_results"
] as const;

function isDashboardApiResponse(payload: unknown): payload is DashboardApiResponse {
  if (payload === null || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  const hasRequiredCollections = requiredDashboardResponseCollections.every((key) => Array.isArray(record[key]));
  const hasValidOptionalCollections =
    (record.score_details === undefined || Array.isArray(record.score_details)) &&
    (record.improvement_guides === undefined || Array.isArray(record.improvement_guides));

  return hasRequiredCollections && hasValidOptionalCollections;
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
        return;
      }
      isRefreshingRef.current = true;
      let didAbort = false;

      if (showLoading) {
        setIsDashboardLoading(true);
      }

      try {
        const response = await fetch(buildApiUrl("/dashboard"), {
          method: "GET",
          headers: {
            Accept: "application/json"
          },
          signal
        });

        const payload: unknown = await response.json();

        if (!response.ok) {
          const message =
            payload !== null && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : `HTTP ${response.status}`;
          throw new Error(message);
        }

        if (!isDashboardApiResponse(payload)) {
          throw new Error("대시보드 응답 형식이 올바르지 않습니다.");
        }

        setDashboardData(mapDashboardResponseToViewModel(payload));
        setDashboardError("");
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          didAbort = true;
          return;
        }
        setDashboardError(error instanceof Error ? error.message : "대시보드 데이터를 가져오지 못했습니다.");
        if (clearOnError) {
          setDashboardData(null);
        }
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
      selectedOrganizationModel.evaluation_targets.find((target) => target.id === routeState.selectedEvaluationTargetModelId) ?? null
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

    const siteStillExists = selectedOrganizationModel.evaluation_targets.some(
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
    async ({ projectId, name, access_url }: CreateEvaluationTargetModelInput) => {
      const response = await fetch(buildApiUrl(`/organizations/${projectId}/evaluation-targets`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          name,
          access_url
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
      access_url
    }: {
      projectId: number;
      siteId: number;
      name: string;
      access_url: string;
    }) => {
      const response = await fetch(buildApiUrl(`/organizations/${projectId}/evaluation-targets/${siteId}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          name,
          access_url
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

    setIsRescanningSite(true);
    try {
      const response = await fetch(
        buildApiUrl(`/evaluation-targets/${selectedEvaluationTargetModel.id}/evaluation-requests`),
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

      await loadDashboard({ clearOnError: false });
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : "다시 스캔 요청 중 오류가 발생했습니다.");
    } finally {
      setIsRescanningSite(false);
    }
  }, [isRescanningSite, loadDashboard, selectedEvaluationTargetModel, selectedOrganizationModel]);

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
    ? selectedEvaluationTargetModel.access_url
    : isProjectDetailView
      ? selectedOrganizationModel.description || "설명이 없습니다."
      : "";
  const headerDescriptionHref = isSiteDetailView ? headerDescription : "";
  const siteLatestScanLabel = useMemo(() => {
    if (!isSiteDetailView || !selectedEvaluationTargetModel) {
      return "";
    }

    const latestUpdatedAt = (dashboardData?.evaluation_requests ?? [])
      .filter((request) => request.evaluation_target_id === selectedEvaluationTargetModel.id)
      .map((request) => request.updated_at)
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0];

    return latestUpdatedAt ? formatDateTime(latestUpdatedAt) : "스캔 기록 없음";
  }, [dashboardData?.evaluation_requests, isSiteDetailView, selectedEvaluationTargetModel]);

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
