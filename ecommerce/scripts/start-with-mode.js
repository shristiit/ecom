#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const envFile = path.join(projectRoot, ".env");
const args = process.argv.slice(2);

const modeArg = args.find((arg) => !arg.startsWith("--"));
const modeFlag = args.find((arg) => arg === "--android" || arg === "--ios" || arg === "--web");

const envFromFile = loadEnvFile(envFile);
const mode = modeArg || process.env.ECOMMERCE_DEFAULT_MODE || envFromFile.ECOMMERCE_DEFAULT_MODE || "dev";

const modeConfigs = {
  local: {
    apiUrl:
      process.env.ECOMMERCE_LOCAL_API_URL ||
      envFromFile.ECOMMERCE_LOCAL_API_URL ||
      process.env.EXPO_PUBLIC_API_URL ||
      envFromFile.EXPO_PUBLIC_API_URL ||
      "http://localhost:4000/api",
  },
  dev: {
    apiUrl:
      process.env.ECOMMERCE_DEV_API_URL ||
      envFromFile.ECOMMERCE_DEV_API_URL ||
      process.env.EXPO_PUBLIC_API_URL ||
      envFromFile.EXPO_PUBLIC_API_URL ||
      "https://api-dev.stockaisle.com/api",
  },
  prod: {
    apiUrl:
      process.env.ECOMMERCE_PROD_API_URL ||
      envFromFile.ECOMMERCE_PROD_API_URL ||
      process.env.EXPO_PUBLIC_API_URL ||
      envFromFile.EXPO_PUBLIC_API_URL ||
      "https://api.stockaisle.com/api",
  },
};

main();

function main() {
  assertMode(mode);

  const expoArgs = ["expo", "start"];
  if (modeFlag) {
    expoArgs.push(modeFlag);
  }

  const env = {
    ...process.env,
    ...envFromFile,
    EXPO_PUBLIC_API_URL: modeConfigs[mode].apiUrl,
    EXPO_PUBLIC_APP_ENV: mode,
  };

  runCommand("npx", expoArgs, {
    cwd: projectRoot,
    env,
  });
}

function assertMode(selectedMode) {
  if (!modeConfigs[selectedMode]) {
    fail(`Unsupported mode "${selectedMode}". Use "local", "dev", or "prod".`);
  }
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function runCommand(commandName, commandArgs, options) {
  const result = spawnSync(commandName, commandArgs, {
    cwd: options.cwd,
    env: options.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
