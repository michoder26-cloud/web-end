# Subscription plan spike — not production

A standalone stdin/stdout adapter, not an HTTP endpoint or Studio integration. Input is one JSON object `{"brief":"..."}`; output is a validated plan JSON. Set `CODEX_BIN` to an absolute path to the official Codex CLI and use an already authenticated ChatGPT subscription session via the CLI's normal `CODEX_HOME`. Do not put credentials in the browser. Example:

```sh
printf '%s' '{"brief":"A small booking website"}' | python experiments/subscription-plan/plan.py
python -m unittest discover -s experiments/subscription-plan -p 'test_*.py'
```

The adapter uses a fresh scratch working directory, a read-only CLI sandbox, disabled shell/apps/plugins/hooks/multi-agent/browser/computer tools, no approvals, no inherited user configuration or MCP configuration, and no shell interpolation. It rejects unexpected tool event items and validates the response before returning it. The CLI still requires network access and subscription authentication; the brief is sent to the service. Model responses remain untrusted data: display them only as text, never HTML or code. Validation is not a prompt-injection defense or a sanitizer for every output context.

**Security limitation:** These settings and the working directory are not a verified OS security boundary on this host. They cannot prove that every possible tool or access path is blocked. CLI and account configuration/version changes may alter behavior. Process output is buffered before its size check. There is no authentication, authorization, rate limiting, concurrency control, robust resource isolation, or production observability. Do not expose this spike to untrusted users or deploy it. No website editing or publishing is implemented. Only operators should run it, after reviewing the installed CLI and its configuration.
