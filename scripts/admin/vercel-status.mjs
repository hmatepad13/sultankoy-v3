import {
  formatMs,
  loadAdminEnv,
  requireConfig,
  vercelApiFetch,
} from "./admin-env.mjs";

try {
  const config = loadAdminEnv();
  requireConfig(config, "vercelToken");
  requireConfig(config, "vercelProjectId");

  const proje = await vercelApiFetch(config, `/v9/projects/${config.vercelProjectId}`);
  const deployments = await vercelApiFetch(
    config,
    `/v6/deployments?projectId=${encodeURIComponent(config.vercelProjectId)}&target=production&limit=3`,
  );

  console.log(`Vercel proje: ${proje?.name || config.vercelProjectName}`);
  console.log(`Framework: ${proje?.framework || "belirtilmemis"}`);
  console.log("");
  console.log("Son production deploylar:");

  for (const deploy of deployments?.deployments || []) {
    const sureMs =
      deploy?.readyState === "READY" && deploy?.createdAt && deploy?.ready
        ? new Date(deploy.ready).getTime() - Number(deploy.createdAt)
        : 0;
    console.log(`- ${deploy.url} | ${deploy.state || deploy.readyState || "-"} | ${formatMs(sureMs)}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
