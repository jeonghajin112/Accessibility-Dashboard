import { createServer } from "node:http";

const parsedPort = Number(process.env.MOCK_SERVER_PORT ?? "8090");
const PORT = Number.isFinite(parsedPort) ? parsedPort : 8090;

const users = [
  {
    id: "1",
    email: "alex7355@naver.com",
    name: "정하진",
    role: "admin",
    created_at: "2026-02-10T09:00:00+09:00"
  }
];

const organizations = [
  {
    id: 101,
    name: "고령자 접근성 포털",
    type: "PC 웹",
    homepage_url: "https://city.example.com",
    description: "고령자와 장애인을 위한 접근성 점수 대시보드",
    status: "active",
    created_at: "2026-02-11T09:30:00+09:00",
    updated_at: "2026-02-11T09:30:00+09:00"
  },
  {
    id: 102,
    name: "의료기관 가이드 점검",
    type: "PC 웹",
    homepage_url: "https://clinic.example.com",
    description: "의료기관 페이지의 가독성과 키보드 내비게이션 점검",
    status: "active",
    created_at: "2026-02-12T11:05:00+09:00",
    updated_at: "2026-02-12T11:05:00+09:00"
  },
  {
    id: 103,
    name: "공공 서비스 감사",
    type: "모바일 웹",
    homepage_url: "https://service.example.go.kr",
    description: "공공 서비스 웹사이트 접근성 분기 점검",
    status: "active",
    created_at: "2026-02-13T13:20:00+09:00",
    updated_at: "2026-02-13T13:20:00+09:00"
  },
  {
    id: 104,
    name: "홍익대학교 홈페이지 접근성 평가",
    type: "PC 웹",
    homepage_url: "https://www.hongik.ac.kr",
    description: "홍익대학교 주요 페이지의 웹 접근성 상태를 분석하기 위한 발표용 예시 프로젝트",
    status: "active",
    created_at: "2026-03-10T10:10:00+09:00",
    updated_at: "2026-03-10T10:10:00+09:00"
  }
];

const evaluationTargets = [
  [1, 101, "시청 메인 포털", "PC 웹", "https://city.example.com"],
  [2, 101, "복지 서비스", "PC 웹", "https://welfare.example.com"],
  [3, 102, "병원 홈페이지", "PC 웹", "https://clinic.example.com"],
  [7, 102, "진료 예약 안내", "PC 웹", "https://clinic.example.com/reservation"],
  [8, 102, "응급의료센터", "PC 웹", "https://emergency.clinic.example.com"],
  [9, 102, "건강검진센터", "PC 웹", "https://checkup.clinic.example.com"],
  [12, 103, "정부24 민원 안내", "PC 웹", "https://service.example.go.kr"],
  [13, 103, "복지로 모바일 서비스", "모바일 웹", "https://m.bokjiro.example.go.kr"],
  [4, 104, "홍익대학교 메인 홈페이지", "PC 웹", "https://www.hongik.ac.kr"],
  [5, 104, "홍익대학교 입학안내", "PC 웹", "https://admission.hongik.ac.kr"],
  [6, 104, "홍익대학교 도서관", "PC 웹", "https://moonjeong.hongik.ac.kr/"],
  [10, 104, "홍익대학교 학생지원", "PC 웹", "https://support.hongik.ac.kr"],
  [11, 104, "홍익대학교 캠퍼스맵", "PC 웹", "https://map.hongik.ac.kr"]
].map(([id, organizationId, name, targetType, accessUrl]) => ({
  id,
  organization_id: organizationId,
  name,
  target_type: targetType,
  access_url: accessUrl,
  description: `${name} 평가 대상`,
  status: "active",
  created_at: "2026-03-10T10:18:00+09:00",
  updated_at: "2026-03-10T10:18:00+09:00"
}));

const evaluationRequests = [];
const analysisResults = [];
const issueResults = [];
const scoreResults = [];
const scoreDetails = [];
const improvementGuides = [];

