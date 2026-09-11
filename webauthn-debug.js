import { createHash } from "node:crypto";
import { decodeAttestationObject } from "@simplewebauthn/server/helpers";

// Presentation-only diagnostics. Decoding is NOT verification.
const enabled = process.env.WEBAUTHN_DEBUG === "1";

export function logWebAuthn(step, getDetails) {
  if (!enabled) return;
  try {
    console.log("\n=== WebAuthn: " + step + " ===");
    console.log(JSON.stringify(getDetails(), null, 2));
  } catch (error) {
    // A display/parsing error must never change the authentication outcome.
    console.log(JSON.stringify({ diagnosticError: error.message }));
  }
}

export function decodeClientDataJSON(encoded) {
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}

export function parseAuthenticatorHeader(data, rpID) {
  const bytes = Buffer.from(data);
  if (bytes.length < 37) throw new Error("authenticatorData must be at least 37 bytes");
  const flags = bytes[32];
  const rpIdHash = bytes.subarray(0, 32).toString("hex");
  const expectedRpIdHash = createHash("sha256").update(rpID).digest("hex");
  return {
    byteLength: bytes.length,
    rpIdHash,
    expectedRpIdHash,
    rpIdHashMatches: rpIdHash === expectedRpIdHash,
    flags: {
      hex: "0x" + flags.toString(16).padStart(2, "0"),
      UP: Boolean(flags & 0x01),
      UV: Boolean(flags & 0x04),
      BE: Boolean(flags & 0x08),
      BS: Boolean(flags & 0x10),
      AT: Boolean(flags & 0x40),
      ED: Boolean(flags & 0x80),
    },
    signCount: bytes.readUInt32BE(33),
  };
}

export function describeResponse(credential, expected) {
  const response = credential.response;
  const decoded = decodeClientDataJSON(response.clientDataJSON);
  let authData;
  let attestationFormat;
  if (response.attestationObject) {
    const attestation = decodeAttestationObject(
      new Uint8Array(Buffer.from(response.attestationObject, "base64url"))
    );
    authData = Buffer.from(attestation.get("authData"));
    attestationFormat = attestation.get("fmt");
  } else if (response.authenticatorData) {
    authData = Buffer.from(response.authenticatorData, "base64url");
  }
  return {
    status: "RECEIVED / NOT YET VERIFIED",
    expected,
    credentialID: credential.id,
    clientDataJSONBase64URL: response.clientDataJSON,
    decodedClientDataJSON: decoded,
    comparisonsForDisplayOnly: {
      typeMatches: decoded.type === expected.type,
      challengeMatches: decoded.challenge === expected.challenge,
      originMatches: decoded.origin === expected.origin,
    },
    attestationFormat,
    authenticatorDataBase64URL: authData?.toString("base64url"),
    authenticatorHeader: authData ? parseAuthenticatorHeader(authData, expected.rpID) : undefined,
    signatureBase64URL: response.signature,
    // Hash original bytes, NOT JSON.stringify(decoded).
    clientDataHashHex: createHash("sha256")
      .update(Buffer.from(response.clientDataJSON, "base64url")).digest("hex"),
    signedDataFormula: response.signature
      ? "authenticatorData || SHA-256(original clientDataJSON bytes)"
      : undefined,
  };
}

