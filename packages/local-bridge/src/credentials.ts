import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CREDENTIAL_FILE = "bridge-credential.json";
const PAIRING_TTL_MS = 10 * 60 * 1_000;
const MAX_PAIRING_FAILURES = 5;
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

interface StoredCredential {
  readonly version: 1;
  readonly extensionOrigin: string;
  readonly credentialHash: string;
  readonly createdAt: string;
}

export interface AuthorizationResult {
  readonly credential?: string;
  readonly paired: boolean;
}

export class PairingAuthority {
  readonly #directory: string;
  readonly #path: string;
  #stored: StoredCredential | undefined;
  #pairingCode: string | undefined;
  #pairingExpiresAt = 0;
  #failures = 0;

  private constructor(directory: string, stored?: StoredCredential) {
    this.#directory = directory;
    this.#path = join(directory, CREDENTIAL_FILE);
    this.#stored = stored;
    if (!stored) this.#rotatePairingCode();
  }

  static async open(directory: string, reset = false): Promise<PairingAuthority> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, CREDENTIAL_FILE);
    if (reset) await unlink(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    const stored = reset ? undefined : await readStored(path);
    return new PairingAuthority(directory, stored);
  }

  get pairingCode(): string | undefined {
    return this.#pairingCode;
  }

  get configuredOrigin(): string | undefined {
    return this.#stored?.extensionOrigin;
  }

  async authorize(
    origin: string | undefined,
    input: { readonly credential?: string; readonly pairingCode?: string },
  ): Promise<AuthorizationResult> {
    if (!origin || !EXTENSION_ORIGIN.test(origin)) {
      throw new AuthorizationError("INVALID_EXTENSION_ORIGIN", "Only a Chromium extension may connect.");
    }

    if (this.#stored) {
      if (origin !== this.#stored.extensionOrigin || !input.credential) {
        throw new AuthorizationError("AUTHENTICATION_FAILED", "Bridge authentication failed.");
      }
      const expected = Buffer.from(this.#stored.credentialHash, "hex");
      const actual = Buffer.from(hashCredential(input.credential), "hex");
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        throw new AuthorizationError("AUTHENTICATION_FAILED", "Bridge authentication failed.");
      }
      return { paired: true };
    }

    if (Date.now() > this.#pairingExpiresAt) this.#rotatePairingCode();
    if (!input.pairingCode || input.pairingCode.replace(/\s/g, "") !== this.#pairingCode) {
      this.#failures += 1;
      if (this.#failures >= MAX_PAIRING_FAILURES) this.#rotatePairingCode();
      throw new AuthorizationError("PAIRING_CODE_INVALID", "The pairing code is invalid or expired.");
    }

    const credential = randomBytes(32).toString("base64url");
    const stored: StoredCredential = {
      version: 1,
      extensionOrigin: origin,
      credentialHash: hashCredential(credential),
      createdAt: new Date().toISOString(),
    };
    await this.#write(stored);
    this.#stored = stored;
    this.#pairingCode = undefined;
    return { paired: true, credential };
  }

  #rotatePairingCode(): void {
    this.#pairingCode = randomInt(0, 100_000_000).toString().padStart(8, "0");
    this.#pairingExpiresAt = Date.now() + PAIRING_TTL_MS;
    this.#failures = 0;
  }

  async #write(stored: StoredCredential): Promise<void> {
    const temporary = join(this.#directory, `${CREDENTIAL_FILE}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
    await writeFile(temporary, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.#path);
  }
}

export class AuthorizationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

async function readStored(path: string): Promise<StoredCredential | undefined> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const value = JSON.parse(text) as Partial<StoredCredential>;
  if (
    value.version !== 1
    || typeof value.extensionOrigin !== "string"
    || !EXTENSION_ORIGIN.test(value.extensionOrigin)
    || typeof value.credentialHash !== "string"
    || !/^[a-f0-9]{64}$/.test(value.credentialHash)
    || typeof value.createdAt !== "string"
  ) {
    throw new Error(`Invalid Overcode bridge credential file: ${path}`);
  }
  return value as StoredCredential;
}

function hashCredential(credential: string): string {
  return createHash("sha256").update(credential, "utf8").digest("hex");
}
