import { createGatewayDeploymentPlan, validateBotFamilyCatalog } from "./index.mjs";

const catalog = validateBotFamilyCatalog();
const plan = createGatewayDeploymentPlan();
const result = {
  ok: catalog.ok && plan.ok,
  catalog,
  deploymentCount: plan.deployments.length,
  internalProfileCount: plan.deployments[0]?.internalProfileIds.length || 0,
  deploymentMode: plan.deployments[0]?.deploymentMode || null,
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
