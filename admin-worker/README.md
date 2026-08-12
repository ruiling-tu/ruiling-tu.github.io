# Blog Admin Worker

This Worker is the private publishing API for `/admin/`.

Do not commit passwords or GitHub tokens. Store them as Worker secrets.

## Deploy

```bash
cd admin-worker
npx wrangler login
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

Use the requested username as `ADMIN_USERNAME` in `wrangler.toml`.

Set `ADMIN_PASSWORD` to the private password.
Set `SESSION_SECRET` to a long random string.
Set `GITHUB_TOKEN` to a fine-scoped GitHub token that can write to this repository.

After deployment, copy the Worker URL and set it for the static site build:

```bash
gh variable set PUBLIC_ADMIN_API_URL --body "https://wells-blog-admin.<your-subdomain>.workers.dev"
```

Then rerun the GitHub Pages workflow or push a new commit.

## Comments database

Visitor comments use the Cloudflare D1 free plan and are hidden until approved
in the admin page. Create and initialize the database once, then deploy:

```bash
npx wrangler d1 create wells-blog-comments
npx wrangler d1 migrations apply wells-blog-comments --remote
npx wrangler deploy
```

Keep the generated database ID in `wrangler.toml`. Public submissions are
plain text, limited to three per visitor every fifteen minutes, and include a
hidden bot-trap field. No paid comment or anti-spam service is required.
