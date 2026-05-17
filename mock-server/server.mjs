import { createServer } from "node:http";

const parsedPort = Number(process.env.MOCK_SERVER_PORT ?? "8080");
const PORT = Number.isFinite(parsedPort) ? parsedPort : 8080;

const users = [
  {
    id: "1",
    email: "alex7355@naver.com",
    name: "정하진",
    role: "admin",
    createdAt: "2026-02-10T09:00:00+09:00"
  }
];

const organizations = [
  {
    id: 101,
    name: "고령자 접근성 포털",
    type: "PC 웹",
    homepageUrl: "https://city.example.com",
    description: "고령자와 장애인을 위한 접근성 점수 대시보드",
    status: "active",
    createdAt: "2026-02-11T09:30:00+09:00",
    updatedAt: "2026-02-11T09:30:00+09:00"
  },
  {
    id: 102,
    name: "의료기관 가이드 점검",
    type: "PC 웹",
    homepageUrl: "https://clinic.example.com",
    description: "의료기관 페이지의 가독성과 키보드 내비게이션 점검",
    status: "active",
    createdAt: "2026-02-12T11:05:00+09:00",
    updatedAt: "2026-02-12T11:05:00+09:00"
  },
  {
    id: 103,
    name: "공공 서비스 감사",
    type: "모바일 웹",
    homepageUrl: "https://service.example.go.kr",
    description: "공공 서비스 웹사이트 접근성 분기 점검",
    status: "active",
    createdAt: "2026-02-13T13:20:00+09:00",
    updatedAt: "2026-02-13T13:20:00+09:00"
  },
  {
    id: 104,
    name: "홍익대학교 홈페이지 접근성 평가",
    type: "PC 웹",
    homepageUrl: "https://www.hongik.ac.kr",
    description: "홍익대학교 주요 페이지의 웹 접근성 상태를 분석하기 위한 발표용 예시 프로젝트",
    status: "active",
    createdAt: "2026-03-10T10:10:00+09:00",
    updatedAt: "2026-03-10T10:10:00+09:00"
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
  organizationId: organizationId,
  name,
  targetType: targetType,
  accessUrl: accessUrl,
  description: `${name} 평가 대상`,
  status: "active",
  createdAt: "2026-03-10T10:18:00+09:00",
  updatedAt: "2026-03-10T10:18:00+09:00"
}));

const evaluationRequests = [];
const analysisResults = [];
const issueResults = [];
const scoreResults = [];
const scoreDetails = [];
const improvementGuides = [];

const issueTemplates = [
  {
    issueCode: "5.3.3",
    issueTitle: "콘텐츠의 명도 대비",
    severity: "CRITICAL",
    locationPath: ".notice",
    message: "본문 텍스트 대비가 기준보다 낮습니다.",
    title: "색상 대비 개선",
    guideContent: "텍스트와 배경색의 명도 대비를 WCAG 기준 이상으로 조정합니다.",
    exampleCode: ".notice { color: #111827; background: #ffffff; }",
    recommendation: "브랜드 색상을 유지하더라도 본문과 버튼 텍스트에는 충분한 대비를 적용하세요."
  },
  {
    issueCode: "5.1.1",
    issueTitle: "적절한 대체 텍스트 제공",
    severity: "HIGH",
    locationPath: "img.hero",
    message: "정보성 이미지에 대체 텍스트가 없습니다.",
    title: "대체 텍스트 추가",
    guideContent: "의미가 있는 이미지에는 내용을 설명하는 alt 속성을 제공합니다.",
    exampleCode: '<img src="hero.png" alt="주요 서비스 안내 배너" />',
    recommendation: "장식 이미지는 빈 alt를, 정보 이미지는 구체적인 설명을 사용하세요."
  },
  {
    issueCode: "7.1.1",
    issueTitle: "입력 도움",
    severity: "MEDIUM",
    locationPath: "input[type='text']",
    message: "입력 필드와 연결된 레이블이 없습니다.",
    title: "폼 레이블 연결",
    guideContent: "모든 입력 필드는 label 또는 aria-label로 목적을 전달해야 합니다.",
    exampleCode: '<label for="keyword">검색어</label><input id="keyword" />',
    recommendation: "placeholder만으로 입력 목적을 안내하지 마세요."
  },
  {
    issueCode: "6.1.2",
    issueTitle: "제목 제공",
    severity: "LOW",
    locationPath: "h4.section-title",
    message: "제목 레벨이 순차적이지 않습니다.",
    title: "제목 계층 정리",
    guideContent: "페이지 제목 구조가 h1부터 논리적으로 이어지도록 수정합니다.",
    exampleCode: "<h2>섹션 제목</h2><h3>하위 제목</h3>",
    recommendation: "시각적 크기 조절은 CSS로 처리하고 제목 태그는 문서 구조 기준으로 사용하세요."
  }
];

