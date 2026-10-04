import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Load the repository-root .env for whichever process imports this
 * (web, worker, bot, scripts). Existing environment variables win.
 */
export function loadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, ".env");
    if (existsSync(candidate)) {
      config({ path: candidate, quiet: true });
      return;
    }
    dir = path.dirname(dir);
  }
}