const issueTemplates = [
  {
    issue_code: "color-contrast",
    issue_title: "Insufficient contrast",
    severity: "critical",
    location_path: ".notice",
    message: "본문 텍스트 대비가 기준보다 낮습니다.",
    title: "색상 대비 개선",
    guide_content: "텍스트와 배경색의 명도 대비를 WCAG 기준 이상으로 조정합니다.",
    example_code: ".notice { color: #111827; background: #ffffff; }",
    recommendation: "브랜드 색상을 유지하더라도 본문과 버튼 텍스트에는 충분한 대비를 적용하세요."
  },
  {
    issue_code: "img-alt",
    issue_title: "Image alternative text",
    severity: "high",
    location_path: "img.hero",
    message: "정보성 이미지에 대체 텍스트가 없습니다.",
    title: "대체 텍스트 추가",
    guide_content: "의미가 있는 이미지에는 내용을 설명하는 alt 속성을 제공합니다.",
    example_code: '<img src="hero.png" alt="주요 서비스 안내 배너" />',
    recommendation: "장식 이미지는 빈 alt를, 정보 이미지는 구체적인 설명을 사용하세요."
  },
  {
    issue_code: "label-missing",
    issue_title: "Form label missing",
    severity: "medium",
    location_path: "input[type='text']",
    message: "입력 필드와 연결된 레이블이 없습니다.",
    title: "폼 레이블 연결",
    guide_content: "모든 입력 필드는 label 또는 aria-label로 목적을 전달해야 합니다.",
    example_code: '<label for="keyword">검색어</label><input id="keyword" />',
    recommendation: "placeholder만으로 입력 목적을 안내하지 마세요."
  },
  {
    issue_code: "heading-order",
    issue_title: "Heading order skipped",
    severity: "low",
    location_path: "h4.section-title",
    message: "제목 레벨이 순차적이지 않습니다.",
    title: "제목 계층 정리",
    guide_content: "페이지 제목 구조가 h1부터 논리적으로 이어지도록 수정합니다.",
    example_code: "<h2>섹션 제목</h2><h3>하위 제목</h3>",
    recommendation: "시각적 크기 조절은 CSS로 처리하고 제목 태그는 문서 구조 기준으로 사용하세요."
  }
];

const monthWindows = [
  "2025-12-20T10:43:00+09:00",
  "2026-01-17T13:27:00+09:00",
  "2026-02-15T09:29:00+09:00",
  "2026-03-16T10:24:00+09:00",
  "2026-04-18T11:31:00+09:00",
  "2026-05-12T12:42:00+09:00"
];

let nextOrganizationId = 200;
let nextEvaluationTargetId = 300;
let nextEvaluationRequestId = 5000;
let nextAnalysisResultId = 7000;
let nextIssueResultId = 9000;
let nextScoreResultId = 11000;
let nextImprovementGuideId = 15000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createEvaluationRequestSnapshot(evaluationTarget, windowIndex) {
  const timestamp = monthWindows[windowIndex % monthWindows.length];
  const baseScore = 82 - ((evaluationTarget.id + windowIndex) % 8) + windowIndex * 2;
  const totalScore = clamp(baseScore, 58, 96);

  const evaluationRequest = {
    id: nextEvaluationRequestId++,
    evaluation_target_id: evaluationTarget.id,
    status: "finished",
    request_note: "",
    requested_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp
  };
  evaluationRequests.push(evaluationRequest);

  const analysisResult = {
    id: nextAnalysisResultId++,
    evaluation_request_id: evaluationRequest.id,
    analyzer_type: "integrated",
    status: "finished",
    summary: "통합 접근성 분석 결과",
    started_at: timestamp,
    completed_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp
  };
  analysisResults.push(analysisResult);

  const scoreResult = {
    id: nextScoreResultId++,
    evaluation_request_id: evaluationRequest.id,
    total_score: totalScore,
    rule_score: clamp(totalScore - 2, 0, 100),
    ai_score: clamp(totalScore + 1, 0, 100),
    cv_score: clamp(totalScore - 1, 0, 100),
    created_at: timestamp,
    updated_at: timestamp
  };
  scoreResults.push(scoreResult);

  if (windowIndex < monthWindows.length - 1) {
    return;
  }

  const issueCount = Math.max(2, Math.min(issueTemplates.length, Math.round((100 - totalScore) / 8)));
  for (let index = 0; index < issueCount; index += 1) {
    const template = issueTemplates[(evaluationTarget.id + index) % issueTemplates.length];
    const issueResult = {
      id: nextIssueResultId++,
      analysis_result_id: analysisResult.id,
      issue_code: template.issue_code,
      issue_title: template.issue_title,
      severity: template.severity,
      location_path: template.location_path,
      message: template.message,
      resolved: false,
      created_at: timestamp,
      updated_at: timestamp
    };
    issueResults.push(issueResult);

    improvementGuides.push({
      id: nextImprovementGuideId++,
      issue_result_id: issueResult.id,
      title: template.title,
      guide_content: template.guide_content,
      example_code: template.example_code,
      recommendation: template.recommendation,
      created_at: timestamp,
      updated_at: timestamp
    });
  }
}

