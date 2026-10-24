# Revontech TV — Admin Panel

A separate web application for managing the Revontech TV platform.

Deployed at: **https://revontech-admin.web.app**

## Why a separate app?

Previously the admin panel lived inside the user app at `/admin/*` routes. This had two problems:

1. **Security:** The user-facing app's auth context contained admin login logic, increasing the attack surface.
2. **Deployment:** Admin and user were forced to share the same host.

This admin app is now completely isolated:

- Its own Vite project, build, and dependencies
- Its own Firebase auth context (admin-only)
- Deployed independently on `revontech-admin.web.app`
- Search engines are blocked via `noindex,nofollow` and `X-Robots-Tag` header

## Granting admin access

Just add the user in **Firebase Console → Authentication → Users → Add user** with their email and a password. They can immediately log in at https://revontech-admin.web.app/login.

Rules:

- The email **must NOT** be a phone-auth address (those end with `@chtv.app` and belong to regular users of the user app). Phone-auth accounts can never become admin.
- The first time an admin signs in, the system auto-creates their `admins/{uid}` document in Firestore so Firestore rules grant them write access on sensitive collections.

### Optional: lock admin access to specific emails

To prevent anyone with a non-`@chtv.app` email from logging in as admin, create a Firestore document at `settings/admin_config` with this shape:

```json
{
  "admin_emails": [
    "you@yourdomain.com",
    "trusted-coworker@yourdomain.com"
  ]
}
```

When this allowlist exists and is non-empty, **only emails on the list** can log in to admin. If the document is missing or `admin_emails` is empty, the panel runs in **bootstrap mode** — any non-`@chtv.app` Firebase Auth user can log in. Use bootstrap mode only briefly to create your first admin, then populate the allowlist.

## ⚠️ Security warning — open Firebase Email/Password signup

Firebase Email/Password signup is **open by default** on the public API. Anyone who knows your project's public API key can call the Firebase Auth REST API to create a new account.

This means: if you don't populate `settings/admin_config.admin_emails`, an attacker can create their own `attacker@somewhere.com` account directly through the Firebase REST API and use it to log in as admin (the same way you got compromised before).

**You should do at least one of:**

1. Populate `settings/admin_config.admin_emails` with your trusted admin emails. (Easiest. Free.)
2. Upgrade Firebase Authentication to **Identity Platform** and add a `beforeCreate` blocking function that rejects signups from emails not in your allowlist. (Best. Costs a few dollars/month.)

## Getting started locally

```bash
cd admin
cp .env.example .env
# fill in your Firebase keys in .env (same values as the user app)
npm install
npm run dev
```

The admin panel runs on **port 8081** by default. The user app runs on **8080**.

## Build & deploy

```bash
npm run build
cd ..
firebase deploy --only hosting:admin
```

## Routes

| Path             | Purpose            |
|------------------|--------------------|
| `/login`         | Admin login        |
| `/`              | Dashboard          |
| `/channels`      | Manage channels    |
| `/slider`        | Manage slider      |
| `/plans`         | Manage plans       |
| `/payments`      | View payments      |
| `/token`         | CDN token          |
| `/users`         | User management    |
| `/referrals`     | Referral tracking  |
| `/notifications` | Send notifications |
| `/settings`      | Site settings      |
| `/ads`           | Manage ads         |
