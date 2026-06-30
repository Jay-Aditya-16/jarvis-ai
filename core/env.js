import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "..");
export const ENV_PATH = path.join(PROJECT_ROOT, ".env");

let loaded = false;

export function loadEnv() {
  if (loaded) return;
  dotenv.config({ path: ENV_PATH, quiet: true });
  loaded = true;
}

loadEnv();
