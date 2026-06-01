#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const confPath = path.join(root, "app", "src-tauri", "tauri.conf.json");
const endpoint = process.env.AI_PM_UPDATER_ENDPOINT?.trim();
const requireEndpoint = process.argv.includes("--require");

if (!endpoint) {
  if (requireEndpoint) {
    console.error("Missing AI_PM_UPDATER_ENDPOINT.");
    console.error("Set it to the deployed latest.json URL before building release artifacts.");
    process.exit(1);
  }
  console.log("AI_PM_UPDATER_ENDPOINT is not set; leaving updater endpoint unchanged.");
  process.exit(0);
}

let url;
try {
  url = new URL(endpoint);
} catch {
  console.error(`Invalid AI_PM_UPDATER_ENDPOINT: ${endpoint}`);
  process.exit(1);
}

if (url.protocol !== "https:") {
  console.error("AI_PM_UPDATER_ENDPOINT must use https.");
  process.exit(1);
}

if (!url.pathname.endsWith(".json")) {
  console.error("AI_PM_UPDATER_ENDPOINT must point to a latest.json-style manifest URL.");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(confPath, "utf8"));
config.plugins ??= {};
config.plugins.updater ??= {};
config.plugins.updater.endpoints = [endpoint];

fs.writeFileSync(confPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Configured updater endpoint: ${endpoint}`);
