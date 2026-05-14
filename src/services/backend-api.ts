import { buildApiUrl } from "@/config/api";
import type {
  AnalysisResult,
  DashboardViewModel,
  EvaluationRequestModel,
  EvaluationTargetModel,
  ImprovementGuide,
  IssueResultModel,
  OrganizationModel,
  ScoreDetail,
  ScoreResult
} from "@/types/accessibility-domain";

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message: string | null;
};

type EvaluationSummary = {
  requestId: number;
  targetName: string;
  status: EvaluationRequestModel["status"];
  totalScore: number;
  totalIssueCount: number;
  criticalIssueCount: number;
  requestedAt: string;
};

type ScoreWithDetails = ScoreResult & {
  details: ScoreDetail[];
};

type RequestDetails = {
  request: EvaluationRequestModel;
  summary: EvaluationSummary | null;
  score: ScoreWithDetails | null;
  analysisResults: AnalysisResult[];
  issues: IssueResultModel[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isApiEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  return (
    isRecord(value) &&
    typeof value.success === "boolean" &&
    "data" in value &&
    (value.message === null || typeof value.message === "string")
  );
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response. HTTP ${response.status}`);
  }
}

async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    signal
  });

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.message === "string" ? payload.message : `HTTP ${response.status}`;
    throw new Error(message);
  }

  if (!isApiEnvelope<T>(payload)) {
    throw new Error("Invalid API response envelope.");
  }

  if (!payload.success) {
    throw new Error(payload.message ?? "API request failed.");
  }

  return payload.data;
}

function toAccessUrl(targetName: string): string {
  const value = targetName.trim();
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  if (value.includes(".")) {
    return `https://${value}`;
  }
  return value;
}

function compareByUpdatedAt(left: EvaluationRequestModel, right: EvaluationRequestModel): number {
  return Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
}

function buildOrganizationsFromRequests(requests: EvaluationRequestModel[]): OrganizationModel[] {
  const requestsByTargetId = new Map<number, EvaluationRequestModel[]>();

  for (const request of requests) {
    const current = requestsByTargetId.get(request.evaluationTargetId) ?? [];
    current.push(request);
    requestsByTargetId.set(request.evaluationTargetId, current);
  }

  return [...requestsByTargetId.entries()]
    .map(([targetId, targetRequests]): OrganizationModel => {
      const sortedRequests = [...targetRequests].sort(compareByUpdatedAt);
      const firstRequest = sortedRequests[0]!;
      const latestRequest = sortedRequests[sortedRequests.length - 1]!;
      const targetName = latestRequest.targetName ?? `target#${latestRequest.evaluationTargetId}`;
      const accessUrl = toAccessUrl(targetName);
      const evaluationTarget: EvaluationTargetModel = {
        id: targetId,
        name: targetName,
        targetType: "PC Web",
        accessUrl,
        status: latestRequest.status,
        createdAt: firstRequest.createdAt
      };

      return {
        id: targetId,
        name: targetName,
        type: "PC Web",
        homepageUrl: accessUrl,
        description: `${targetName} requests: ${targetRequests.length}`,
        status: latestRequest.status,
        createdAt: firstRequest.createdAt,
        updatedAt: latestRequest.updatedAt,
        evaluationTargets: [evaluationTarget]
      };
    })
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

async function fetchRequestDetails(request: EvaluationRequestModel, signal?: AbortSignal): Promise<RequestDetails> {
  if (request.status !== "COMPLETED") {
    return {
      request,
      summary: null,
      score: null,
      analysisResults: [],
      issues: []
    };
  }

  const [summary, score, analysisResults] = await Promise.all([
    apiGet<EvaluationSummary>(`/results/requests/${request.id}/summary`, signal),
    apiGet<ScoreWithDetails>(`/scores/requests/${request.id}`, signal),
    apiGet<AnalysisResult[]>(`/analysis/requests/${request.id}/results`, signal)
  ]);

  const issuesByAnalysisResult = await Promise.all(
    analysisResults.map((analysisResult) =>
      apiGet<IssueResultModel[]>(`/analysis/results/${analysisResult.id}/issues`, signal)
    )
  );

  return {
    request,
    summary,
    score,
    analysisResults,
    issues: issuesByAnalysisResult.flat()
  };
}

export async function fetchDashboardViewModel(signal?: AbortSignal): Promise<DashboardViewModel> {
  const requests = await apiGet<EvaluationRequestModel[]>("/requests", signal);
  const requestDetails = await Promise.all(requests.map((request) => fetchRequestDetails(request, signal)));
  const scoreDetails = requestDetails.flatMap((detail) => detail.score?.details ?? []);
  const improvementGuides: ImprovementGuide[] = [];

  return {
    organizations: buildOrganizationsFromRequests(requests),
    evaluationRequests: requests,
    analysisResults: requestDetails.flatMap((detail) => detail.analysisResults),
    scoreResults: requestDetails.flatMap((detail) => (detail.score ? [detail.score] : [])),
    scoreDetails,
    issueResults: requestDetails.flatMap((detail) => detail.issues),
    improvementGuides
  };
}
