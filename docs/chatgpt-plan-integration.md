# ChatGPT plan integration: current decision

Reviewed 2026-11-09. This project does **not** yet offer Sign in with ChatGPT or ChatGPT plan usage. The existing API-key provider is separately billed; do not paste a ChatGPT password, OAuth token, or Codex credential into its API-key field.

## Blocker

OpenAI publishes the official [`@siwc/local` SDK](https://github.com/openai/sign-in-with-chatgpt-devkit) as a local workspace in its DevKit. Its [license](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/main/LICENSE) permits use and distribution only for defined noncommercial purposes and requires a separate written agreement for commercial use. Modified Work distributions carry additional licensing conditions. The license distinguishes independently authored software that merely calls or links to the Work, but the Work itself remains restricted. This is not equivalent to this repository's MIT license, which permits commercial use. Do not vendor the DevKit or represent it as MIT-licensed; separately distributing or depending on it needs a deliberate licensing decision and legal review. The license itself grants no access to OpenAI services.

This decision is not a claim that OpenAI requires an SDK for the protocol: its [open-source plan usage documentation](https://developers.openai.com/siwc/token-sharing-open-source) describes a separate OAuth contract. However, this project has limited this implementation to the official SDK; no independently implemented OAuth fallback has been added. Obtain suitable licensing/permission or explicitly revisit that constraint before implementing. A paid or remotely hosted app should consult OpenAI's current eligibility and interest process.

## Implementation and verification prerequisites

- OpenAI distinguishes identity sign-in from the separately consented ChatGPT plan permission. A verified identity or model catalog is not proof of inference entitlement. See the [quickstart](https://developers.openai.com/siwc/quickstart) and [Codex app-server guide](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server).
- Use a stable opaque host identifier and app-owned registration; implement PKCE, fresh state and nonce, ID-token verification, a loopback-only callback, and OS-backed per-user credential encryption. Keep tokens out of browser responses, logs, and telemetry; guard local endpoints against unauthorized origins and requests.
- Require explicit plan-usage consent and gate inference on the appropriate granted scopes. Do not silently fall back to paid API-key usage. Handle revocation, refresh, usage limits, and model failures without exposing credentials.
- Test the auth lifecycle and browser interface with mock credentials first. Live validation requires a consenting eligible user and valid authentication; a previous Codex CLI attempt returned `401 token_revoked`, and was not a successful Sign in with ChatGPT test. Do not reuse Codex credentials as the app's OAuth grant.
