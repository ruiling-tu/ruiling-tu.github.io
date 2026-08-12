const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });

const corsHeaders = (request, env) => {
  const origin = request.headers.get("Origin") ?? "";
  const allowedOrigin = env.ALLOWED_ORIGIN ?? "";
  const allowOrigin = !allowedOrigin || allowedOrigin === origin ? origin || allowedOrigin || "*" : allowedOrigin;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400"
  };
};

const toBase64Url = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const fromBase64Url = (value) => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const utf8ToBase64 = (value) => {
  const bytes = textEncoder.encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
};

const base64ToUtf8 = (value) => {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return textDecoder.decode(bytes);
};

const importHmacKey = (secret) =>
  crypto.subtle.importKey("raw", textEncoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify"
  ]);

const signToken = async (payload, secret) => {
  const header = toBase64Url(textEncoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = toBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(`${header}.${body}`));

  return `${header}.${body}.${toBase64Url(signature)}`;
};

const verifyToken = async (token, secret) => {
  const [header, body, signature] = token.split(".");

  if (!header || !body || !signature) {
    throw new Error("Invalid token");
  }

  const key = await importHmacKey(secret);
  const verified = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signature),
    textEncoder.encode(`${header}.${body}`)
  );

  if (!verified) {
    throw new Error("Invalid token");
  }

  const payload = JSON.parse(textDecoder.decode(fromBase64Url(body)));

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Session expired");
  }

  return payload;
};

const requireAuth = async (request, env) => {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    throw new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  }

  return verifyToken(token, env.SESSION_SECRET);
};

const normalizeSingleLine = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const normalizeCommentBody = (value) => String(value ?? "").trim().replace(/\r\n?/g, "\n");

const validateComment = (payload) => {
  const postSlug = sanitizeSlug(payload.postSlug ?? "");
  const authorName = normalizeSingleLine(payload.authorName);
  const body = normalizeCommentBody(payload.body);

  if (!postSlug) {
    return { error: "Invalid article" };
  }

  if (authorName.length < 1 || authorName.length > 50) {
    return { error: "Name must be between 1 and 50 characters" };
  }

  if (body.length < 2 || body.length > 2000) {
    return { error: "Comment must be between 2 and 2,000 characters" };
  }

  if (normalizeSingleLine(payload.website)) {
    return { error: "Comment could not be submitted" };
  }

  return { postSlug, authorName, body };
};

