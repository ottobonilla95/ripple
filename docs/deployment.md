# Droplet deployment

Ripple is deployed as one application on the existing Ubuntu Droplet. Caddy terminates HTTPS. Express serves a normal sign-in form and requires a signed session cookie for app pages and API routes. It listens only on `127.0.0.1:4317`. This deployment does not use Vercel or external inference APIs.

The temporary public hostname uses the form `ripple.<server-ip>.sslip.io`. It uses a third-party DNS service that resolves the embedded IP; replace it with an owned domain when available. The exact address is in the private access details. Caddy obtained a publicly trusted certificate and manages renewal. The app is accessible from desktop and phone at the same address. Microphone use requires allowing permission; actual iPhone recording and home-screen behavior still need device testing.

## Layout

| Location | Purpose |
| --- | --- |
| `/opt/ripple/app` | Checkout, production dependencies, and built frontend |
| `/opt/ripple/runtime` | Dedicated Node 24 runtime, separate from other apps |
| `/var/lib/ripple/commonplace.sqlite` | Insights, review state, search chunks, and vectors |
| `/var/lib/ripple/audio` | Saved recordings |
| `/var/lib/ripple/models` | Cached MiniLM embeddings and Whisper tiny English models |
| `/etc/systemd/system/ripple.service` | App service, running as the `ripple` system user |
| `/etc/caddy/Caddyfile` | TLS and reverse proxy |
| `/etc/ripple/auth.json` | App username, salted password hash, and session-signing secret |

Access credentials are stored separately in a root-only file on the server and in an ignored local file under `data/`. They are never committed. The app password is distinct from the SSH password. `AUTH_CONFIG_FILE` points to a protected JSON file containing `username`, a random 16-byte hex `salt`, a 32-byte hex `passwordHash` derived with Node's default scrypt parameters, and a random 32-byte hex `sessionSecret`. The file is readable only by root and the app group. Missing or invalid configured authentication fails startup rather than exposing the app.

The initial deployment used HTTP Basic Authentication, whose browser prompt failed in the in-app browser. This was replaced by `/login` using the same credentials, a seven-day signed `Secure`, `HttpOnly`, `SameSite=Lax`, host-only cookie, and a sign-out action in Settings. Failed login attempts are limited, login/logout reject mismatched origins, and unauthenticated API requests return JSON 401 without a browser authentication challenge. Local loopback development stays unauthenticated when no auth configuration is supplied. Signing-secret rotation invalidates existing cookies; sign-out clears the current browser's cookie.

The existing 1 CPU / 2 GB RAM Droplet also hosts other personal services. Their runtimes and configurations were left in place.

## Resources and validation

The two model caches occupy approximately 64 MB. Runtime memory is much larger: the app reached roughly 1 GB during transcription in the initial test. A 1 GB swap file was added at `/ripple.swap` and registered in `/etc/fstab` as a reserve. The app is limited to 80% of one CPU, 1300 MiB memory, and 768 MiB swap, with reduced CPU priority. These are shared-server POC settings, not a concurrency guarantee. Keep model-loading memory headroom: an initially lower `MemoryHigh` caused severe reclaim stalls and was removed.

Validated on the Droplet on 21 October 2026:

- All three existing real-model semantic checks passed.
- Saving, indexing, and finding an insight through the running API passed. A warm semantic query took about 0.03 seconds; the first query after restarting took about 0.56 seconds.
- Actual Whisper transcription of a four-second fixture passed: about 4.1 seconds warm and 5.4 seconds on first use after a service restart, with the final resource configuration. Longer recordings and concurrent workloads can take more time.
- A saved and indexed insight survived an app restart. Temporary test insights and audio were removed, leaving the collection empty.
- External HTTPS checks returned 401 for unauthenticated API access and 200 for authenticated app, status, and manifest requests. Authentication regression tests cover form login, cookie attributes, malformed/expired cookies, cross-origin attempts, sign-out, and login throttling.
- After replacing HTTP Basic Authentication, the actual in-app browser successfully signed in through the HTML form, opened the collection, signed out, signed back in, and retained the session across refresh. The authenticated Save screen was left open. All seven automated tests and the production build passed.
- Existing application services and scheduled workers remained active.

The small embedding model can miss paraphrases below the current similarity cutoff; the deployed search behavior is unchanged. No collection from the local development machine was uploaded.

## Operations

```sh
sudo systemctl status ripple caddy
sudo journalctl -u ripple -n 50 --no-pager
sudo systemctl restart ripple
```

For updates, use the dedicated runtime, install Linux dependencies on the server, and supply a frontend built from the same source revision. The first deployment built the frontend locally and transferred only `dist/`; models were copied from the existing cache, without personal data. Update the checkout as the `ripple` user rather than changing global Git ownership settings.

Templates are in `deploy/`. Set the exact hostname in both the service's `ALLOWED_HOSTS` and Caddyfile. Configure `/etc/ripple/auth.json` before enabling the service, and keep its credentials and session secret out of Git. Validate Caddy configuration before reloading it. Do not add an HTTP Basic Authentication challenge in front of the form login.

Stop `ripple` before making a complete copy of `/var/lib/ripple` for backup, then start it again. A persistent disk is not a backup; no off-server backup was configured by this deployment.
