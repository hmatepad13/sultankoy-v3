const GITHUB_OWNER = "hmatepad13";
const GITHUB_REPO = "sultankoy-v3";
const WORKFLOW_FILE = "nightly-full-backup.yml";
const BACKUP_REPO_URL = "https://github.com/hmatepad13/sultankoy-v3-backups";
const WORKFLOW_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}`;

export default async function handler(_request, response) {
  const token = process.env.BACKUP_REPO_TOKEN || process.env.GITHUB_TOKEN;

  if (!token) {
    response.status(500).json({
      message: "Bulut yedek durumu için gerekli GitHub token bulunamadı.",
    });
    return;
  }

  try {
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "sultankoy-v3-backup-status",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const [workflowResponse, runsResponse] = await Promise.all([
      fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}`, { headers }),
      fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/runs?branch=main&per_page=10`,
        { headers },
      ),
    ]);
    const [workflow, payload] = await Promise.all([
      workflowResponse.json().catch(() => null),
      runsResponse.json().catch(() => null),
    ]);
    if (!workflowResponse.ok || !runsResponse.ok) {
      response.status(!workflowResponse.ok ? workflowResponse.status : runsResponse.status).json({
        message: workflow?.message || payload?.message || "GitHub yedek durumu okunamadı.",
      });
      return;
    }

    const runs = Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];
    const lastSuccessfulRun = runs.find((run) => run?.conclusion === "success") || null;
    const latestRun = runs[0] || null;
    const workflowState = workflow?.state || "unknown";
    const isActive = workflowState === "active";
    const latestFailed = latestRun?.status === "completed" && latestRun?.conclusion !== "success";
    const status = !isActive || latestFailed ? "error" : "healthy";
    const summaryText = !isActive
      ? `Yedek görevi çalışmıyor: GitHub iş akışı ${workflowState} durumunda.`
      : latestFailed
        ? `Son yedek çalışması başarısız oldu: ${latestRun?.conclusion || "bilinmiyor"}.`
        : "Tam yedek zamanlaması etkin ve son çalışma durumu normal.";

    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
    response.status(200).json({
      enabled: isActive,
      status,
      workflowState,
      summaryText,
      scheduleLabel: "Her gün 03:17",
      destinationLabel: "GitHub bulut yedek deposu",
      backupRepoUrl: BACKUP_REPO_URL,
      workflowUrl: WORKFLOW_URL,
      lastSuccessfulAt: lastSuccessfulRun?.updated_at || lastSuccessfulRun?.run_started_at || null,
      lastSuccessfulRunUrl: lastSuccessfulRun?.html_url || WORKFLOW_URL,
      lastRunAt: latestRun?.updated_at || latestRun?.run_started_at || null,
      lastRunConclusion: latestRun?.conclusion || latestRun?.status || null,
      lastRunUrl: latestRun?.html_url || WORKFLOW_URL,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    response.status(500).json({
      message: `Bulut yedek durumu alınamadı: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
    });
  }
}