const getVisitorHash = async (request, env) => {
  const address = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const userAgent = request.headers.get("User-Agent") ?? "unknown";
  const salt = env.COMMENT_HASH_SALT ?? env.SESSION_SECRET;
  const bytes = await crypto.subtle.digest("SHA-256", textEncoder.encode(`${salt}:${address}:${userAgent}`));

  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const listApprovedComments = async (env, postSlug) => {
  const result = await env.COMMENTS_DB.prepare(
    `SELECT id, author_name AS authorName, body, created_at AS createdAt
     FROM comments
     WHERE post_slug = ? AND status = 'approved'
     ORDER BY created_at ASC, id ASC`
  )
    .bind(postSlug)
    .all();

  return result.results ?? [];
};

const submitComment = async (request, env) => {
  const payload = await request.json();
  const comment = validateComment(payload);

  if (comment.error) {
    return json({ error: comment.error }, 400);
  }

  const post = await getPost(env, comment.postSlug);

  if (post.draft) {
    return json({ error: "Comments are not available for this article" }, 404);
  }

  const visitorHash = await getVisitorHash(request, env);
  const recent = await env.COMMENTS_DB.prepare(
    `SELECT COUNT(*) AS count
     FROM comments
     WHERE visitor_hash = ? AND created_at >= datetime('now', '-15 minutes')`
  )
    .bind(visitorHash)
    .first();

  if (Number(recent?.count ?? 0) >= 3) {
    return json({ error: "Too many comments submitted. Please try again later." }, 429);
  }

  await env.COMMENTS_DB.prepare(
    `INSERT INTO comments (post_slug, author_name, body, status, visitor_hash)
     VALUES (?, ?, ?, 'pending', ?)`
  )
    .bind(comment.postSlug, comment.authorName, comment.body, visitorHash)
    .run();

  return json({ ok: true, message: "Thanks. Your comment is awaiting approval." }, 201);
};

const listCommentsForAdmin = async (env) => {
  const result = await env.COMMENTS_DB.prepare(
    `SELECT id, post_slug AS postSlug, author_name AS authorName, body, status,
            created_at AS createdAt, updated_at AS updatedAt
     FROM comments
     ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
              created_at DESC, id DESC`
  ).all();

  return result.results ?? [];
};

const moderateComment = async (env, id, status) => {
  if (!Number.isInteger(id) || id < 1) {
    return json({ error: "Invalid comment" }, 400);
  }

  if (!['approved', 'hidden'].includes(status)) {
    return json({ error: "Status must be approved or hidden" }, 400);
  }

  const result = await env.COMMENTS_DB.prepare(
    `UPDATE comments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  )
    .bind(status, id)
    .run();

  if (!result.meta?.changes) {
    return json({ error: "Comment not found" }, 404);
  }

  return json({ ok: true });
};

const deleteComment = async (env, id) => {
  if (!Number.isInteger(id) || id < 1) {
    return json({ error: "Invalid comment" }, 400);
  }

  const result = await env.COMMENTS_DB.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();

  if (!result.meta?.changes) {
    return json({ error: "Comment not found" }, 404);
  }

  return json({ ok: true });
};

const githubHeaders = (env) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${env.GITHUB_TOKEN}`,
  "Content-Type": "application/json",
  "User-Agent": "wells-blog-admin",
  "X-GitHub-Api-Version": "2022-11-28"
});

const repoApi = (env, path) =>
  `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;

const githubFetch = async (env, path, init = {}) => {
  const response = await fetch(repoApi(env, path), {
    ...init,
    headers: {
      ...githubHeaders(env),
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message ?? `GitHub request failed with ${response.status}`);
  }

  return response.json();
};

const parseFrontmatter = (source) => {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!match) {
    return { frontmatter: {}, body: source };
  }

  const frontmatter = {};

  match[1].split("\n").forEach((line) => {
    const parts = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);

    if (!parts) {
      return;
    }

    const [, key, rawValue] = parts;
    const value = rawValue.trim();

    if (value === "true" || value === "false") {
      frontmatter[key] = value === "true";
    } else {
      frontmatter[key] = value.replace(/^["']|["']$/g, "");
    }
  });

  return { frontmatter, body: match[2] };
};

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const markdownBodyToHtml = (body) => {
  if (/<(p|h2|h3|img|blockquote|ul|ol|div|span)\b/i.test(body)) {
    return body.trim();
  }

  return body
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const image = block.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)$/);

      if (image) {
        return `<p><img src="${escapeHtml(image[2].replace(/^<|>$/g, ""))}" alt="${escapeHtml(image[1])}"></p>`;
      }

      return `<p>${escapeHtml(block).replaceAll("\n", "<br>")}</p>`;
    })
    .join("\n\n");
};

const serializePost = ({ title, description, pubDate, category, draft, contentHtml }) => {
  const quoted = (value) => `"${String(value ?? "").replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;

  return `---
layout: ../../layouts/PostLayout.astro
title: ${quoted(title)}
description: ${quoted(description)}
pubDate: ${pubDate}
category: ${quoted(category)}
draft: ${draft ? "true" : "false"}
---

${contentHtml}
`;
};

const sanitizeSlug = (value) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const sanitizeFilename = (value) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");

const getPost = async (env, slug) => {
  const file = await githubFetch(env, `src/pages/writings/${slug}.md`);
  const source = base64ToUtf8(file.content);
  const { frontmatter, body } = parseFrontmatter(source);

  return {
    slug,
    sha: file.sha,
    title: frontmatter.title ?? slug,
    description: frontmatter.description ?? "",
    pubDate: String(frontmatter.pubDate ?? ""),
    category: frontmatter.category ?? "Writing",
    draft: Boolean(frontmatter.draft),
    contentHtml: markdownBodyToHtml(body)
  };
};

const listPosts = async (env) => {
  const files = await githubFetch(env, "src/pages/writings");
  const posts = await Promise.all(
    files
      .filter((file) => file.type === "file" && file.name.endsWith(".md"))
      .map(async (file) => {
        const slug = file.name.replace(/\.md$/, "");
        const post = await getPost(env, slug);

        return {
          slug,
          title: post.title,
          description: post.description,
          pubDate: post.pubDate,
          draft: post.draft
        };
      })
  );

  return posts.sort((a, b) => new Date(b.pubDate).valueOf() - new Date(a.pubDate).valueOf());
};

const savePost = async (env, slug, payload) => {
  const path = `src/pages/writings/${slug}.md`;
  const content = serializePost(payload);
  const body = {
    branch: env.GITHUB_BRANCH ?? "main",
    message: `${payload.draft ? "Save draft" : "Publish article"}: ${payload.title}`,
    content: utf8ToBase64(content)
  };

  if (payload.sha) {
    body.sha = payload.sha;
  }

  const result = await githubFetch(env, path, {
    method: "PUT",
    body: JSON.stringify(body)
  });

  return {
    commitSha: result.commit?.sha ?? "",
    commitUrl: result.commit?.html_url ?? "",
    contentSha: result.content?.sha ?? ""
  };
};

