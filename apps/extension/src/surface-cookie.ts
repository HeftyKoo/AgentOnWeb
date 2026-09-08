import type { NativeSurface } from "@agentonweb/connector-contract";

export interface SurfaceCookieDetails {
  readonly url: string;
  readonly name: string;
  readonly value: string;
  readonly path: "/";
  readonly secure: true;
  readonly httpOnly: true;
  readonly sameSite: "no_restriction";
  readonly expirationDate: number;
  readonly partitionKey: { readonly topLevelSite: string };
}

export function topLevelSite(pageUrl: string): string | undefined {
  const url = new URL(pageUrl);
  return url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined;
}

export function surfaceCookieDetails(
  surface: NativeSurface,
  pageUrl: string,
  nowMilliseconds = Date.now(),
): SurfaceCookieDetails | undefined {
  const site = topLevelSite(pageUrl);
  if (!site) return undefined;
  const surfaceUrl = new URL(surface.url);
  return {
    url: `https://${surfaceUrl.host}/`,
    name: surface.cookie.name,
    value: surface.cookie.value,
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "no_restriction",
    expirationDate: nowMilliseconds / 1000 + surface.cookie.maxAgeSeconds,
    partitionKey: { topLevelSite: site },
  };
}
