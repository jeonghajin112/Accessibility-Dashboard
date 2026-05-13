import { Sidebar, SidebarBody, SidebarLink } from "@/components/ui/sidebar";
import { ToggleTheme } from "@/components/ui/toggle-theme";
import { LogOut, Menu, MoveRight, RefreshCw } from "lucide-react";
import { Suspense, lazy, useState } from "react";

import { OrganizationModelCreateModal } from "./modals/organization-model-create-modal";
import { SiteCreateModal } from "./modals/site-create-modal";
import { BridgeLogo } from "./shared/display";
import { useDashboardController } from "./shared/use-dashboard-controller";
import type { SidebarDemoProps } from "./shared/types";

const DashboardPanel = lazy(() => import("./panels/dashboard-panel").then((module) => ({ default: module.DashboardPanel })));
const OrganizationModelDetailPanel = lazy(() =>
  import("./panels/project-detail-panel").then((module) => ({ default: module.OrganizationModelDetailPanel }))
);
const OrganizationModelsPanel = lazy(() =>
  import("./panels/projects-panel").then((module) => ({ default: module.OrganizationModelsPanel }))
);
const ReportsPanel = lazy(() => import("./panels/reports-panel").then((module) => ({ default: module.ReportsPanel })));
const SiteDashboardPanel = lazy(() =>
  import("./panels/site-dashboard-panel").then((module) => ({ default: module.SiteDashboardPanel }))
);

function DashboardPanelFallback() {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-5 text-sm text-slate-600">
      화면을 불러오는 중...
    </article>
  );
}

