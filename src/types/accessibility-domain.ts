export type MenuType = "dashboard" | "projects" | "reports" | "project-create";

export type SeverityLevel = "critical" | "high" | "medium" | "low";

export type Organization = {
  id: number;
  name: string;
  type: string;
  homepage_url: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type EvaluationTarget = {
  id: number;
  organization_id: number;
  name: string;
  target_type: string;
  access_url: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type EvaluationRequest = {
  id: number;
  evaluation_target_id: number;
  status: string;
  request_note: string;
  requested_at: string;
  created_at: string;
  updated_at: string;
};

export type AnalysisResult = {
  id: number;
  evaluation_request_id: number;
  analyzer_type: string;
  status: string;
  summary: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type IssueResult = {
  id: number;
  analysis_result_id: number;
  issue_code: string;
  issue_title: string;
  severity: SeverityLevel;
  location_path: string;
  message: string;
  resolved: boolean;
  created_at: string;
  updated_at: string;
};

export type ScoreResult = {
  id: number;
  evaluation_request_id: number;
  total_score: number;
  rule_score: number;
  ai_score: number;
  cv_score: number;
  created_at: string;
  updated_at: string;
};

export type ScoreDetail = {
  id: number;
  score_result_id: number;
  category: string;
  score: number;
  max_score: number;
  comment: string;
  created_at: string;
  updated_at: string;
};

export type ImprovementGuide = {
  id: number;
  issue_result_id: number;
  title: string;
  guide_content: string;
  example_code: string;
  recommendation: string;
  created_at: string;
  updated_at: string;
};

export type EvaluationTargetModel = {
  id: number;
  name: string;
  target_type: string;
  access_url: string;
  status: string;
  created_at: string;
};

export type OrganizationModel = {
  id: number;
  name: string;
  type: string;
  homepage_url: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  evaluation_targets: EvaluationTargetModel[];
};

export type EvaluationRequestModel = {
  id: number;
  evaluation_target_id: number;
  status: string;
  request_note: string;
  requested_at: string;
  created_at: string;
  updated_at: string;
};

export type IssueResultModel = {
  id: number;
  analysis_result_id: number;
  issue_code: string;
  issue_title: string;
  severity: SeverityLevel;
  location_path: string;
  message: string;
  resolved: boolean;
  created_at: string;
  updated_at: string;
};

export type DashboardViewModel = {
  organizations: OrganizationModel[];
  evaluation_requests: EvaluationRequestModel[];
  analysis_results: AnalysisResult[];
  score_results: ScoreResult[];
  score_details: ScoreDetail[];
  issue_results: IssueResultModel[];
  improvement_guides: ImprovementGuide[];
};

export type DashboardApiResponse = {
  organizations: Organization[];
  evaluation_targets: EvaluationTarget[];
  evaluation_requests: EvaluationRequest[];
  analysis_results: AnalysisResult[];
  issue_results: IssueResult[];
  score_results: ScoreResult[];
  score_details?: ScoreDetail[];
  improvement_guides?: ImprovementGuide[];
};

export type CreateEvaluationTargetInput = {
  projectId: number;
  name: string;
  access_url: string;
};
