import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSafariPrivacy, inspectCandidate } from "./check-safari-privacy.mjs";

const assignment = (key, value) => `${key} = ${value};`;
const fakeTeam = ["ABCDE", "12345"].join("");

describe("Safari Git privacy boundary", () => {
  it("rejects Xcode signing keys in quoted, unquoted and conditional forms", () => {
    for (const key of ["DEVELOPMENT_TEAM", "DevelopmentTeam", "DEVELOPMENT_TEAM[sdk=macosx*]", "AGENTONWEB_DEVELOPMENT_TEAM"]) {
      for (const value of [fakeTeam, `"${fakeTeam}"`]) {
        expect(inspectCandidate("project.pbxproj", assignment(key, value))).toContain("literal Apple signing team in shared configuration");
      }
    }
    expect(inspectCandidate("Signing.xcconfig", assignment("DEVELOPMENT_TEAM", "$(AGENTONWEB_DEVELOPMENT_TEAM)"))).toEqual([]);
    expect(inspectCandidate("Signing.local.xcconfig.example", assignment("AGENTONWEB_DEVELOPMENT_TEAM", "YOUR_TEAM_ID"))).toEqual([]);
  });

  it("rejects account URLs in any text file and private paths even for binary data", () => {
    const domain = ["appstoreconnect", "apple", "com"].join(".");
    for (const prefix of ["apps", "teams/fixture-team/apps"]) {
      expect(inspectCandidate("release.json", `https://${domain}/${prefix}/1234567890/testflight`)).toContain("account-bound App Store identifier or review URL");
    }
    for (const path of ["docs/verification/local/review.md", "apps/safari/config/Signing.local.xcconfig", "signing.p12", "release.xcarchive/Info.plist"]) {
      expect(inspectCandidate(path, "")).toContain("private signing or local release file is eligible for Git");
    }
    expect(inspectCandidate("README.md", "dev.agentonweb.extension.safari")).toEqual([]);
  });

  it("detects a sensitive staged copy after the working tree has been cleaned", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentonweb-privacy-"));
    const git = (...args) => execFileSync("git", args, { cwd: directory, stdio: "pipe" });
    try {
      git("init", "-q");
      await writeFile(join(directory, ".gitignore"), "apps/safari/config/*.local.xcconfig\ndocs/verification/local/\n");
      await writeFile(join(directory, "project.pbxproj"), assignment("DEVELOPMENT_TEAM", `"${fakeTeam}"`));
      git("add", "project.pbxproj");
      await writeFile(join(directory, "project.pbxproj"), "// cleaned working copy\n");
      await expect(checkSafariPrivacy(directory)).rejects.toThrow("index project.pbxproj");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("rejects a force-added local config despite a matching ignore rule", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agentonweb-privacy-"));
    const git = (...args) => execFileSync("git", args, { cwd: directory, stdio: "pipe" });
    try {
      git("init", "-q");
      await writeFile(join(directory, ".gitignore"), "apps/safari/config/*.local.xcconfig\ndocs/verification/local/\n");
      await mkdir(join(directory, "apps/safari/config"), { recursive: true });
      await writeFile(join(directory, "apps/safari/config/Signing.local.xcconfig"), "// force-added local state\n");
      git("add", "-f", "apps/safari/config/Signing.local.xcconfig");
      await expect(checkSafariPrivacy(directory)).rejects.toThrow("private signing or local release file");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
