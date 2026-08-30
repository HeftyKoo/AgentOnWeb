window.__ModuleLoader__.load({
  id: "@overcode/dsh-surface",
  factory: () => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const inject = ["theme"];
    const chillTokens = {
      "--dsw-alias-bg-base": { light: "rgba(245, 247, 250, 0.46)", dark: "rgba(9, 12, 16, 0.4)" },
      "--dsw-alias-bg-layer-1": { light: "rgba(250, 251, 253, 0.56)", dark: "rgba(15, 19, 24, 0.5)" },
      "--dsw-alias-bg-layer-2": { light: "rgba(255, 255, 255, 0.7)", dark: "rgba(22, 27, 33, 0.66)" },
      "--dsw-alias-bg-overlay": { light: "rgba(255, 255, 255, 0.9)", dark: "rgba(31, 37, 44, 0.88)" },
      "--dsw-specific-sidebar-fill": { light: "rgba(238, 242, 247, 0.5)", dark: "rgba(7, 10, 14, 0.46)" },
      "--dsw-alias-border-l1": { light: "rgba(15, 23, 42, 0.1)", dark: "rgba(255, 255, 255, 0.09)" },
      "--dsw-alias-border-l2": { light: "rgba(15, 23, 42, 0.16)", dark: "rgba(255, 255, 255, 0.16)" }
    };

    function apply(ctx) {
      let disposeTheme = () => {};
      let mode = "chill";
      const fragmentNonce = new URLSearchParams(window.location.hash.slice(1)).get("overcode");
      const nonce = fragmentNonce || (typeof window.name === "string" && window.name.startsWith("overcode:")
        ? window.name.slice("overcode:".length)
        : undefined);

      const applyMode = (nextMode) => {
        if (nextMode !== "chill" && nextMode !== "focus" && nextMode !== "watch") return;
        mode = nextMode;
        disposeTheme();
        disposeTheme = mode === "focus"
          ? () => {}
          : ctx.theme.overrideTokens("overcode-surface", chillTokens);
      };

      const notifySitePass = (active) => {
        if (!nonce || window.parent === window) return;
        window.parent.postMessage({
          source: "overcode-harness",
          type: "site-pass",
          nonce,
          active
        }, "*");
      };

      const onMessage = (event) => {
        const message = event.data;
        if (!nonce || event.source !== window.parent || !message || typeof message !== "object") return;
        if (message.source !== "overcode-extension" || message.nonce !== nonce) return;
        if (message.type === "mode.set") applyMode(message.mode);
      };
      const onKeyDown = (event) => {
        if (event.key === "Alt") notifySitePass(true);
      };
      const onKeyUp = (event) => {
        if (event.key === "Alt") notifySitePass(false);
      };
      const onBlur = () => notifySitePass(false);

      ctx.effect(() => {
        applyMode(mode);
        window.addEventListener("message", onMessage);
        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("keyup", onKeyUp, true);
        window.addEventListener("blur", onBlur);
        return () => {
          disposeTheme();
          window.removeEventListener("message", onMessage);
          window.removeEventListener("keydown", onKeyDown, true);
          window.removeEventListener("keyup", onKeyUp, true);
          window.removeEventListener("blur", onBlur);
        };
      }, "overcode: transparent surface and website pass-through");
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
