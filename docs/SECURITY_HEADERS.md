# Security headers for the web app (karyaos.in)

The web app is static files served by the CloudPanel web server, so these headers are set there, not in the code.
Open CloudPanel > Sites > karyaos.in > Vhost, and add the block below inside the `server { ... }` section.

## Step 1: safe headers (turn on straight away)

```
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(self), microphone=(self), geolocation=(self), payment=()" always;
add_header Strict-Transport-Security "max-age=31536000" always;
```

These stop other sites from framing the app and stop browsers guessing file types. They cannot break normal use.

## Step 2: content security policy (report first, then enforce)

Start in report-only mode. The browser logs problems in the console but blocks nothing:

```
add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://api.karyaos.in; media-src 'self' blob: https://api.karyaos.in; font-src 'self' data:; connect-src 'self' https://api.karyaos.in wss://api.karyaos.in; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" always;
```

Use the app for a few days (sign in, tickets, photo upload, live updates, install as app). If the browser console shows no
"Content Security Policy" warnings, rename `Content-Security-Policy-Report-Only` to `Content-Security-Policy` to enforce it.

`'unsafe-inline'` for scripts stays until the boot fallback script in `client/index.html` is moved to a file or given a hash.

## API site (api.karyaos.in)

Helmet already sets the API headers in `server/src/app.ts`. Nothing to add there.
