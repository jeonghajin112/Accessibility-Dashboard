import type {
  DashboardApiResponse,
  DashboardViewModel,
  EvaluationRequestModel,
  EvaluationTargetModel,
  IssueResultModel,
  Organization,
  OrganizationModel
} from "@/types/accessibility-domain";

export function mapDashboardResponseToViewModel(response: DashboardApiResponse): DashboardViewModel {
  const targetsByOrganizationId = new Map<number, EvaluationTargetModel[]>();

  for (const evaluationTarget of response.evaluation_targets) {
    const currentTargets = targetsByOrganizationId.get(evaluationTarget.organization_id) ?? [];
    currentTargets.push({
      id: evaluationTarget.id,
      name: evaluationTarget.name,
      target_type: evaluationTarget.target_type,
      access_url: evaluationTarget.access_url,
      status: evaluationTarget.status,
      created_at: evaluationTarget.created_at
    });
    targetsByOrganizationId.set(evaluationTarget.organization_id, currentTargets);
  }

  const organizations: OrganizationModel[] = response.organizations.map((organization: Organization) => {
    const evaluationTargets = targetsByOrganizationId.get(organization.id) ?? [];

    return {
      id: organization.id,
      name: organization.name,
      type: organization.type,
      homepage_url: organization.homepage_url,
      description: organization.description,
      status: organization.status,
      created_at: organization.created_at,
      updated_at: organization.updated_at,
      evaluation_targets: evaluationTargets
    };
  });

  const evaluationRequests: EvaluationRequestModel[] = response.evaluation_requests.map((evaluationRequest) => ({
    id: evaluationRequest.id,
    evaluation_target_id: evaluationRequest.evaluation_target_id,
    status: evaluationRequest.status,
    request_note: evaluationRequest.request_note,
    requested_at: evaluationRequest.requested_at,
    created_at: evaluationRequest.created_at,
    updated_at: evaluationRequest.updated_at
  }));

  const issueResults: IssueResultModel[] = response.issue_results.map((issueResult) => ({
    id: issueResult.id,
    analysis_result_id: issueResult.analysis_result_id,
    issue_code: issueResult.issue_code,
    issue_title: issueResult.issue_title,
    severity: issueResult.severity,
    location_path: issueResult.location_path,
    message: issueResult.message,
    resolved: issueResult.resolved,
    created_at: issueResult.created_at,
    updated_at: issueResult.updated_at
  }));

  return {
    organizations,
    evaluation_requests: evaluationRequests,
    analysis_results: response.analysis_results,
    score_results: response.score_results,
    score_details: response.score_details ?? [],
    issue_results: issueResults,
    improvement_guides: response.improvement_guides ?? []
  };
}