for (const evaluationTarget of evaluationTargets) {
  for (let index = 0; index < monthWindows.length; index += 1) {
    createEvaluationRequestSnapshot(evaluationTarget, index);
  }
}

function buildDashboardPayload() {
  return {
    organizations,
    evaluation_targets: evaluationTargets,
    evaluation_requests: evaluationRequests,
    analysis_results: analysisResults,
    issue_results: issueResults,
    score_results: scoreResults,
    score_details: scoreDetails,
    improvement_guides: improvementGuides
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS"
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
      }
    });

    request.on("end", () => {
      if (body.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    request.on("error", reject);
  });
}

function findOrganization(organizationId) {
  return organizations.find((organization) => organization.id === organizationId);
}

function findEvaluationTarget(evaluationTargetId) {
  return evaluationTargets.find((evaluationTarget) => evaluationTarget.id === evaluationTargetId);
}

function removeEvaluationTargetData(evaluationTargetId) {
  const requestIds = new Set(
    evaluationRequests
      .filter((evaluationRequest) => evaluationRequest.evaluation_target_id === evaluationTargetId)
      .map((evaluationRequest) => evaluationRequest.id)
  );
  const analysisIds = new Set(
    analysisResults
      .filter((analysisResult) => requestIds.has(analysisResult.evaluation_request_id))
      .map((analysisResult) => analysisResult.id)
  );
  const scoreIds = new Set(
    scoreResults
      .filter((scoreResult) => requestIds.has(scoreResult.evaluation_request_id))
      .map((scoreResult) => scoreResult.id)
  );
  const issueIds = new Set(
    issueResults
      .filter((issueResult) => analysisIds.has(issueResult.analysis_result_id))
      .map((issueResult) => issueResult.id)
  );

  removeWhere(improvementGuides, (guide) => issueIds.has(guide.issue_result_id));
  removeWhere(issueResults, (issueResult) => issueIds.has(issueResult.id));
  removeWhere(scoreDetails, (scoreDetail) => scoreIds.has(scoreDetail.score_result_id));
  removeWhere(scoreResults, (scoreResult) => scoreIds.has(scoreResult.id));
  removeWhere(analysisResults, (analysisResult) => analysisIds.has(analysisResult.id));
  removeWhere(evaluationRequests, (evaluationRequest) => requestIds.has(evaluationRequest.id));
}

function removeWhere(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      items.splice(index, 1);
    }
  }
}

