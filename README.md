# Wells Tu

A small, writing-first Astro site published at:

```text
https://ruiling-tu.github.io/
```

## Local Editing Workflow

```bash
npm install
npm run dev
```

Open the local preview at `http://localhost:4321/`.

## Add A New Article

Run:

```bash
npm run new-post -- "My Article Title"
```

This creates a draft Markdown file in:

```text
src/pages/writings/
```

Edit that new `.md` file. When it is ready to appear on the website, change:

```md
draft: true
```

to:

```md
draft: false
```

or remove the `draft` line.

## Edit An Existing Article

Open the article file in:

```text
src/pages/writings/
```

For the current article, edit:

```text
src/pages/writings/zai-xia-ri-de-xun-huan-li.md
```

The top block controls the title, subtitle, date, category, and draft status.
Everything below the second `---` is the article body.

## Add Images

Put images in:

```text
public/images/
```

Then reference them in a post:

```md
![Image caption](/images/my-photo.jpg)
```

To use an image at the top of a post, set this in the post front matter:

```md
heroImage: "/images/my-photo.jpg"
heroAlt: "Description of the image"
```

## Edit Website Sections

- Site name, subtitle, and navigation: `src/layouts/SiteLayout.astro`
- Homepage intro text and latest-post count: `src/pages/index.astro`
- About page: `src/pages/about.astro`
- Archive page heading: `src/pages/archive.astro`
- Individual articles: `src/pages/writings/*.md`
- Visual design: `src/styles/global.css`
- RSS feed text: `src/pages/rss.xml.js`

The archive page is mostly automatic. It lists all non-draft Markdown posts from
`src/pages/writings/`, sorted by `pubDate`.

## Publish Changes

After editing locally:

```bash
npm run build
git status
git add -A
git commit -m "Add new article"
git push
```

GitHub Pages will rebuild the public site automatically after the push. The
deployment normally takes about one minute.

## Edit Directly On GitHub

You can also edit files in the GitHub web interface:

1. Open `https://github.com/ruiling-tu/ruiling-tu.github.io`
2. Find the file to edit.
3. Click the pencil icon.
4. Commit the change to `main`.

GitHub Pages will republish automatically.
