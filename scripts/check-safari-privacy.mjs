import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const localPaths = ["apps/safari/config/Signing.local.xcconfig", "docs/verification/local/app-store-ids.md"];

export function inspectCandidate(path, text) {
  const issues = [];
  if (/^(?:docs\/verification\/local\/|apps\/safari\/config\/.*\.local\.xcconfig$)/u.test(path)
      || /\.(?:p8|p12|pfx|pem|mobileprovision|provisionprofile|pkg)$/iu.test(path)
      || /(?:^|\/)[^/]+\.(?:xcarchive|xcresult)(?:\/|$)/u.test(path)
      || /(?:^|\/)xcuserdata\//u.test(path)) issues.push("private signing or local release file is eligible for Git");
  if (/appstoreconnect\.apple\.com\/(?:teams\/[^/\s]+\/)?apps\/\d+/iu.test(text)
      || /(?:submission(?:\s+|_)id|app\s*store\s*connect\s+app\s*id)\s*[:=]\s*[`"']?(?:[a-f\d]{8}-[a-f\d-]{27,}|\d{6,})/iu.test(text)) {
    issues.push("account-bound App Store identifier or review URL");
  }
  for (const match of text.matchAll(/\b(?:DEVELOPMENT_TEAM|DevelopmentTeam|AGENTONWEB_DEVELOPMENT_TEAM)(?:\[[^\]]+\])?\s*=\s*([^;\r\n]*)/gu)) {
    const value = match[1].replace(/\/\/.*$/u, "").trim().replace(/^["']|["']$/gu, "");
    if (value && !/^\$\([A-Z_][A-Z_\d]*\)$/u.test(value) && !(path.endsWith(".example") && value === "YOUR_TEAM_ID")) {
      issues.push("literal Apple signing team in shared configuration");
      break;
    }
  }
  if (/\b(?:PROVISIONING_PROFILE_SPECIFIER|PROVISIONING_PROFILE|ORGANIZATIONNAME)\s*=\s*"?[^";\s][^;\r\n]*/u.test(text)
      || /<key>\s*(?:teamID|provisioningProfiles|signingCertificate)\s*<\/key>/u.test(text)) {
    issues.push("account-specific signing/export metadata");
  }
  if (/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/u.test(text)) issues.push("private key material");
  return issues;
}

export async function checkSafariPrivacy(directory = root) {
  const git = async (args) => (await execute("git", args, { cwd: directory, maxBuffer: 16 * 1024 * 1024 })).stdout;
  for (const path of localPaths) {
    try { await git(["check-ignore", "--no-index", "-q", "--", path]); }
    catch { throw new Error(`Local signing/release path must be ignored: ${path}`); }
  }
  const candidates = new Set((await git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean));
  const staged = (await git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])).split("\0").filter(Boolean);
  const failures = [];
  const inspect = (path, text, source) => {
    // Binary signing artifacts are rejected by their paths; do not scan image payloads as text.
    for (const issue of inspectCandidate(path, text.includes("\0") ? "" : text)) failures.push(`${source} ${path}: ${issue}`);
  };
  for (const path of candidates) {
    try { inspect(path, await readFile(resolve(directory, path), "utf8"), "working tree"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  // A cleaned working file must not hide an older, sensitive staged copy.
  for (const path of staged) inspect(path, await git(["show", `:${path}`]), "index");
  if (failures.length) throw new Error(`Safari privacy check failed:\n${failures.join("\n")}`);
  console.log("Safari privacy check passed (Git candidates and staged changes).");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await checkSafariPrivacy();
}
