import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

if (process.platform !== "darwin") {
  console.log("Safari native manifest validation skipped outside macOS.");
  process.exit(0);
}

const execute = promisify(execFile);
const extensionDirectory = resolve(import.meta.dirname, "../apps/extension/.output/safari-mv2");
const swift = `
import Foundation
import WebKit

let directory = URL(fileURLWithPath: ${JSON.stringify(extensionDirectory)})
Task { @MainActor in
  do {
    let webExtension = try await WKWebExtension(resourceBaseURL: directory)
    let errors = webExtension.value(forKey: "errors") as! NSArray
    if errors.count > 0 {
      for item in errors {
        let object = item as! NSObject
        print("Safari manifest error: \\(object.value(forKey: "localizedDescription") ?? "Unknown error")")
      }
      exit(1)
    }
    guard webExtension.displayName == "AgentOnWeb", webExtension.manifestVersion == 2 else {
      print("Safari parsed unexpected extension metadata.")
      exit(1)
    }
    print("Safari WKWebExtension validation passed for \\(webExtension.displayName ?? "AgentOnWeb") MV\\(webExtension.manifestVersion).")
    exit(0)
  } catch {
    print("Safari could not load the WXT output: \\(error)")
    exit(1)
  }
}
dispatchMain()
`;

const result = await execute("xcrun", ["swift", "-e", swift]);
process.stdout.write(result.stdout);
