declare module "*.css" {
  const css: string;
  export default css;
}

declare module "*.png" {
  const dataUrl: string;
  export default dataUrl;
}

declare module "*.svg" {
  const source: string;
  export default source;
}
