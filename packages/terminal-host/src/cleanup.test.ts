import { expect, it } from "vitest";
import { cleanup } from "./cleanup.js";

it("continues cleanup after synchronous and asynchronous failures", async () => {
  const attempted: string[] = [];
  const disposeError = new Error("dispose failed");
  const closeError = new Error("close failed");
  await expect(cleanup([
    () => { attempted.push("dispose"); throw disposeError; },
    async () => { attempted.push("close"); throw closeError; },
    () => { attempted.push("unlock"); },
  ])).rejects.toMatchObject({ errors: [disposeError, closeError] });
  expect(attempted).toEqual(["dispose", "close", "unlock"]);
});
