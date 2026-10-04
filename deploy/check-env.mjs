// Validates the environment for one service before it starts. Exits 1 on errors.
import { SERVICES, checkEnv, formatReport } from "../packages/shared/dist/index.js";

const service = process.argv[2] ?? process.env.SERVICE ?? "web";
if (!SERVICES.includes(service)) {
  console.error(`Unknown service '${service}'. Expected one of: ${SERVICES.join(", ")}`);
  process.exit(64);
}
const report = checkEnv(service, process.env);
if (report.errors.length > 0 || report.warnings.length > 0)
  console.error(formatReport(service, report));
if (report.errors.length > 0) {
  console.error(`[env] ${service} will not start until the errors above are fixed.`);
  process.exit(1);
}
