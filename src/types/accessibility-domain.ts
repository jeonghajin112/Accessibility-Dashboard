export type MenuType = "dashboard" | "projects" | "reports" | "project-create";

export type RequestStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type AnalysisStatus = "SUCCESS" | "FAILED";
export type AnalyzerType = "RULE_BASED" | "AI_TEXT" | "CV_VISION";
export type SeverityLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type ScoreCategory = "rule_based" | "difficulty" | "cv";

export type Organization = {
  id: number;
  name: string;
  type: string;
  homepageUrl: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type EvaluationTarget = {
  id: number;
  organizationId: number;
  name: string;
  targetType: string;
  accessUrl: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type EvaluationRequest = {
  id: number;
  evaluationTargetId: number;
  targetName?: string;
  status: RequestStatus;
  requestNote: string;
  requestedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AnalysisResult = {
  id: number;
  evaluationRequestId: number;
  analyzerType: AnalyzerType;
  status: AnalysisStatus;
  summary: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IssueResult = {
  id: number;
  analysisResultId: number;
  issueCode: string;
  issueTitle: string;
  severity: SeverityLevel;
  locationPath: string;
  message: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ScoreResult = {
  id: number;
  evaluationRequestId: number;
  totalScore: number;
  ruleScore: number;
  aiScore: number;
  cvScore: number;
  createdAt: string;
  updatedAt: string;
};

export type ScoreDetail = {
  id: number;
  scoreResultId?: number;
  category: ScoreCategory;
  score: number;
  maxScore: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
};

export type ImprovementGuide = {
  id: number;
  issueResultId: number;
  title: string;
  guideContent: string;
  exampleCode: string;
  recommendation: string;
  createdAt: string;
  updatedAt: string;
};

export type EvaluationTargetModel = {
  id: number;
  name: string;
  targetType: string;
  accessUrl: string;
  status: RequestStatus | string;
  createdAt: string;
};

export type OrganizationModel = {
  id: number;
  name: string;
  type: string;
  homepageUrl: string;
  description: string;
  status: RequestStatus | string;
  createdAt: string;
  updatedAt: string;
  evaluationTargets: EvaluationTargetModel[];
};

export type EvaluationRequestModel = EvaluationRequest;
export type IssueResultModel = IssueResult;

export type DashboardViewModel = {
  organizations: OrganizationModel[];
  evaluationRequests: EvaluationRequestModel[];
  analysisResults: AnalysisResult[];
  scoreResults: ScoreResult[];
  scoreDetails: ScoreDetail[];
  issueResults: IssueResultModel[];
  improvementGuides: ImprovementGuide[];
};

export type DashboardApiResponse = {
  organizations: Organization[];
  evaluationTargets: EvaluationTarget[];
  evaluationRequests: EvaluationRequest[];
  analysisResults: AnalysisResult[];
  issueResults: IssueResult[];
  scoreResults: ScoreResult[];
  scoreDetails?: ScoreDetail[];
  improvementGuides?: ImprovementGuide[];
};

export type CreateEvaluationTargetInput = {
  projectId: number;
  name: string;
  accessUrl: string;
};
