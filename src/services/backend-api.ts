import { buildApiUrl } from "@/config/api";
import type {
  AnalysisResult,
  DashboardViewModel,
  EvaluationTarget,
  EvaluationRequestModel,
  EvaluationTargetModel,
  ImprovementGuide,
  IssueResultModel,
  Organization,
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

type LegacyOrganizationsResponse = {
  organizations: Organization[];
};

type LegacyEvaluationTargetsResponse = {
  evaluationTargets: EvaluationTarget[];
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

async function optionalRawGet(path: string, signal?: AbortSignal): Promise<unknown | null> {
  try {
    const response = await fetch(buildApiUrl(path), {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      signal
    });

    if (!response.ok) {
      return null;
    }

    return await readJsonResponse(response);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    return null;
  }
}

function unwrapMaybeEnvelope(value: unknown): unknown {
  return isApiEnvelope<unknown>(value) ? value.data : value;
}

function isOrganization(value: unknown): value is Organization {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.homepageUrl === "string" &&
    typeof value.description === "string" &&
    typeof value.status === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isEvaluationTarget(value: unknown): value is EvaluationTarget {
  return (
    isRecord(value) &&
    typeof value.id === "number" &&
    typeof value.organizationId === "number" &&
    typeof value.name === "string" &&
    typeof value.targetType === "string" &&
    typeof value.accessUrl === "string" &&
    typeof value.status === "string" &&
    typeof value.createdAt === "string"
  );
}

function parseLegacyOrganizations(value: unknown): Organization[] | null {
  const payload = unwrapMaybeEnvelope(value);
  if (!isRecord(payload)) {
    return null;
  }

  const response = payload as Partial<LegacyOrganizationsResponse>;
  return Array.isArray(response.organizations) && response.organizations.every(isOrganization)
    ? response.organizations
    : null;
}

function parseLegacyEvaluationTargets(value: unknown): EvaluationTarget[] | null {
  const payload = unwrapMaybeEnvelope(value);
  if (!isRecord(payload)) {
    return null;
  }

  const response = payload as Partial<LegacyEvaluationTargetsResponse>;
  return Array.isArray(response.evaluationTargets) && response.evaluationTargets.every(isEvaluationTarget)
    ? response.evaluationTargets
    : null;
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

function getLatestRequest(targetRequests: EvaluationRequestModel[]): EvaluationRequestModel | null {
  const sortedRequests = [...targetRequests].sort(compareByUpdatedAt);
  return sortedRequests[sortedRequests.length - 1] ?? null;
}

function maxIsoDate(...values: string[]): string {
  const timestamps = values.map((value) => Date.parse(value)).filter((value) => !Number.isNaN(value));
  if (timestamps.length === 0) {
    return values.find((value) => value.length > 0) ?? "";
  }
  return new Date(Math.max(...timestamps)).toISOString();
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

function buildOrganizationsFromResources(
  organizations: Organization[],
  evaluationTargets: EvaluationTarget[],
  requests: EvaluationRequestModel[]
): OrganizationModel[] {
  const requestsByTargetId = new Map<number, EvaluationRequestModel[]>();
  for (const request of requests) {
    const current = requestsByTargetId.get(request.evaluationTargetId) ?? [];
    current.push(request);
    requestsByTargetId.set(request.evaluationTargetId, current);
  }

  const targetsByOrganizationId = new Map<number, EvaluationTargetModel[]>();
  for (const target of evaluationTargets) {
    const latestRequest = getLatestRequest(requestsByTargetId.get(target.id) ?? []);
    const current = targetsByOrganizationId.get(target.organizationId) ?? [];
    current.push({
      id: target.id,
      name: target.name,
      targetType: target.targetType,
      accessUrl: target.accessUrl,
      status: latestRequest?.status ?? target.status,
      createdAt: target.createdAt
    });
    targetsByOrganizationId.set(target.organizationId, current);
  }

  return organizations
    .map((organization): OrganizationModel => {
      const targets = targetsByOrganizationId.get(organization.id) ?? [];
      const latestTargetRequestDates = targets.flatMap((target) =>
        (requestsByTargetId.get(target.id) ?? []).map((request) => request.updatedAt)
      );

      return {
        id: organization.id,
        name: organization.name,
        type: organization.type,
        homepageUrl: organization.homepageUrl,
        description: organization.description,
        status: organization.status,
        createdAt: organization.createdAt,
        updatedAt: maxIsoDate(organization.updatedAt, ...latestTargetRequestDates),
        evaluationTargets: targets
      };
    })
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

async function fetchResourceOrganizations(
  requests: EvaluationRequestModel[],
  signal?: AbortSignal
): Promise<OrganizationModel[] | null> {
  const [organizationsPayload, evaluationTargetsPayload] = await Promise.all([
    optionalRawGet("/organizations", signal),
    optionalRawGet("/evaluation-targets", signal)
  ]);
  const organizations = parseLegacyOrganizations(organizationsPayload);

  if (!organizations) {
    return null;
  }

  return buildOrganizationsFromResources(
    organizations,
    parseLegacyEvaluationTargets(evaluationTargetsPayload) ?? [],
    requests
  );
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
  const [requestDetails, resourceOrganizations] = await Promise.all([
    Promise.all(requests.map((request) => fetchRequestDetails(request, signal))),
    fetchResourceOrganizations(requests, signal)
  ]);
  const scoreDetails = requestDetails.flatMap((detail) => detail.score?.details ?? []);
  const improvementGuides: ImprovementGuide[] = [];

  return {
    organizations: resourceOrganizations ?? buildOrganizationsFromRequests(requests),
    evaluationRequests: requests,
    analysisResults: requestDetails.flatMap((detail) => detail.analysisResults),
    scoreResults: requestDetails.flatMap((detail) => (detail.score ? [detail.score] : [])),
    scoreDetails,
    issueResults: requestDetails.flatMap((detail) => detail.issues),
    improvementGuides
  };
}