export function SidebarDemo({ onLogout, userName, onBootstrapComplete }: SidebarDemoProps) {
  const [open, setOpen] = useState(false);
  const dashboard = useDashboardController({ onBootstrapComplete });
  const today = new Date();
  const currentDay = today.getDate();
  const currentWeekday = new Intl.DateTimeFormat("ko-KR", { weekday: "long" }).format(today);
  const currentMonth = new Intl.DateTimeFormat("ko-KR", { month: "long" }).format(today);
  const currentYear = today.getFullYear();
  const isDashboardHome = dashboard.menu === "dashboard";
  const shouldShowHeaderTitle =
    dashboard.menu !== "dashboard" && !(dashboard.menu === "projects" && !dashboard.selectedOrganizationModel);
  const hasCompactTopZone = !isDashboardHome && !shouldShowHeaderTitle;
  const shouldShowSiteHeaderActions =
    dashboard.menu === "projects" && Boolean(dashboard.selectedEvaluationTargetModel);

  return (
    <main
      className={`bridge-dashboard ${hasCompactTopZone ? "dashboard-compact-top" : ""} min-h-screen w-screen p-0 ${
        dashboard.isDarkMode ? "" : "bg-white"
      } ${dashboard.isDarkMode ? "theme-dark" : "theme-light"}`}
    >
      <div className="dashboard-shell flex min-h-screen w-full flex-col bg-transparent md:flex-row">
        <Sidebar open={open} setOpen={setOpen}>
          <SidebarBody className="justify-between gap-6">
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden">
              <BridgeLogo />
              <div className="flex flex-col gap-2">
                {dashboard.sidebarLinks.map((link) => (
                  <SidebarLink key={link.label} link={link} />
                ))}
                {onLogout && (
                  <SidebarLink
                    link={{
                      label: "로그아웃",
                      onClick: onLogout,
                      icon: <LogOut size={18} />
                    }}
                    className="sidebar-logout mt-1 hover:border-red-300 hover:text-red-700"
                  />
                )}
              </div>
            </div>
          </SidebarBody>
        </Sidebar>

        <section className="min-w-0 flex-1 overflow-visible">
          <div className="dashboard-top-zone relative px-4 sm:px-7 lg:px-10">
          <header className="dashboard-fixed-header absolute top-4 right-4 left-4 z-30 flex items-start justify-between gap-5 sm:top-7 sm:right-7 sm:left-7 lg:top-10 lg:right-10 lg:left-10">
            <div className="flex min-w-0 items-start gap-4">
              <button
                type="button"
                className="dashboard-menu-trigger inline-flex shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/80 text-slate-900 shadow-[0_16px_34px_rgba(31,27,24,0.08)] backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                aria-label="사이드바 열기"
                aria-expanded={open}
                onClick={() => setOpen(true)}
              >
                <Menu className="dashboard-menu-icon" strokeWidth={2} />
              </button>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="dashboard-header-logo inline-flex shrink-0 items-center justify-center rounded-full bg-[#111111] font-black tracking-tight text-white shadow-[0_14px_28px_rgba(17,17,17,0.14)]">
                    UA
                  </span>
                  <div className="min-w-0 leading-tight">
                    <p className="dashboard-brand-title truncate font-bold tracking-tight text-slate-900">UNI ACCESS</p>
                    <p className="dashboard-brand-subtitle truncate font-medium text-slate-500">{dashboard.headerLabel}</p>
                  </div>
                </div>
              </div>
            </div>

            {shouldShowHeaderTitle && (
              <div className="pointer-events-auto absolute left-6 right-0 top-[calc(var(--dashboard-control-size)+4.25rem)] flex min-w-0 items-start justify-between gap-6">
                <div className="min-w-0">
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{dashboard.headerTitle}</h1>
                  {dashboard.headerDescription.length > 0 && (
                  dashboard.headerDescriptionHref ? (
                    <a
                      href={dashboard.headerDescriptionHref}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex max-w-full truncate text-sm text-slate-500 underline underline-offset-4 transition-colors hover:text-slate-700"
                      title={dashboard.headerDescription}
                    >
                      {dashboard.headerDescription}
                    </a>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">{dashboard.headerDescription}</p>
                  )
                  )}
                </div>

                {shouldShowSiteHeaderActions && (
                  <div className="mt-1 flex shrink-0 items-center gap-3 pr-2">
                    <div className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                      <span className="text-slate-400">최근 스캔일</span>
                      <span className="ml-2 text-slate-900">{dashboard.siteLatestScanLabel}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void dashboard.handleRescanEvaluationTargetModel();
                      }}
                      disabled={dashboard.isRescanningSite}
                      className="inline-flex h-9 items-center gap-2 rounded-full bg-slate-950 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      <RefreshCw size={14} className={dashboard.isRescanningSite ? "animate-spin" : ""} />
                      {dashboard.isRescanningSite ? "스캔 중" : "다시 스캔"}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex shrink-0 items-center gap-3">
              <ToggleTheme value={dashboard.themeMode} onChange={dashboard.setThemeMode} isDark={dashboard.isDarkMode} />
              <div className="dashboard-header-account flex items-center gap-3">
                <span className="dashboard-account-avatar inline-flex shrink-0 items-center justify-center rounded-full bg-[#ef6a50] font-bold text-white">
                  {userName.slice(0, 1)}
                </span>
                <div className="hidden min-w-0 pr-2 leading-tight sm:block">
                  <p className="dashboard-account-name max-w-36 truncate font-bold text-slate-900">{userName}</p>
                  <p className="dashboard-account-role mt-0.5 font-medium text-slate-500">Admin</p>
                </div>
              </div>
            </div>
          </header>

          <div className={`dashboard-date-widget absolute ${isDashboardHome ? "flex" : "hidden"} flex-wrap items-center`}>
            <div className="dashboard-date-day inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-tight">
              {currentDay}
            </div>
            <div className="dashboard-date-copy leading-tight">
              <p className="dashboard-date-text font-bold tracking-tight text-slate-900">{currentWeekday},</p>
              <p className="dashboard-date-text font-bold text-slate-900">{currentMonth}, {currentYear}년</p>
            </div>
            <span aria-hidden className="dashboard-date-separator hidden w-px sm:block" />
            <button
              type="button"
              className="dashboard-date-action inline-flex items-center rounded-full font-semibold text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              onClick={dashboard.goToProjectsRoot}
            >
              접근성 검사 시작
              <MoveRight size={22} strokeWidth={1.65} />
            </button>
          </div>

          <div className={`dashboard-help-copy pointer-events-none absolute ${isDashboardHome ? "hidden text-left md:block" : "hidden"}`}>
            <p className="dashboard-help-title font-bold tracking-tight text-slate-900">
              접근성 점검이 필요하신가요?
            </p>
            <p className="dashboard-help-subtitle font-medium text-slate-400">
              <span className="font-bold text-[#ef6a50]">UNIACCESS</span>에서 바로 시작해보세요.
            </p>
          </div>
          </div>

          <div className="dashboard-content-zone px-4 py-3 sm:px-7 sm:py-4 lg:px-10 lg:py-4">
          <Suspense fallback={<DashboardPanelFallback />}>
            {dashboard.menu === "dashboard" && (
              <DashboardPanel
                data={dashboard.dashboardData}
                isLoading={dashboard.isDashboardLoading}
                errorMessage={dashboard.dashboardError}
                isDarkMode={dashboard.isDarkMode}
                onSiteClick={dashboard.goToSiteByIds}
              />
            )}

            {dashboard.menu === "projects" && (
              <>
                {dashboard.selectedOrganizationModel && dashboard.selectedEvaluationTargetModel ? (
                  <SiteDashboardPanel
                    organization={dashboard.selectedOrganizationModel}
                    evaluationTarget={dashboard.selectedEvaluationTargetModel}
                    evaluationRequests={dashboard.dashboardData?.evaluation_requests ?? []}
                    analysisResults={dashboard.dashboardData?.analysis_results ?? []}
                    scoreResults={dashboard.dashboardData?.score_results ?? []}
                    issueResults={dashboard.dashboardData?.issue_results ?? []}
                    improvementGuides={dashboard.dashboardData?.improvement_guides ?? []}
                  />
                ) : dashboard.selectedOrganizationModel ? (
                  <OrganizationModelDetailPanel
                    organization={dashboard.selectedOrganizationModel}
                    evaluationRequests={dashboard.dashboardData?.evaluation_requests ?? []}
                    analysisResults={dashboard.dashboardData?.analysis_results ?? []}
                    scoreResults={dashboard.dashboardData?.score_results ?? []}
                    issueResults={dashboard.dashboardData?.issue_results ?? []}
                    isDarkMode={dashboard.isDarkMode}
                    onDeleteEvaluationTargetModel={dashboard.handleDeleteEvaluationTargetModel}
                    onOpenCreateSiteModal={dashboard.openSiteCreateModal}
                    onSiteClick={dashboard.goToSite}
                    onUpdateEvaluationTargetModel={dashboard.handleUpdateEvaluationTargetModel}
                  />
                ) : (
                  <OrganizationModelsPanel
                    organizations={dashboard.dashboardData?.organizations ?? []}
                    isLoading={dashboard.isDashboardLoading}
                    errorMessage={dashboard.dashboardError}
                    isDarkMode={dashboard.isDarkMode}
                    onUpdateOrganizationModel={dashboard.handleUpdateOrganizationModel}
                    onDeleteOrganizationModel={dashboard.handleDeleteOrganizationModel}
                    onOrganizationModelClick={dashboard.goToProject}
                    onGoToCreatePage={dashboard.openOrganizationCreateModal}
                  />
                )}
              </>
            )}

            {dashboard.menu === "reports" && (
              <ReportsPanel
                scoreResults={dashboard.dashboardData?.score_results ?? []}
                issueResults={dashboard.dashboardData?.issue_results ?? []}
                isLoading={dashboard.isDashboardLoading}
                errorMessage={dashboard.dashboardError}
              />
            )}
          </Suspense>
          </div>

          {dashboard.selectedOrganizationModel && (
            <SiteCreateModal
              isOpen={dashboard.isSiteCreateOpen}
              isDarkMode={dashboard.isDarkMode}
              project={dashboard.selectedOrganizationModel}
              onAddEvaluationTargetModel={dashboard.handleCreateEvaluationTargetModel}
              onClose={() => dashboard.setIsSiteCreateOpen(false)}
            />
          )}

          <OrganizationModelCreateModal
            isOpen={dashboard.isOrganizationCreateOpen}
            isDarkMode={dashboard.isDarkMode}
            name={dashboard.newOrganizationModelName}
            description={dashboard.newOrganizationModelDescription}
            isSubmitting={dashboard.isCreatingOrganizationModel}
            errorMessage={dashboard.projectCreateError}
            onNameChange={dashboard.setNewOrganizationModelName}
            onDescriptionChange={dashboard.setNewOrganizationModelDescription}
            onClose={() => {
              if (dashboard.isCreatingOrganizationModel) {
                return;
              }
              dashboard.setIsOrganizationCreateOpen(false);
            }}
            onSubmit={dashboard.handleCreateOrganizationModel}
          />
        </section>
      </div>
    </main>
  );
}