const server = createServer(async (request, response) => {
  if (!request.url || !request.method) {
    sendJson(response, 400, { error: "Bad request" });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS"
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (request.method === "GET" && path === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && path === "/auth/login") {
    try {
      const body = await readJsonBody(request);
      const payload = body && typeof body === "object" ? body : {};
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
      const user = users.find((item) => item.email.toLowerCase() === email);

      if (!user) {
        sendJson(response, 401, { success: false, error: "Invalid email" });
        return;
      }

      sendJson(response, 200, { success: true, user });
    } catch (error) {
      sendJson(response, 400, {
        success: false,
        error: error instanceof Error ? error.message : "Invalid request"
      });
    }
    return;
  }

  if (request.method === "GET" && path === "/dashboard") {
    sendJson(response, 200, buildDashboardPayload());
    return;
  }

  if (request.method === "GET" && path === "/organizations") {
    sendJson(response, 200, { organizations });
    return;
  }

  if (request.method === "GET" && path === "/evaluation-targets") {
    sendJson(response, 200, { evaluation_targets: evaluationTargets });
    return;
  }

  if (request.method === "GET" && path === "/evaluation-requests") {
    sendJson(response, 200, { evaluation_requests: evaluationRequests });
    return;
  }

  if (request.method === "GET" && path === "/analysis-results") {
    sendJson(response, 200, { analysis_results: analysisResults });
    return;
  }

  if (request.method === "GET" && path === "/issue-results") {
    sendJson(response, 200, { issue_results: issueResults });
    return;
  }

  if (request.method === "GET" && path === "/score-results") {
    sendJson(response, 200, { score_results: scoreResults });
    return;
  }

  if (request.method === "GET" && path === "/score-details") {
    sendJson(response, 200, { score_details: scoreDetails });
    return;
  }

  if (request.method === "GET" && path === "/improvement-guides") {
    sendJson(response, 200, { improvement_guides: improvementGuides });
    return;
  }

  if (request.method === "POST" && path === "/organizations") {
    try {
      const body = await readJsonBody(request);
      const payload = body && typeof body === "object" ? body : {};
      const name = typeof payload.name === "string" ? payload.name.trim() : "";
      const description = typeof payload.description === "string" ? payload.description.trim() : "";

      if (name.length === 0) {
        sendJson(response, 400, { error: "name is required" });
        return;
      }

      const now = new Date().toISOString();
      const organization = {
        id: nextOrganizationId++,
        name,
        type: "PC 웹",
        homepage_url: "",
        description,
        status: "active",
        created_at: now,
        updated_at: now
      };

      organizations.push(organization);
      sendJson(response, 201, { organization });
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : "Invalid request"
      });
    }
    return;
  }

  const organizationRouteMatch = path.match(/^\/organizations\/(\d+)$/);
  if ((request.method === "PATCH" || request.method === "DELETE") && organizationRouteMatch) {
    const organizationId = Number(organizationRouteMatch[1]);
    const organization = findOrganization(organizationId);

    if (!organization) {
      sendJson(response, 404, { error: "Organization not found" });
      return;
    }

    if (request.method === "PATCH") {
      try {
        const body = await readJsonBody(request);
        const payload = body && typeof body === "object" ? body : {};
        const name = typeof payload.name === "string" ? payload.name.trim() : "";
        const description = typeof payload.description === "string" ? payload.description.trim() : "";

        if (name.length === 0) {
          sendJson(response, 400, { error: "name is required" });
          return;
        }

        organization.name = name;
        organization.description = description;
        organization.updated_at = new Date().toISOString();
        sendJson(response, 200, { organization });
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : "Invalid request"
        });
      }
      return;
    }

    for (const evaluationTarget of evaluationTargets.filter((target) => target.organization_id === organizationId)) {
      removeEvaluationTargetData(evaluationTarget.id);
    }
    removeWhere(evaluationTargets, (evaluationTarget) => evaluationTarget.organization_id === organizationId);
    removeWhere(organizations, (item) => item.id === organizationId);
    sendJson(response, 200, { organization });
    return;
  }

  const createEvaluationTargetMatch = path.match(/^\/organizations\/(\d+)\/evaluation-targets$/);
  if (request.method === "POST" && createEvaluationTargetMatch) {
    const organizationId = Number(createEvaluationTargetMatch[1]);
    const organization = findOrganization(organizationId);

    if (!organization) {
      sendJson(response, 404, { error: "Organization not found" });
      return;
    }

    try {
      const body = await readJsonBody(request);
      const payload = body && typeof body === "object" ? body : {};
      const name = typeof payload.name === "string" ? payload.name.trim() : "";
      const accessUrl = typeof payload.access_url === "string" ? payload.access_url.trim() : "";

      if (name.length === 0 || accessUrl.length === 0) {
        sendJson(response, 400, { error: "name and access_url are required" });
        return;
      }

      const now = new Date().toISOString();
      const evaluationTarget = {
        id: nextEvaluationTargetId++,
        organization_id: organization.id,
        name,
        target_type: organization.type,
        access_url: accessUrl,
        description: `${name} 평가 대상`,
        status: "active",
        created_at: now,
        updated_at: now
      };

      evaluationTargets.push(evaluationTarget);
      createEvaluationRequestSnapshot(evaluationTarget, monthWindows.length - 1);
      organization.updated_at = now;
      sendJson(response, 201, { evaluation_target: evaluationTarget });
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : "Invalid request"
      });
    }
    return;
  }

  const evaluationTargetRouteMatch = path.match(/^\/organizations\/(\d+)\/evaluation-targets\/(\d+)$/);
  if ((request.method === "PATCH" || request.method === "DELETE") && evaluationTargetRouteMatch) {
    const organizationId = Number(evaluationTargetRouteMatch[1]);
    const evaluationTargetId = Number(evaluationTargetRouteMatch[2]);
    const organization = findOrganization(organizationId);
    const evaluationTarget = findEvaluationTarget(evaluationTargetId);

    if (!organization || !evaluationTarget || evaluationTarget.organization_id !== organizationId) {
      sendJson(response, 404, { error: "Evaluation target not found" });
      return;
    }

    if (request.method === "PATCH") {
      try {
        const body = await readJsonBody(request);
        const payload = body && typeof body === "object" ? body : {};
        const name = typeof payload.name === "string" ? payload.name.trim() : "";
        const accessUrl = typeof payload.access_url === "string" ? payload.access_url.trim() : "";

        if (name.length === 0 || accessUrl.length === 0) {
          sendJson(response, 400, { error: "name and access_url are required" });
          return;
        }

        evaluationTarget.name = name;
        evaluationTarget.access_url = accessUrl;
        evaluationTarget.updated_at = new Date().toISOString();
        organization.updated_at = evaluationTarget.updated_at;
        sendJson(response, 200, { evaluation_target: evaluationTarget });
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : "Invalid request"
        });
      }
      return;
    }

    removeEvaluationTargetData(evaluationTarget.id);
    removeWhere(evaluationTargets, (item) => item.id === evaluationTarget.id);
    organization.updated_at = new Date().toISOString();
    sendJson(response, 200, { evaluation_target: evaluationTarget });
    return;
  }

  const evaluationTargetRequestRouteMatch = path.match(/^\/evaluation-targets\/(\d+)\/evaluation-requests$/);
  if (request.method === "POST" && evaluationTargetRequestRouteMatch) {
    const evaluationTargetId = Number(evaluationTargetRequestRouteMatch[1]);
    const evaluationTarget = findEvaluationTarget(evaluationTargetId);
    const organization = evaluationTarget ? findOrganization(evaluationTarget.organization_id) : null;

    if (!organization || !evaluationTarget) {
      sendJson(response, 404, { error: "Evaluation target not found" });
      return;
    }

    createEvaluationRequestSnapshot(evaluationTarget, monthWindows.length - 1);
    organization.updated_at = new Date().toISOString();
    sendJson(response, 201, {
      evaluation_request: evaluationRequests[evaluationRequests.length - 1]
    });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Mock server listening on http://localhost:${PORT}`);
});
