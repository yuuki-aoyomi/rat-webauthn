import express from "express";
import db from "./database.js";
import { logWebAuthn, describeResponse } from "./webauthn-debug.js";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from "@simplewebauthn/server";

const app = express();
const PORT = 3000;

const rpName = "RAT Web Authn Demo";
const rpID = "localhost";
const origin = `http://localhost:${PORT}`;
const registrationChallenges = new Map();
const authenticationChallenges = new Map();

app.use(express.json());
app.use(express.static("public"));

app.get("/api/test", (req, res) => {
  res.json({
    status: "ok"
  });
});

app.post("/api/users", (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({
      error: "username required"
    });
  }

  try {
    const result = db
      .prepare("INSERT INTO users(username) VALUES (?)")
      .run(username);

    res.json({
      id: result.lastInsertRowid,
      username
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      const user = db
        .prepare("SELECT * FROM users WHERE username = ?")
        .get(username);

      return res.json(user);
    }

    console.error(error);

    res.status(500).json({
      error: "database error"
    });
  }
});

app.post("/api/register/options", async (req, res) => {
  const { username } = req.body;

  const user = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username);

  if (!user) {
    return res.status(404).json({
      error: "user not found"
    });
  }

  const credentials = db
    .prepare("SELECT * FROM credentials WHERE user_id = ?")
    .all(user.id);

  try {
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.username,

      attestationType: "none",

      excludeCredentials: credentials.map((credential) => ({
        id: credential.id,
        transports: credential.transports
          ? JSON.parse(credential.transports)
          : undefined,
      })),

      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
    });

    registrationChallenges.set(
      username,
      options.challenge
    );

    logWebAuthn("REGISTER 1 / OPTIONS", () => ({
      challenge: options.challenge, rpID, expectedOrigin: origin,
      user: options.user, pubKeyCredParams: options.pubKeyCredParams,
      authenticatorSelection: options.authenticatorSelection,
      attestation: options.attestation,
    }));

    res.json(options);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message
    });
  }
});

app.post("/api/register/verify", async (req, res) => {
  const { username, credential } = req.body;

  const user = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username);

  if (!user) {
    return res.status(404).json({
      error: "user not found"
    });
  }

  const expectedChallenge = registrationChallenges.get(username);

  if (!expectedChallenge) {
    return res.status(400).json({
      error: "challenge not found"
    });
  }

  try {
    logWebAuthn("REGISTER 2 / RESPONSE", () => describeResponse(credential, {
      type: "webauthn.create", challenge: expectedChallenge, origin, rpID,
    }));
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true
    });

    logWebAuthn("REGISTER 3 / VERIFICATION", () => ({ verified: verification.verified }));

    if (!verification.verified) {
      return res.status(400).json({
        verified: false
      });
    }

    const registrationInfo = verification.registrationInfo;

    if (!registrationInfo) {
      return res.status(400).json({
        error: "registration info not found"
      });
    }

    const { credential: credentialInfo } = registrationInfo;

    db.prepare(`
      INSERT OR REPLACE INTO credentials
      (
        id,
        user_id,
        public_key,
        counter,
        transports
      )
      VALUES (?, ?, ?, ?, ?)
      `).run(
      credentialInfo.id,
      user.id,
      Buffer.from(credentialInfo.publicKey),
      credentialInfo.counter,
      JSON.stringify(credentialInfo.transports ?? [])
    );

    registrationChallenges.delete(username);
    logWebAuthn("REGISTER 4 / SAVED", () => ({
      verified: true, credentialID: credentialInfo.id,
      publicKeyFormat: "COSE_Key / CBOR encoded as Base64URL",
      publicKeyBase64URL: Buffer.from(credentialInfo.publicKey).toString("base64url"),
      counter: credentialInfo.counter, transports: credentialInfo.transports ?? [],
      userVerified: registrationInfo.userVerified, attestationFormat: registrationInfo.fmt,
    }));

    console.log("");
    console.log("=== Registration Success ===");
    // Detailed credential values are printed only when WEBAUTHN_DEBUG=1.
    console.log("Counter:", credentialInfo.counter);

    res.json({ verified: true });
  } catch (error) {
    logWebAuthn("REGISTER / REJECTED", () => ({ verified: false, reason: error.message }));
    console.error(error);

    res.status(400).json({
      error: error.message
    });
  }
});

