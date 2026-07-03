import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const title = process.argv.slice(2).join(" ").trim();

if (!title) {
  console.error('Usage: npm run new-post -- "My article title"');
  process.exit(1);
}

const slug = title
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

if (!slug) {
  console.error("Could not create a valid filename from that title.");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const postsDir = join(process.cwd(), "src", "pages", "writings");
const postPath = join(postsDir, `${slug}.md`);

if (existsSync(postPath)) {
  console.error(`Post already exists: ${postPath}`);
  process.exit(1);
}

mkdirSync(postsDir, { recursive: true });

const content = `---
layout: ../../layouts/PostLayout.astro
title: "${title.replaceAll('"', '\\"')}"
description: "Write a one-sentence summary for the archive page."
pubDate: ${today}
category: "Writing"
heroImage: "/images/your-image.jpg"
heroAlt: "Describe the image for readers using screen readers"
draft: true
---

Start writing here.

When you are ready to publish this post, change \`draft: true\` to \`draft: false\`
or remove the \`draft\` line.
`;

writeFileSync(postPath, content);

console.log(`Created ${postPath}`);
