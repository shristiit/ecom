#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2).filter((arg) => arg !== "--local");
const [command, platform, modeOrFlag, maybeFlag] = args;

const envFile = path.join(projectRoot, ".env");
const appConfigPath = path.join(projectRoot, "app.json");
const homeDir = process.env.HOME || process.env.USERPROFILE || "";

const envFromFile = loadEnvFile(envFile);
const appConfig = JSON.parse(fs.readFileSync(appConfigPath, "utf8"));
const appName = appConfig.expo?.name ?? "StockAisle Admin";
const iosTargetName = sanitizeName(appName);

const modeConfigs = {
  dev: {
    apiUrl:
      process.env.ADMIN_DEV_API_URL ||
      envFromFile.ADMIN_DEV_API_URL ||
      "http://localhost:4000/api",
    nodeEnv: "development",
    release: false,
  },
  browserstack: {
    apiUrl:
      process.env.ADMIN_BROWSERSTACK_API_URL ||
      envFromFile.ADMIN_BROWSERSTACK_API_URL ||
      process.env.ADMIN_PROD_API_URL ||
      envFromFile.ADMIN_PROD_API_URL ||
      process.env.EXPO_PUBLIC_API_URL ||
      envFromFile.EXPO_PUBLIC_API_URL ||
      "http://localhost:4000/api",
    nodeEnv: "production",
    release: true,
  },
  prod: {
    apiUrl:
      process.env.ADMIN_PROD_API_URL ||
      envFromFile.ADMIN_PROD_API_URL ||
      process.env.EXPO_PUBLIC_API_URL ||
      envFromFile.EXPO_PUBLIC_API_URL ||
      "http://localhost:4000/api",
    nodeEnv: "production",
    release: true,
  },
};

main();

function main() {
  switch (command) {
    case "sync":
      runSync(platform, modeOrFlag === "--clean" || maybeFlag === "--clean");
      return;
    case "run":
      runNative(platform, modeOrFlag || "dev");
      return;
    case "build":
      buildNative(platform, modeOrFlag || "prod");
      return;
    default:
      printUsage();
      process.exit(1);
  }
}

function runSync(targetPlatform, clean) {
  const prebuildArgs = ["expo", "prebuild"];
  if (targetPlatform && targetPlatform !== "all") {
    prebuildArgs.push("--platform", targetPlatform);
  }
  if (clean) {
    prebuildArgs.push("--clean");
  }

  runCommand("npx", prebuildArgs, {
    cwd: projectRoot,
    env: buildEnv("prod"),
  });
}

function runNative(targetPlatform, mode) {
  assertPlatform(targetPlatform);
  assertMode(mode);
  ensureNativeProject(targetPlatform, mode);

  const expoArgs =
    targetPlatform === "android" ? ["expo", "run:android"] : ["expo", "run:ios"];

  runCommand("npx", expoArgs, {
    cwd: projectRoot,
    env: buildEnv(mode),
  });
}

function buildNative(targetPlatform, mode) {
  assertPlatform(targetPlatform);
  assertMode(mode);
  ensureNativeProject(targetPlatform, mode);

  if (targetPlatform === "android") {
    buildAndroid(mode);
    return;
  }

  buildIos(mode);
}

function buildAndroid(mode) {
  const gradleTask = modeConfigs[mode].release ? "assembleRelease" : "assembleDebug";
  const gradleWrapper = path.join(projectRoot, "android", "gradlew");
  const env = buildEnv(mode);

  if (!fs.existsSync(gradleWrapper)) {
    fail("Android project is missing gradle wrapper. Run sync first.");
  }

  ensureAndroidSdkConfig(env);

  runCommand(gradleWrapper, [gradleTask], {
    cwd: path.join(projectRoot, "android"),
    env,
  });

  const buildType = modeConfigs[mode].release ? "release" : "debug";
  const apkPath = path.join(
    projectRoot,
    "android",
    "app",
    "build",
    "outputs",
    "apk",
    buildType,
    `app-${buildType}.apk`
  );

  console.log(`Android build complete: ${apkPath}`);
}

