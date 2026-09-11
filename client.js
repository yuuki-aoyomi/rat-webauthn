import { startRegistration, startAuthentication } from "@simplewebauthn/browser";

const usernameInput = document.getElementById("username");
const loginButton = document.getElementById("login");
const registerButton = document.getElementById("register");
const result = document.getElementById("result");

loginButton.addEventListener("click", async () => {
  try {
    const username = usernameInput.value;

    const optionsResponse = await fetch("/api/auth/options",
      {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          username
        })
      }
    );

    const optionsJSON = await optionsResponse.json();

    console.log("Authentication Options:", optionsJSON);

    if (!optionsResponse.ok) {
      result.textContent = JSON.stringify(optionsJSON);

      return;
    }

    const credential = await startAuthentication({
      optionsJSON
    });

    console.log("Authentication Credential:", credential);

    const verifyResponse = await fetch("/api/auth/verify",
      {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          username,
          credential
        })
      }
    );

    const verification = await verifyResponse.json();

    console.log("Authentication Verification:", verification);

    result.textContent = verification.verified
      ? "Passkeyログイン成功"
      : JSON.stringify(verification);
  } catch (error) {
    console.error(error);

    result.textContent = error.message;
  }
});

registerButton.addEventListener("click", async () => {
  try {
    const username = usernameInput.value;
    const optionsResponse = await fetch("/api/register/options", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        username
      })
    });

    const optionsJSON = await optionsResponse.json();

    console.log("Server Options:", optionsJSON);

    if (!optionsResponse.ok) {
      result.textContent = JSON.stringify(optionsJSON);
      return;
    }

    const credential = await startRegistration({
      optionsJSON
    });

    console.log("Credential:", credential);

    result.textContent = "AuthenticatorからCredentialを取得しました";

    const verifyResponse = await fetch("/api/register/verify",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          username,
          credential
        })
      });

    const verification = await verifyResponse.json();

    console.log("Verification: ", verification);

    result.textContent = verification.verified ? "Passkey登録成功" : JSON.stringify(verification);
  } catch (error) {
    console.error(error);

    result.textContent = error.message;
  }
});