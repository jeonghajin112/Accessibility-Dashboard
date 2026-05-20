import { useCallback, useEffect, useRef, useState } from "react";

import { fetchDashboardViewModel, getApiErrorMessage, isAbortError } from "@/services/backend-api";
import type { DashboardViewModel } from "@/types/accessibility-domain";

type LoadDashboardOptions = {
  showLoading?: boolean;
  clearOnError?: boolean;
  signal?: AbortSignal;
};

export type LoadDashboard = (options?: LoadDashboardOptions) => Promise<DashboardViewModel | null>;

export function useDashboardData({
  onBootstrapComplete
}: {
  onBootstrapComplete?: () => void;
}) {
  const [dashboardData, setDashboardData] = useState<DashboardViewModel | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const isRefreshingRef = useRef(false);
  const isBootstrappedRef = useRef(false);

  const loadDashboard = useCallback<LoadDashboard>(
    async ({ showLoading = false, clearOnError = false, signal } = {}) => {
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
        if (isAbortError(error)) {
          didAbort = true;
          return null;
        }

        setDashboardError(getApiErrorMessage(error, "대시보드 데이터를 가져오지 못했습니다."));
        if (clearOnError) {
          setDashboardData(null);
        }
        return null;
      } finally {
        isRefreshingRef.current = false;

        if (didAbort) {
          return null;
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

  return {
    dashboardData,
    dashboardError,
    isDashboardLoading,
    loadDashboard,
    setDashboardError
  };
}