app.post("/api/auth/options", async (req, res) => {
  const { username } = req.body;

  const user = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username);

  if (!user) {
    return res.status(404).json({
      error: "user not found"
    });
  }

  const credentials = db
    .prepare("SELECT * FROM credentials WHERE user_id = ?")
    .all(user.id);

  if (credentials.length == 0) {
    return res.status(400).json({
      error: "no passkey registered"
    });
  }

  try {
    const options = await generateAuthenticationOptions({
      rpID,

      allowCredentials: credentials.map((credential) => ({
        id: credential.id,
        transports: credential.transports
          ? JSON.parse(credential.transports)
          : undefined
      })),

      userVerification: "required"
    });

    authenticationChallenges.set(
      username,
      options.challenge
    );

    logWebAuthn("AUTH 1 / OPTIONS", () => ({
      challenge: options.challenge, rpID, expectedOrigin: origin,
      allowCredentials: options.allowCredentials, userVerification: options.userVerification,
    }));

    res.json(options);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error.message
    });
  }
});

app.post("/api/auth/verify", async (req, res) => {
  const { username, credential } = req.body;

  const user = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username);

  if (!user) {
    return res.status(404).json({
      error: "user not found"
    });
  }

  const storedCredential = db
    .prepare(`SELECT * FROM credentials WHERE id = ? AND user_id = ?`)
    .get(credential.id, user.id);

  if (!storedCredential) {
    return res.status(404).json({
      error: "credential not found"
    });
  }

  const expectedChallenge = authenticationChallenges.get(username);

  if (!expectedChallenge) {
    return res.status(400).json({
      error: "challenge not found"
    });
  }

  try {
    logWebAuthn("AUTH 2 / RESPONSE", () => ({
      ...describeResponse(credential, {
        type: "webauthn.get", challenge: expectedChallenge, origin, rpID,
      }),
      storedCredentialID: storedCredential.id,
      storedPublicKeyFormat: "COSE_Key / CBOR encoded as Base64URL",
      storedPublicKeyBase64URL: Buffer.from(storedCredential.public_key).toString("base64url"),
      oldCounter: storedCredential.counter,
    }));
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,

      credential: {
        id: storedCredential.id,

        publicKey: new Uint8Array(storedCredential.public_key),

        counter: storedCredential.counter,

        transports: storedCredential.transports
          ? JSON.parse(storedCredential.transports) : undefined
      }
    });

    logWebAuthn("AUTH 3 / VERIFICATION", () => ({
      verified: verification.verified,
      oldCounter: storedCredential.counter,
      newCounter: verification.authenticationInfo?.newCounter,
      userVerified: verification.authenticationInfo?.userVerified,
    }));

    if (!verification.verified) {
      return res.status(401).json({
        verified: false
      });
    }

    const newCounter = verification.authenticationInfo.newCounter;

    db.prepare(`
      UPDATE credentials
      SET counter = ?
      WHERE id = ?
      `).run(newCounter, storedCredential.id);

    authenticationChallenges.delete(username);

    console.log("");
    console.log("=== Authentication Success ===");
    console.log(`Counter: ${storedCredential.counter} -> ${newCounter}`);

    res.json({
      verified: true
    });
  } catch (error) {
    logWebAuthn("AUTH / REJECTED", () => ({ verified: false, reason: error.message }));
    console.error(error);

    res.status(401).json({
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server started: http://localhost:${PORT}`);
});