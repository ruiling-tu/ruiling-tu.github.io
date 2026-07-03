# Personal Blog

A small, writing-first Astro site with Markdown posts and image support.

## Run locally

```bash
npm install
npm run dev
```

## Add a post

Create a new Markdown file in `src/pages/writings/`:

```md
---
layout: ../../layouts/PostLayout.astro
title: "Post title"
description: "Short summary for the archive page."
pubDate: 2026-07-03
heroImage: "/images/your-image.png"
heroAlt: "Description of the image"
---

Your writing goes here.

![Image caption](/images/your-image.png)
```

Place images in `public/images/`.

## Publish online

This project is ready for GitHub Pages. If it is published to a repository named
`ruiling-tu.github.io`, the public site will be available at:

```text
https://ruiling-tu.github.io/
```

The included GitHub Actions workflow builds the site and deploys `dist`.
