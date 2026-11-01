# Stack proof: Payload on Cloudflare Workers

Tested on 2026-11-01 with Payload 3.92.0 from the official `with-cloudflare-d1` template.

## Results

| Check | Result |
| --- | --- |
| Local run on Node 22.21 (admin signup, login, image upload, anonymous upload blocked) | Passed |
| Deploy to Workers | Passed, 16 MB upload, 3.7 MB compressed |
| Anonymous pages and API on Workers (84 requests) | No platform limit errors, median 48 to 83 ms |
| PBKDF2 at 100,000 rounds on Workers | Worked 5 of 5 times |
| PBKDF2 at 600,000 rounds on Workers | Failed 5 of 5 times: `iteration counts above 100000 are not supported` |
| Signup and login on Workers | **Not tested end to end** |
| Image upload to real R2 | **Not tested**, R2 is not enabled on the test account |

## Blocker: password hashing

Payload 3.92 hashes passwords with 600,000 PBKDF2 rounds. Workers rejects anything above 100,000, on any plan, so the first admin account cannot be created.

Payload fixed this in [issue #18274](https://github.com/payloadcms/payload/issues/18274) by adding `auth.passwordHashIterations` ([PR #19070](https://github.com/payloadcms/payload/pull/19070), 3.x backport #19074). The latest release, 3.92.1, does not contain it yet.

When a release has it, set this in `payload.config.ts`:

```ts
auth: {
  passwordHashIterations: 100000,
},
```

100,000 rounds is below the 600,000 that Payload uses by default, so this is a trade-off to state in the README.

## Other findings

- **Free plan:** Cloudflare's Free plan allows 10 ms of CPU per request. The 100,000-round test passed, but a full login does more work and one [third-party write-up](https://nilaykabariya.blog/deploy/worker-exceeded-cpu-time-limit-error-1102) measured about 23 ms for the hash alone. Treat Workers Paid ($5/month minimum) as the expected cost until login is tested on Free. The test account's plan was assumed to be Free and was not confirmed.
- **Node version:** Payload asks for Node `^22.23.4` or `>=24.22.1`. It ran on 22.21 with a warning.
- **Unreliable build:** one Cloudflare build failed while collecting page data, then the same build passed twice. It opens several remote connections at once, so the deploy step needs a retry.
- **Windows:** the template's scripts assume pnpm and Unix shell syntax, so they need rewriting for ordinary Windows users.
- **First admin:** an empty deployed site shows `/admin/create-first-user` to anyone. The deploy step must create the admin straight away or block that page until it does.