const deletePost = async (env, slug, sha) => {
  if (!sha) {
    throw new Response(JSON.stringify({ error: "Article version is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }

  const post = await getPost(env, slug);

  if (post.sha !== sha) {
    throw new Response(
      JSON.stringify({ error: "This article changed since it was loaded. Reload it before deleting." }),
      {
        status: 409,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      }
    );
  }

  const result = await githubFetch(env, `src/pages/writings/${slug}.md`, {
    method: "DELETE",
    body: JSON.stringify({
      branch: env.GITHUB_BRANCH ?? "main",
      message: `Delete article: ${post.title}`,
      sha
    })
  });

  await env.COMMENTS_DB.prepare("DELETE FROM comments WHERE post_slug = ?")
    .bind(slug)
    .run()
    .catch(() => undefined);

  return {
    commitSha: result.commit?.sha ?? "",
    commitUrl: result.commit?.html_url ?? ""
  };
};

const handleLogin = async (request, env) => {
  const { username, password } = await request.json();

  if (username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD) {
    return json({ error: "Invalid username or password" }, 401);
  }

  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const token = await signToken({ sub: username, exp }, env.SESSION_SECRET);

  return json({ token });
};

const handleUpload = async (request, env) => {
  const { filename, dataUrl } = await request.json();
  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (!match) {
    return json({ error: "Upload must be an image data URL" }, 400);
  }

  const safeName = sanitizeFilename(filename || "image.jpg");
  const path = `public/images/uploads/${Date.now()}-${safeName}`;

  await githubFetch(env, path, {
    method: "PUT",
    body: JSON.stringify({
      branch: env.GITHUB_BRANCH ?? "main",
      message: `Upload image: ${safeName}`,
      content: match[2]
    })
  });

  return json({ src: path.replace(/^public/, "") });
};

const router = async (request, env) => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (path === "/api/login" && request.method === "POST") {
    return handleLogin(request, env);
  }

  if (path.startsWith("/api/comments/")) {
    const postSlug = sanitizeSlug(decodeURIComponent(path.replace("/api/comments/", "")));

    if (!postSlug) {
      return json({ error: "Invalid article" }, 400);
    }

    if (request.method === "GET") {
      return json({ comments: await listApprovedComments(env, postSlug) });
    }
  }

  if (path === "/api/comments" && request.method === "POST") {
    return submitComment(request, env);
  }

  await requireAuth(request, env);

  if (path === "/api/admin/comments" && request.method === "GET") {
    return json({ comments: await listCommentsForAdmin(env) });
  }

  if (path.startsWith("/api/admin/comments/")) {
    const id = Number.parseInt(path.replace("/api/admin/comments/", ""), 10);

    if (request.method === "PUT") {
      const payload = await request.json();
      return moderateComment(env, id, payload.status);
    }

    if (request.method === "DELETE") {
      return deleteComment(env, id);
    }
  }

  if (path === "/api/posts" && request.method === "GET") {
    return json({ posts: await listPosts(env) });
  }

  if (path.startsWith("/api/posts/")) {
    const slug = sanitizeSlug(decodeURIComponent(path.replace("/api/posts/", "")));

    if (!slug) {
      return json({ error: "Invalid slug" }, 400);
    }

    if (request.method === "GET") {
      return json({ post: await getPost(env, slug) });
    }

    if (request.method === "PUT") {
      const payload = await request.json();
      const result = await savePost(env, slug, {
        ...payload,
        slug,
        pubDate: payload.pubDate || new Date().toISOString().slice(0, 10)
      });

      return json({ ok: true, ...result });
    }

    if (request.method === "DELETE") {
      const payload = await request.json().catch(() => ({}));
      const result = await deletePost(env, slug, payload.sha);

      return json({ ok: true, ...result });
    }
  }

  if (path === "/api/upload" && request.method === "POST") {
    return handleUpload(request, env);
  }

  return json({ error: "Not found" }, 404);
};

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);

    try {
      const response = await router(request, env);
      Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      return response;
    } catch (error) {
      if (error instanceof Response) {
        Object.entries(headers).forEach(([key, value]) => error.headers.set(key, value));
        return error;
      }

      return json({ error: error.message || "Unexpected error" }, 500, headers);
    }
  }
};
