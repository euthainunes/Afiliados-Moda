import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";

// Autenticador WebAuthn de SOFTWARE para testes: gera um par P-256 e monta respostas assinadas
// exatamente como um aparelho faria (formato "none", presença e verificação da pessoa).
const b64 = (b: Uint8Array | Buffer) => Buffer.from(b).toString("base64url");
const sha256 = (b: Uint8Array | Buffer | string) => createHash("sha256").update(b).digest();

export class SoftAuthenticator {
  readonly credentialId = randomBytes(16);
  private readonly privateKey: KeyObject;
  private readonly cosePublicKey: Uint8Array;
  counter = 0;
  userHandle?: string;

  constructor(
    private readonly origin = "http://localhost:3000",
    private readonly rpID = "localhost",
    private readonly userVerified = true,
  ) {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.privateKey = privateKey;
    const jwk = publicKey.export({ format: "jwk" });
    this.cosePublicKey = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x!, "base64url")],
        [-3, Buffer.from(jwk.y!, "base64url")],
      ]),
    );
  }

  get id() {
    return b64(this.credentialId);
  }

  private flags(attested: boolean) {
    return 0x01 | (this.userVerified ? 0x04 : 0) | (attested ? 0x40 : 0);
  }

  private counterBytes() {
    const c = Buffer.alloc(4);
    c.writeUInt32BE(this.counter);
    return c;
  }

  register(options: { challenge: string; user: { id: string } }) {
    this.userHandle = options.user.id;
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin: this.origin, crossOrigin: false }));
    const idLen = Buffer.alloc(2);
    idLen.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([sha256(this.rpID), Buffer.from([this.flags(true)]), this.counterBytes(), Buffer.alloc(16), idLen, this.credentialId, Buffer.from(this.cosePublicKey)]);
    const attestationObject = isoCBOR.encode(new Map<string, unknown>([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]) as never);
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key" as const,
      response: { clientDataJSON: b64(clientDataJSON), attestationObject: b64(attestationObject), transports: ["internal" as const] },
      clientExtensionResults: {},
      authenticatorAttachment: "platform" as const,
    };
  }

  authenticate(options: { challenge: string }, { counterStep = 1 }: { counterStep?: number } = {}) {
    this.counter += counterStep;
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin: this.origin, crossOrigin: false }));
    const authData = Buffer.concat([sha256(this.rpID), Buffer.from([this.flags(false)]), this.counterBytes()]);
    const signature = sign("sha256", Buffer.concat([authData, sha256(clientDataJSON)]), this.privateKey);
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key" as const,
      response: { clientDataJSON: b64(clientDataJSON), authenticatorData: b64(authData), signature: b64(signature), userHandle: this.userHandle },
      clientExtensionResults: {},
      authenticatorAttachment: "platform" as const,
    };
  }
}
