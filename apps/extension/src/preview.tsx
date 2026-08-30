import styles from "./overlay.css";

const style = document.createElement("style");
style.textContent = styles;
document.head.append(style);

const container = document.getElementById("overcode-preview");
if (!container) throw new Error("Missing preview container");

container.className = "overcode-root";
const shell = document.createElement("section");
shell.className = "surface-shell";
const frame = document.createElement("iframe");
frame.className = "harness-frame";
frame.title = "DeepSeek Harness native surface preview";
frame.src = new URL(location.href).searchParams.get("surface") ?? "about:blank";
const dock = document.createElement("nav");
dock.className = "surface-dock";
const brand = document.createElement("span");
brand.className = "surface-brand";
brand.textContent = "OVERCODE";
const runtime = document.createElement("span");
runtime.className = "surface-runtime";
runtime.textContent = "DeepSeek Harness native UI";
dock.append(brand, runtime);
for (const mode of ["chill", "focus", "watch"] as const) {
  const button = document.createElement("button");
  button.textContent = mode;
  button.setAttribute("aria-pressed", String(mode === "chill"));
  button.addEventListener("click", () => {
    container.dataset.mode = mode;
    dock.querySelectorAll("button").forEach((sibling) => {
      sibling.setAttribute("aria-pressed", String(sibling === button));
    });
  });
  dock.append(button);
}
const hint = document.createElement("span");
hint.className = "surface-hint";
hint.textContent = "HOLD ⌥ FOR WEBSITE";
dock.append(hint);
shell.append(frame, dock);
container.append(shell);
container.dataset.mode = "chill";
