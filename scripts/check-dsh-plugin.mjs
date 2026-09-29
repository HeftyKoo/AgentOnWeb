// Verify the actual packed plugin against a separately installed DSH release.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify, parseArgs } from "node:util";

const { values } = parseArgs({ options: { deps: { type: "string" }, chromium: { type: "string" } } });
assert.ok(values.deps && values.chromium, "Required: --deps <npm test prefix> --chromium <executable>");
const root = resolve(import.meta.dirname, "..");
const contract = JSON.parse(await readFile(resolve(root, "release-contract.json"), "utf8"));
const dshPackage = JSON.parse(await readFile(resolve(values.deps, "node_modules/@deepseek-ai/dsh/package.json"), "utf8"));
const { chromium } = await import(pathToFileURL(resolve(values.deps, "node_modules/playwright-core/index.mjs")));
const execute = promisify(execFile);
const directory = await mkdtemp(resolve(tmpdir(), "agentonweb-dsh-plugin-"));
const env = { ...process.env, HOME: directory, DSH_HOME: resolve(directory, "dsh") };
const entry = resolve(values.deps, "node_modules/@deepseek-ai/dsh/lib/bin.js");
const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
let host, context;
let logs = "";
console.log(`Testing packed plugin ${contract.pluginVersion} with DSH ${dshPackage.version}`);
try {
  await execute(process.execPath, [entry, "plugin", "--profile", "web", "add", resolve(root, "release", contract.artifacts.dshPlugin)], {
    env, cwd: directory, timeout: 90000, maxBuffer: 4 * 1024 * 1024,
  });
  console.log("PASS: isolated DSH web-profile plugin installation");
  host = spawn(process.execPath, [entry, "web", "--no-open", "--port", "0"], {
    env, cwd: directory, stdio: ["ignore", "pipe", "pipe"],
  });
  host.stdout.on("data", (chunk) => { logs += chunk; });
  host.stderr.on("data", (chunk) => { logs += chunk; });
  let url;
  for (let count = 0; count < 300; count++) {
    url = logs.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s\x1b]+/)?.[0];
    if (url || host.exitCode !== null) break;
    await delay(100);
  }
  assert.ok(url, "DSH launch URL missing");
  let response;
  for (let count = 0; count < 100; count++) {
    try {
      response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2000) });
      break;
    } catch {
      if (host.exitCode !== null) break;
      await delay(100);
    }
  }
  assert.equal(response?.status, 303, "DSH browser session exchange");
  const cookie = response.headers.getSetCookie().map((item) => item.split(";")[0]).join("; ");
  const origin = new URL(url).origin;
  for (const route of ["connections", "native-view"]) {
    let result;
    for (let count = 0; count < 50; count++) {
      result = await fetch(`${origin}/api/agentonweb/${route}`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(2000) });
      if (result.status === 200) break;
      await result.arrayBuffer();
      await delay(100);
    }
    assert.equal(result.status, 200, route);
    await result.json();
  }
  console.log("PASS: plugin runtime activates and authenticated management/view APIs return JSON");
  context = await chromium.launchPersistentContext("", { executablePath: values.chromium, headless: false });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  // Fresh DSH onboarding is completed without credentials or model requests.
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Configure later", exact: true }).click();
  await page.getByText("Settings", { exact: true }).click();
  await page.getByText("AgentOnWeb", { exact: true }).click();
  await page.getByText("No authorized browser connections.", { exact: true }).waitFor();
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log("PASS: native DSH UI and AgentOnWeb settings render without page errors");
} catch (error) {
  console.error(String(error));
  console.error(logs.replace(/token=[^\s]+/g, "token=<redacted>").slice(-2500));
  process.exitCode = 1;
} finally {
  await context?.close();
  if (host && host.exitCode === null) {
    host.kill("SIGTERM");
    for (let count = 0; count < 30 && host.exitCode === null; count++) await delay(100);
    if (host.exitCode === null) host.kill("SIGKILL");
  }
  await rm(directory, { recursive: true, force: true });
}