const monthWindows = [
  { timestamp: "2025-06-18T10:20:00+09:00", scoreIndex: -6 },
  { timestamp: "2025-07-16T10:35:00+09:00", scoreIndex: -5 },
  { timestamp: "2025-08-19T11:05:00+09:00", scoreIndex: -4 },
  { timestamp: "2025-09-17T09:55:00+09:00", scoreIndex: -3 },
  { timestamp: "2025-10-15T14:10:00+09:00", scoreIndex: -2 },
  { timestamp: "2025-11-19T13:40:00+09:00", scoreIndex: -1 },
  { timestamp: "2025-12-20T10:43:00+09:00", scoreIndex: 0 },
  { timestamp: "2026-01-17T13:27:00+09:00", scoreIndex: 1 },
  { timestamp: "2026-02-15T09:29:00+09:00", scoreIndex: 2 },
  { timestamp: "2026-03-16T10:24:00+09:00", scoreIndex: 3 },
  { timestamp: "2026-04-18T11:31:00+09:00", scoreIndex: 4 },
  { timestamp: "2026-05-12T12:42:00+09:00", scoreIndex: 5 }
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
  const monthWindow = monthWindows[windowIndex % monthWindows.length];
  const timestamp = monthWindow.timestamp;
  const scoreIndex = monthWindow.scoreIndex;
  const baseScore = 82 - ((evaluationTarget.id + scoreIndex) % 8) + scoreIndex * 2;
  const totalScore = clamp(baseScore, 58, 96);

  const evaluationRequest = {
    id: nextEvaluationRequestId++,
    evaluationTargetId: evaluationTarget.id,
    status: "COMPLETED",
    requestNote: "",
    requestedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  evaluationRequests.push(evaluationRequest);

  const analysisResult = {
    id: nextAnalysisResultId++,
    evaluationRequestId: evaluationRequest.id,
    analyzerType: "RULE_BASED",
    status: "SUCCESS",
    summary: "통합 접근성 분석 결과",
    startedAt: timestamp,
    completedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  analysisResults.push(analysisResult);

  const scoreResult = {
    id: nextScoreResultId++,
    evaluationRequestId: evaluationRequest.id,
    totalScore: totalScore,
    ruleScore: clamp(totalScore - 2, 0, 100),
    aiScore: clamp(totalScore + 1, 0, 100),
    cvScore: clamp(totalScore - 1, 0, 100),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  scoreResults.push(scoreResult);

  if (windowIndex < monthWindows.length - 1) {
    return;
  }

  const issueCount = Math.max(8, Math.min(issueTemplates.length * 2, Math.round((100 - totalScore) / 4)));
  for (let index = 0; index < issueCount; index += 1) {
    const template = issueTemplates[(evaluationTarget.id + index) % issueTemplates.length];
    const issueResult = {
      id: nextIssueResultId++,
      analysisResultId: analysisResult.id,
      issueCode: template.issueCode,
      issueTitle: template.issueTitle,
      severity: template.severity,
      locationPath: template.locationPath,
      message: template.message,
      resolved: false,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    issueResults.push(issueResult);

    improvementGuides.push({
      id: nextImprovementGuideId++,
      issueResultId: issueResult.id,
      title: template.title,
      guideContent: template.guideContent,
      exampleCode: template.exampleCode,
      recommendation: template.recommendation,
      createdAt: timestamp,
      updatedAt: timestamp
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
    evaluationTargets: evaluationTargets,
    evaluationRequests: evaluationRequests,
    analysisResults: analysisResults,
    issueResults: issueResults,
    scoreResults: scoreResults,
    scoreDetails: scoreDetails,
    improvementGuides: improvementGuides
  };
}

function sendApiSuccess(response, data, statusCode = 200, message = null) {
  sendJson(response, statusCode, {
    success: true,
    data,
    message
  });
}

function sendApiError(response, statusCode, message) {
  sendJson(response, statusCode, {
    success: false,
    data: null,
    message
  });
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

function toBackendRequestStatus(status) {
  const normalizedStatus = String(status).trim().toUpperCase();
  if (normalizedStatus === "FINISHED" || normalizedStatus === "COMPLETED" || normalizedStatus === "SUCCESS") {
    return "COMPLETED";
  }
  if (normalizedStatus === "FAILED" || normalizedStatus === "ERROR" || normalizedStatus === "CANCELLED") {
    return "FAILED";
  }
  if (normalizedStatus === "RUNNING" || normalizedStatus === "PROCESSING") {
    return "RUNNING";
  }
  return "PENDING";
}

function toBackendAnalysisStatus(status) {
  const normalizedStatus = String(status).trim().toUpperCase();
  return normalizedStatus === "FAILED" || normalizedStatus === "ERROR" ? "FAILED" : "SUCCESS";
}

function toBackendAnalyzerType(analysisResult) {
  const normalizedType = String(analysisResult.analyzerType).trim().toUpperCase();
  if (normalizedType === "AI_TEXT") {
    return "AI_TEXT";
  }
  if (normalizedType === "CV_VISION") {
    return "CV_VISION";
  }
  return "RULE_BASED";
}

function toBackendSeverity(severity) {
  return String(severity).toUpperCase();
}

function toBackendEvaluationRequest(evaluationRequest) {
  const evaluationTarget = findEvaluationTarget(evaluationRequest.evaluationTargetId);

  return {
    id: evaluationRequest.id,
    evaluationTargetId: evaluationRequest.evaluationTargetId,
    targetName: evaluationTarget?.name ?? `target#${evaluationRequest.evaluationTargetId}`,
    status: toBackendRequestStatus(evaluationRequest.status),
    requestNote: evaluationRequest.requestNote,
    requestedAt: evaluationRequest.requestedAt,
    createdAt: evaluationRequest.createdAt,
    updatedAt: evaluationRequest.updatedAt
  };
}

function findEvaluationRequest(evaluationRequestId) {
  return evaluationRequests.find((evaluationRequest) => evaluationRequest.id === evaluationRequestId);
}

function findScoreResultByRequestId(evaluationRequestId) {
  return scoreResults.find((scoreResult) => scoreResult.evaluationRequestId === evaluationRequestId);
}

function findAnalysisResultsByRequestId(evaluationRequestId) {
  return analysisResults.filter((analysisResult) => analysisResult.evaluationRequestId === evaluationRequestId);
}

function findIssuesByRequestId(evaluationRequestId) {
  const analysisIds = new Set(
    findAnalysisResultsByRequestId(evaluationRequestId).map((analysisResult) => analysisResult.id)
  );

  return issueResults.filter((issueResult) => analysisIds.has(issueResult.analysisResultId));
}

function findIssuesByAnalysisResultId(analysisResultId) {
  return issueResults.filter((issueResult) => issueResult.analysisResultId === analysisResultId);
}

function buildBackendScoreDetails(scoreResult) {
  const categories = [
    {
      category: "rule_based",
      score: scoreResult.ruleScore,
      comment: "KWCAG rule-based analyzer score"
    },
    {
      category: "difficulty",
      score: scoreResult.aiScore,
      comment: "AI text difficulty analyzer score"
    },
    {
      category: "cv",
      score: scoreResult.cvScore,
      comment: "Computer vision analyzer score"
    }
  ];

  return categories.map((item, index) => ({
    id: scoreResult.id * 10 + index + 1,
    scoreResultId: scoreResult.id,
    category: item.category,
    score: item.score,
    maxScore: 100,
    comment: item.comment,
    createdAt: scoreResult.createdAt,
    updatedAt: scoreResult.updatedAt
  }));
}

function toBackendScore(scoreResult) {
  return {
    id: scoreResult.id,
    evaluationRequestId: scoreResult.evaluationRequestId,
    totalScore: scoreResult.totalScore,
    ruleScore: scoreResult.ruleScore,
    aiScore: scoreResult.aiScore,
    cvScore: scoreResult.cvScore,
    details: buildBackendScoreDetails(scoreResult),
    createdAt: scoreResult.createdAt,
    updatedAt: scoreResult.updatedAt
  };
}

function toBackendAnalysisResult(analysisResult) {
  return {
    id: analysisResult.id,
    evaluationRequestId: analysisResult.evaluationRequestId,
    analyzerType: toBackendAnalyzerType(analysisResult),
    status: toBackendAnalysisStatus(analysisResult.status),
    summary: analysisResult.summary,
    startedAt: analysisResult.startedAt,
    completedAt: analysisResult.completedAt,
    createdAt: analysisResult.createdAt,
    updatedAt: analysisResult.updatedAt
  };
}

function toBackendIssue(issueResult) {
  return {
    id: issueResult.id,
    analysisResultId: issueResult.analysisResultId,
    issueCode: issueResult.issueCode,
    issueTitle: issueResult.issueTitle,
    severity: toBackendSeverity(issueResult.severity),
    locationPath: issueResult.locationPath,
    message: issueResult.message,
    resolved: issueResult.resolved,
    createdAt: issueResult.createdAt,
    updatedAt: issueResult.updatedAt
  };
}

function buildBackendRequestSummary(evaluationRequest) {
  const evaluationTarget = findEvaluationTarget(evaluationRequest.evaluationTargetId);
  const scoreResult = findScoreResultByRequestId(evaluationRequest.id);
  const requestIssues = findIssuesByRequestId(evaluationRequest.id);

  return {
    requestId: evaluationRequest.id,
    targetName: evaluationTarget?.name ?? `target#${evaluationRequest.evaluationTargetId}`,
    status: toBackendRequestStatus(evaluationRequest.status),
    totalScore: scoreResult?.totalScore ?? 0,
    totalIssueCount: requestIssues.length,
    criticalIssueCount: requestIssues.filter((issueResult) => toBackendSeverity(issueResult.severity) === "CRITICAL").length,
    requestedAt: evaluationRequest.requestedAt
  };
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
      .filter((evaluationRequest) => evaluationRequest.evaluationTargetId === evaluationTargetId)
      .map((evaluationRequest) => evaluationRequest.id)
  );
  const analysisIds = new Set(
    analysisResults
      .filter((analysisResult) => requestIds.has(analysisResult.evaluationRequestId))
      .map((analysisResult) => analysisResult.id)
  );
  const scoreIds = new Set(
    scoreResults
      .filter((scoreResult) => requestIds.has(scoreResult.evaluationRequestId))
      .map((scoreResult) => scoreResult.id)
  );
  const issueIds = new Set(
    issueResults
      .filter((issueResult) => analysisIds.has(issueResult.analysisResultId))
      .map((issueResult) => issueResult.id)
  );

  removeWhere(improvementGuides, (guide) => issueIds.has(guide.issueResultId));
  removeWhere(issueResults, (issueResult) => issueIds.has(issueResult.id));
  removeWhere(scoreDetails, (scoreDetail) => scoreIds.has(scoreDetail.scoreResultId));
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
  const legacyPath = path.startsWith("/api/") ? path.slice(4) : path;

  if (request.method === "GET" && path === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && path === "/api/health") {
    sendApiSuccess(response, { ok: true });
    return;
  }

  if (request.method === "GET" && path === "/api/requests") {
    const backendRequests = [...evaluationRequests]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .map(toBackendEvaluationRequest);

    sendApiSuccess(response, backendRequests);
    return;
  }

  const backendRequestSummaryMatch = path.match(/^\/api\/results\/requests\/(\d+)\/summary$/);
  if (request.method === "GET" && backendRequestSummaryMatch) {
    const evaluationRequestId = Number(backendRequestSummaryMatch[1]);
    const evaluationRequest = findEvaluationRequest(evaluationRequestId);

    if (!evaluationRequest) {
      sendApiError(response, 404, "Evaluation request not found");
      return;
    }

    sendApiSuccess(response, buildBackendRequestSummary(evaluationRequest));
    return;
  }

  const backendScoreMatch = path.match(/^\/api\/scores\/requests\/(\d+)$/);
  if (request.method === "GET" && backendScoreMatch) {
    const evaluationRequestId = Number(backendScoreMatch[1]);
    const evaluationRequest = findEvaluationRequest(evaluationRequestId);
    const scoreResult = findScoreResultByRequestId(evaluationRequestId);

    if (!evaluationRequest || !scoreResult) {
      sendApiError(response, 404, "Score result not found");
      return;
    }

    sendApiSuccess(response, toBackendScore(scoreResult));
    return;
  }

  const backendAnalysisResultsMatch = path.match(/^\/api\/analysis\/requests\/(\d+)\/results$/);
  if (request.method === "GET" && backendAnalysisResultsMatch) {
    const evaluationRequestId = Number(backendAnalysisResultsMatch[1]);
    const evaluationRequest = findEvaluationRequest(evaluationRequestId);

    if (!evaluationRequest) {
      sendApiError(response, 404, "Evaluation request not found");
      return;
    }

    sendApiSuccess(response, findAnalysisResultsByRequestId(evaluationRequestId).map(toBackendAnalysisResult));
    return;
  }

  const backendIssuesMatch = path.match(/^\/api\/analysis\/results\/(\d+)\/issues$/);
  if (request.method === "GET" && backendIssuesMatch) {
    const analysisResultId = Number(backendIssuesMatch[1]);
    const analysisResult = analysisResults.find((item) => item.id === analysisResultId);

    if (!analysisResult) {
      sendApiError(response, 404, "Analysis result not found");
      return;
    }

    sendApiSuccess(response, findIssuesByAnalysisResultId(analysisResultId).map(toBackendIssue));
    return;
  }

  if (request.method === "POST" && legacyPath === "/auth/login") {
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

  if (request.method === "GET" && legacyPath === "/dashboard") {
    sendJson(response, 200, buildDashboardPayload());
    return;
  }

  if (request.method === "GET" && legacyPath === "/organizations") {
    sendJson(response, 200, { organizations });
    return;
  }

  if (request.method === "GET" && legacyPath === "/evaluation-targets") {
    sendJson(response, 200, { evaluationTargets: evaluationTargets });
    return;
  }

  if (request.method === "GET" && legacyPath === "/evaluation-requests") {
    sendJson(response, 200, { evaluationRequests: evaluationRequests });
    return;
  }

  if (request.method === "GET" && legacyPath === "/analysis-results") {
    sendJson(response, 200, { analysisResults: analysisResults });
    return;
  }

  if (request.method === "GET" && legacyPath === "/issue-results") {
    sendJson(response, 200, { issueResults: issueResults });
    return;
  }

  if (request.method === "GET" && legacyPath === "/score-results") {
    sendJson(response, 200, { scoreResults: scoreResults });
    return;
  }

  if (request.method === "GET" && legacyPath === "/score-details") {
    sendJson(response, 200, { scoreDetails: scoreDetails });
    return;
  }

  if (request.method === "GET" && legacyPath === "/improvement-guides") {
    sendJson(response, 200, { improvementGuides: improvementGuides });
    return;
  }

  if (request.method === "POST" && legacyPath === "/organizations") {
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
        homepageUrl: "",
        description,
        status: "active",
        createdAt: now,
        updatedAt: now
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

  const organizationRouteMatch = legacyPath.match(/^\/organizations\/(\d+)$/);
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
        organization.updatedAt = new Date().toISOString();
        sendJson(response, 200, { organization });
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : "Invalid request"
        });
      }
      return;
    }

    for (const evaluationTarget of evaluationTargets.filter((target) => target.organizationId === organizationId)) {
      removeEvaluationTargetData(evaluationTarget.id);
    }
    removeWhere(evaluationTargets, (evaluationTarget) => evaluationTarget.organizationId === organizationId);
    removeWhere(organizations, (item) => item.id === organizationId);
    sendJson(response, 200, { organization });
    return;
  }

  const createEvaluationTargetMatch = legacyPath.match(/^\/organizations\/(\d+)\/evaluation-targets$/);
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
      const accessUrl = typeof payload.accessUrl === "string" ? payload.accessUrl.trim() : "";

      if (name.length === 0 || accessUrl.length === 0) {
        sendJson(response, 400, { error: "name and accessUrl are required" });
        return;
      }

      const now = new Date().toISOString();
      const evaluationTarget = {
        id: nextEvaluationTargetId++,
        organizationId: organization.id,
        name,
        targetType: organization.type,
        accessUrl: accessUrl,
        description: `${name} 평가 대상`,
        status: "active",
        createdAt: now,
        updatedAt: now
      };

      evaluationTargets.push(evaluationTarget);
      createEvaluationRequestSnapshot(evaluationTarget, monthWindows.length - 1);
      organization.updatedAt = now;
      sendJson(response, 201, { evaluation_target: evaluationTarget });
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : "Invalid request"
      });
    }
    return;
  }

  const evaluationTargetRouteMatch = legacyPath.match(/^\/organizations\/(\d+)\/evaluation-targets\/(\d+)$/);
  if ((request.method === "PATCH" || request.method === "DELETE") && evaluationTargetRouteMatch) {
    const organizationId = Number(evaluationTargetRouteMatch[1]);
    const evaluationTargetId = Number(evaluationTargetRouteMatch[2]);
    const organization = findOrganization(organizationId);
    const evaluationTarget = findEvaluationTarget(evaluationTargetId);

    if (!organization || !evaluationTarget || evaluationTarget.organizationId !== organizationId) {
      sendJson(response, 404, { error: "Evaluation target not found" });
      return;
    }

    if (request.method === "PATCH") {
      try {
        const body = await readJsonBody(request);
        const payload = body && typeof body === "object" ? body : {};
        const name = typeof payload.name === "string" ? payload.name.trim() : "";
        const accessUrl = typeof payload.accessUrl === "string" ? payload.accessUrl.trim() : "";

        if (name.length === 0 || accessUrl.length === 0) {
          sendJson(response, 400, { error: "name and accessUrl are required" });
          return;
        }

        evaluationTarget.name = name;
        evaluationTarget.accessUrl = accessUrl;
        evaluationTarget.updatedAt = new Date().toISOString();
        organization.updatedAt = evaluationTarget.updatedAt;
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
    organization.updatedAt = new Date().toISOString();
    sendJson(response, 200, { evaluation_target: evaluationTarget });
    return;
  }

  const evaluationTargetRequestRouteMatch = legacyPath.match(/^\/evaluation-targets\/(\d+)\/evaluation-requests$/);
  if (request.method === "POST" && evaluationTargetRequestRouteMatch) {
    const evaluationTargetId = Number(evaluationTargetRequestRouteMatch[1]);
    const evaluationTarget = findEvaluationTarget(evaluationTargetId);
    const organization = evaluationTarget ? findOrganization(evaluationTarget.organizationId) : null;

    if (!organization || !evaluationTarget) {
      sendJson(response, 404, { error: "Evaluation target not found" });
      return;
    }

    createEvaluationRequestSnapshot(evaluationTarget, monthWindows.length - 1);
    organization.updatedAt = new Date().toISOString();
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