function buildIos(mode) {
  const iosDir = path.join(projectRoot, "ios");
  const workspacePath = path.join(iosDir, `${iosTargetName}.xcworkspace`);

  if (!fs.existsSync(workspacePath)) {
    fail(`iOS workspace not found at ${workspacePath}. Run sync first.`);
  }

  const configuration = modeConfigs[mode].release ? "Release" : "Debug";
  const derivedDataPath = path.join(iosDir, "build");
  const destination = modeConfigs[mode].release
    ? "generic/platform=iOS"
    : "platform=iOS Simulator,name=iPhone 16";

  runCommand(
    "xcodebuild",
    [
      "-workspace",
      workspacePath,
      "-scheme",
      iosTargetName,
      "-configuration",
      configuration,
      "-derivedDataPath",
      derivedDataPath,
      "-destination",
      destination,
      "build",
    ],
    {
      cwd: iosDir,
      env: buildEnv(mode),
    }
  );

  const productsDir = path.join(
    derivedDataPath,
    "Build",
    "Products",
    modeConfigs[mode].release ? "Release-iphoneos" : "Debug-iphonesimulator"
  );

  console.log(`iOS build complete: ${productsDir}`);
}

function ensureNativeProject(targetPlatform, mode) {
  const nativeDir = path.join(projectRoot, targetPlatform);
  if (fs.existsSync(nativeDir)) {
    return;
  }

  console.log(`${targetPlatform} project is missing. Generating native project with Expo prebuild.`);

  runCommand(
    "npx",
    ["expo", "prebuild", "--platform", targetPlatform],
    {
      cwd: projectRoot,
      env: buildEnv(mode),
    }
  );
}

function buildEnv(mode) {
  const modeConfig = modeConfigs[mode];
  const androidSdkPath = resolveAndroidSdkPath();
  return {
    ...process.env,
    ...envFromFile,
    ...(androidSdkPath
      ? {
          ANDROID_HOME: process.env.ANDROID_HOME || androidSdkPath,
          ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT || androidSdkPath,
        }
      : {}),
    EXPO_PUBLIC_API_URL: modeConfig.apiUrl,
    EXPO_PUBLIC_BUILD_MODE: mode,
    NODE_ENV: modeConfig.nodeEnv,
  };
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

function ensureAndroidSdkConfig(env) {
  const sdkPath = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  if (!sdkPath) {
    fail(
      "Android SDK not found. Set ANDROID_HOME or install the SDK under ~/Library/Android/sdk."
    );
  }

  const localPropertiesPath = path.join(projectRoot, "android", "local.properties");
  const desiredValue = `sdk.dir=${sdkPath.replace(/\\/g, "\\\\")}\n`;

  if (!fs.existsSync(localPropertiesPath) || fs.readFileSync(localPropertiesPath, "utf8") !== desiredValue) {
    fs.writeFileSync(localPropertiesPath, desiredValue, "utf8");
  }
}

function resolveAndroidSdkPath() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    homeDir ? path.join(homeDir, "Library", "Android", "sdk") : "",
    homeDir ? path.join(homeDir, "Android", "Sdk") : "",
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function sanitizeName(value) {
  return value.replace(/[^A-Za-z0-9]/g, "");
}

function assertPlatform(targetPlatform) {
  if (targetPlatform !== "android" && targetPlatform !== "ios") {
    fail(`Unsupported platform "${targetPlatform}". Use "android" or "ios".`);
  }
}

function assertMode(mode) {
  if (!modeConfigs[mode]) {
    fail(`Unsupported mode "${mode}". Use "dev", "browserstack", or "prod".`);
  }
}

function printUsage() {
  console.error(
    [
      "Usage:",
      "  node ./scripts/native-workflow.js sync [android|ios|all] [--clean]",
      "  node ./scripts/native-workflow.js run [android|ios] [dev|browserstack|prod]",
      "  node ./scripts/native-workflow.js build [android|ios] [prod|browserstack|dev]",
    ].join("\n")
  );
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
