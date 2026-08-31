window.__ModuleLoader__.load({
  id: "@overcode/dsh-surface",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const inject = ["theme", "slots", "sessions"];
    const clampOpacity = (value) => Math.min(0.9, Math.max(0.2, Number.isFinite(value) ? value : 0.6));
    const alpha = (value) => Math.round(Math.min(0.98, value) * 100) / 100;
    const chillTokens = (opacity) => ({
      "--dsw-alias-bg-base": { light: `rgba(245, 247, 250, ${alpha(opacity)})`, dark: `rgba(9, 12, 16, ${alpha(opacity)})` },
      "--dsw-alias-bg-layer-1": { light: `rgba(250, 251, 253, ${alpha(opacity + 0.08)})`, dark: `rgba(15, 19, 24, ${alpha(opacity + 0.08)})` },
      "--dsw-alias-bg-layer-2": { light: `rgba(255, 255, 255, ${alpha(opacity + 0.16)})`, dark: `rgba(22, 27, 33, ${alpha(opacity + 0.16)})` },
      "--dsw-alias-bg-overlay": { light: `rgba(255, 255, 255, ${alpha(opacity + 0.28)})`, dark: `rgba(31, 37, 44, ${alpha(opacity + 0.28)})` },
      "--dsw-specific-sidebar-fill": { light: `rgba(238, 242, 247, ${alpha(opacity + 0.02)})`, dark: `rgba(7, 10, 14, ${alpha(opacity + 0.02)})` },
      "--dsw-alias-border-l1": { light: "rgba(15, 23, 42, 0.1)", dark: "rgba(255, 255, 255, 0.09)" },
      "--dsw-alias-border-l2": { light: "rgba(15, 23, 42, 0.16)", dark: "rgba(255, 255, 255, 0.16)" }
    });

    function syncNativeView(ctx) {
      const sessions = ctx.sessions;
      let stopped = false;
      let restoring = true;
      let last = "";
      let hydration = 0;
      let writes = Promise.resolve();
      const selection = () => {
        const state = sessions.list.getSnapshot();
        return state.current ? { sessionId: state.current, ...(state.currentAddress ? { subagentAddress: state.currentAddress } : {}) } : {};
      };
      const save = (value) => {
        writes = writes.catch(() => {}).then(async () => {
          const response = await fetch("/api/overcode/native-view", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value), keepalive: true,
          });
          if (!response.ok) throw new Error("Unable to retain the native DSH view.");
        });
        // Keep native DSH usable if a bookmark write fails; a later selection retries.
        void writes.catch(() => {});
      };
      const restore = async () => {
        const current = ++hydration;
        restoring = true;
        try {
          await writes.catch(() => {});
          await sessions.refresh();
          const before = JSON.stringify(selection());
          const response = await fetch("/api/overcode/native-view", { cache: "no-store" });
          if (!response.ok) throw new Error("Unable to restore the native DSH view.");
          const { selection: bookmark } = await response.json();
          if (stopped || current !== hydration) return;
          // Do not replace a selection the user made while the request was pending.
          if (before !== JSON.stringify(selection()) || bookmark === null) save(selection());
          else if (!bookmark.sessionId) sessions.clear();
          else if (bookmark.subagentAddress) {
            await sessions.refreshSubagents(bookmark.subagentAddress.parentSessionId);
            if (!stopped && current === hydration && before === JSON.stringify(selection())) sessions.openSubagent(bookmark.subagentAddress);
          } else if (sessions.list.getSnapshot().byId[bookmark.sessionId]) sessions.open(bookmark.sessionId);
        } catch {
          // A deleted/unavailable native session stays unavailable. Never recreate it.
        } finally {
          if (!stopped && current === hydration) { last = JSON.stringify(selection()); restoring = false; }
        }
      };
      const unsubscribe = sessions.list.subscribe(() => {
        if (stopped || restoring || sessions.list.getSnapshot().phase !== "ready") return;
        const value = selection(); const key = JSON.stringify(value);
        if (key !== last) { last = key; save(value); }
      });
      const onVisible = () => { if (document.visibilityState === "visible") void restore(); };
      document.addEventListener("visibilitychange", onVisible);
      void restore();
      return () => { stopped = true; hydration++; unsubscribe(); document.removeEventListener("visibilitychange", onVisible); };
    }

    function apply(ctx) {
      let disposeTheme = () => {};
      let mode = "chill";
      let opacity = 0.6;
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
          : ctx.theme.overrideTokens("overcode-surface", chillTokens(opacity));
      };

      const applyOpacity = (nextOpacity) => {
        opacity = clampOpacity(nextOpacity);
        if (mode !== "focus") applyMode(mode);
      };

      const notifyOptionTap = () => {
        if (!nonce || window.parent === window) return;
        window.parent.postMessage({
          source: "overcode-surface",
          type: "site-pass.option-tap",
          nonce
        }, "*");
      };

      const onMessage = (event) => {
        const message = event.data;
        if (!nonce || event.source !== window.parent || !message || typeof message !== "object") return;
        if (message.source !== "overcode-extension" || message.nonce !== nonce) return;
        if (message.type === "mode.set") applyMode(message.mode);
        if (message.type === "opacity.set") applyOpacity(message.opacity);
      };
      const onKeyDown = (event) => {
        if (event.key === "Alt" && !event.repeat) notifyOptionTap();
      };

      ctx.effect(() => {
        if (nonce && window.parent !== window) applyMode(mode);
        window.addEventListener("message", onMessage);
        window.addEventListener("keydown", onKeyDown, true);
        return () => {
          disposeTheme();
          window.removeEventListener("message", onMessage);
          window.removeEventListener("keydown", onKeyDown, true);
        };
      }, "overcode: transparent surface and double-Option website pass-through");

      if (nonce && window.parent !== window && ctx.sessions) {
        ctx.effect(() => syncNativeView(ctx), "overcode: native view continuity across websites");
      }

      // Additive native slots only: never replace the conversation, sidebar,
      // session controls, tools, approvals, or another installed plugin.
      // Approval is intentionally unavailable inside website iframes.
      if (window.parent !== window) return;
      const React = require("react");
      const h = React.createElement;
      const listeners = new Set();
      let snapshot = { pending: [], grants: [], error: undefined };
      let stopped = false;
      let inFlight = false;
      const publish = (next) => { snapshot = next; listeners.forEach((fn) => fn()); };
      const refresh = async () => {
        if (stopped || inFlight) return;
        inFlight = true;
        try {
          const response = await fetch("/api/overcode/connections", { cache: "no-store" });
          if (!response.ok) throw new Error("Unable to read Overcode connections.");
          const next = await response.json();
          if (!stopped && JSON.stringify(next) !== JSON.stringify(snapshot)) publish(next);
        } catch (error) { if (!stopped) publish({ ...snapshot, error: error.message }); }
        finally { inFlight = false; }
      };
      const act = async (action, id) => {
        try {
          const response = await fetch("/api/overcode/connections", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id })
          });
          const next = await response.json();
          if (!response.ok) throw new Error(next.error || "Connection request failed.");
          if (!stopped) publish(next);
        } catch (error) { if (!stopped) publish({ ...snapshot, error: error.message }); }
      };
      const useConnections = () => React.useSyncExternalStore(
        (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        () => snapshot
      );
      const buttonStyle = { border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, padding: "7px 12px", cursor: "pointer", background: "var(--dsw-alias-bg-layer-2)", color: "inherit" };
      const Pending = ({ request }) => h("div", { style: { display: "grid", gap: 10 } },
        h("strong", null, "Allow Overcode to connect?"),
        h("span", null, "This browser extension can use your native DSH workspace, including its coding tools. Only allow a request you initiated."),
        h("code", { style: { overflowWrap: "anywhere", fontSize: 11 } }, request.origin),
        h("div", { style: { display: "flex", gap: 8 } },
          h("button", { style: buttonStyle, onClick: () => act("deny", request.id) }, "Decline"),
          h("button", { style: { ...buttonStyle, background: "#8ee6b7", color: "#092519" }, onClick: () => act("allow", request.id) }, "Allow connection")
        )
      );
      const Approval = () => {
        const data = useConnections();
        const pending = data.pending[0];
        if (!pending) return null;
        return h("section", { role: "region", "aria-label": "Overcode connection authorization", style: {
          pointerEvents: "auto", position: "fixed", right: 24, bottom: 24, width: "min(380px, calc(100vw - 48px))",
          padding: 20, borderRadius: 14, background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-text-primary)",
          border: "1px solid var(--dsw-alias-border-l2)", boxShadow: "0 12px 48px #0004", fontSize: 13
        } }, h(Pending, { request: pending }), data.error && h("p", { role: "alert" }, data.error));
      };
      const Connections = () => {
        const data = useConnections();
        return h("section", { style: { display: "grid", gap: 16, padding: 20 } },
          h("h3", null, "Overcode"),
          h("p", null, "Your coding agent, everywhere. Start a connection from the Chrome extension, then approve it here."),
          data.error && h("p", { role: "alert" }, data.error),
          ...data.pending.map((request) => h(Pending, { request, key: request.id })),
          !data.grants.length && h("p", null, "No authorized browser connections."),
          ...data.grants.map((grant) => h("div", { key: grant.id, style: { display: "grid", gap: 8 } },
            h("code", { style: { overflowWrap: "anywhere", fontSize: 12 } }, grant.origin),
            h("button", { style: buttonStyle, onClick: () => act("revoke", grant.id) }, "Revoke connection")
          ))
        );
      };
      ctx.slots.inject("shell.overlay", () => ctx.slots.register({ name: "shell.overlay", id: "overcode-authorization", order: 100 }, Approval));
      ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "overcode", order: 90, label: "Overcode" }, Connections));
      ctx.effect(() => {
        void refresh();
        const timer = setInterval(refresh, 2000);
        return () => { stopped = true; clearInterval(timer); listeners.clear(); };
      }, "overcode: native connection approvals");
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
