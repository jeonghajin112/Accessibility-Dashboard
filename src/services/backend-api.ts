import { buildApiUrl } from "@/config/api";
import type {
  AnalysisResult,
  DashboardViewModel,
  EvaluationTarget,
  CreateEvaluationTargetInput,
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
  data?: T;
  message?: string | null;
  error?: string | null;
};

type ApiRequestMethod = "GET" | "POST" | "PATCH" | "DELETE";

type ScoreWithDetails = ScoreResult & {
  details: ScoreDetail[];
};

type RequestDetails = {
  request: EvaluationRequestModel;
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

type ApiRequestOptions = {
  method?: ApiRequestMethod;
  body?: unknown;
  signal?: AbortSignal;
  optionalStatuses?: number[];
};

type ApiRequestErrorInput = {
  method: ApiRequestMethod;
  path: string;
  payload: unknown;
  status: number | null;
  url: string;
  message: string;
};

export class ApiRequestError extends Error {
  readonly method: ApiRequestMethod;
  readonly path: string;
  readonly payload: unknown;
  readonly status: number | null;
  readonly url: string;

  constructor({ method, path, payload, status, url, message }: ApiRequestErrorInput) {
    const statusLabel = status === null ? "" : `, HTTP ${status}`;
    super(`${message} [${method} ${path}${statusLabel}]`);
    this.name = "ApiRequestError";
    this.method = method;
    this.path = path;
    this.payload = payload;
    this.status = status;
    this.url = url;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isApiEnvelope<T = unknown>(value: unknown): value is ApiEnvelope<T> {
  return (
    isRecord(value) &&
    typeof value.success === "boolean" &&
    (!("message" in value) || value.message === null || typeof value.message === "string") &&
    (!("error" in value) || value.error === null || typeof value.error === "string")
  );
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) {
    return fallback;
  }

  if (typeof payload.message === "string" && payload.message.trim().length > 0) {
    return payload.message;
  }

  if (typeof payload.error === "string" && payload.error.trim().length > 0) {
    return payload.error;
  }

  return fallback;
}

async function readJsonResponse(
  response: Response,
  context: { method: ApiRequestMethod; path: string; url: string }
): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiRequestError({
      method: context.method,
      path: context.path,
      payload: text.slice(0, 500),
      status: response.status,
      url: context.url,
      message: "Invalid JSON response."
    });
  }
}

async function apiRequest<T = unknown>(
  path: string,
  { method = "GET", body, signal, optionalStatuses = [] }: ApiRequestOptions = {}
): Promise<T> {
  const headers: HeadersInit = {
    Accept: "application/json"
  };
  const requestInit: RequestInit = {
    method,
    headers,
    signal
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestInit.body = JSON.stringify(body);
  }

  const url = buildApiUrl(path);
  let response: Response;

  try {
    response = await fetch(url, {
      ...requestInit
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new ApiRequestError({
      method,
      path,
      payload: error,
      status: null,
      url,
      message: "Network request failed."
    });
  }

  const payload = await readJsonResponse(response, { method, path, url });

  if (!response.ok) {
    if (optionalStatuses.includes(response.status)) {
      return null as T;
    }

    throw new ApiRequestError({
      method,
      path,
      payload,
      status: response.status,
      url,
      message: getErrorMessage(payload, response.statusText || "API request failed.")
    });
  }

  if (isApiEnvelope<T>(payload)) {
    if (!payload.success) {
      throw new ApiRequestError({
        method,
        path,
        payload,
        status: response.status,
        url,
        message: getErrorMessage(payload, "API request failed.")
      });
    }

    return ("data" in payload ? payload.data : null) as T;
  }

  return payload as T;
}

async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(path, { signal });
}

async function optionalRawGet(path: string, signal?: AbortSignal): Promise<unknown | null> {
  return apiRequest<unknown | null>(path, {
    signal,
    optionalStatuses: [404, 405]
  });
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
      score: null,
      analysisResults: [],
      issues: []
    };
  }

  const [score, analysisResults] = await Promise.all([
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
    score,
    analysisResults,
    issues: issuesByAnalysisResult.flat()
  };
}

function getPayloadRequestId(payload: unknown): number | null {
  const requestPayload = isRecord(payload) && isRecord(payload.evaluation_request)
    ? payload.evaluation_request
    : isRecord(payload) && isRecord(payload.data)
      ? payload.data
      : payload;

  return isRecord(requestPayload) && typeof requestPayload.id === "number" ? requestPayload.id : null;
}

export async function createOrganizationModel(input: { name: string; description: string }): Promise<void> {
  await apiRequest("/organizations", {
    method: "POST",
    body: input
  });
}

export async function updateOrganizationModel({
  projectId,
  name,
  description
}: {
  projectId: number;
  name: string;
  description: string;
}): Promise<void> {
  await apiRequest(`/organizations/${projectId}`, {
    method: "PATCH",
    body: {
      name,
      description
    }
  });
}

export async function deleteOrganizationModel(projectId: number): Promise<void> {
  await apiRequest(`/organizations/${projectId}`, {
    method: "DELETE"
  });
}

export async function createEvaluationTargetModel({
  projectId,
  name,
  accessUrl
}: CreateEvaluationTargetInput): Promise<void> {
  await apiRequest(`/organizations/${projectId}/evaluation-targets`, {
    method: "POST",
    body: {
      name,
      accessUrl
    }
  });
}

export async function updateEvaluationTargetModel({
  projectId,
  siteId,
  name,
  accessUrl
}: {
  projectId: number;
  siteId: number;
  name: string;
  accessUrl: string;
}): Promise<void> {
  await apiRequest(`/organizations/${projectId}/evaluation-targets/${siteId}`, {
    method: "PATCH",
    body: {
      name,
      accessUrl
    }
  });
}

export async function deleteEvaluationTargetModel({
  projectId,
  siteId
}: {
  projectId: number;
  siteId: number;
}): Promise<void> {
  await apiRequest(`/organizations/${projectId}/evaluation-targets/${siteId}`, {
    method: "DELETE"
  });
}

export async function requestEvaluationTargetRescan(targetId: number): Promise<number | null> {
  const payload = await apiRequest<unknown>(`/evaluation-targets/${targetId}/evaluation-requests`, {
    method: "POST",
    body: {}
  });

  return getPayloadRequestId(payload);
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
