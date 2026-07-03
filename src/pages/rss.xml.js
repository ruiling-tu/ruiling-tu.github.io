const postModules = import.meta.glob("./writings/*.md", { eager: true });

export async function GET({ site }) {
  const posts = Object.values(postModules)
    .filter((post) => !post.frontmatter.draft)
    .sort(
      (a, b) =>
        new Date(b.frontmatter.pubDate).valueOf() -
        new Date(a.frontmatter.pubDate).valueOf()
    );

  const origin = site?.toString() ?? "https://example.com/";
  const items = posts
    .map((post) => {
      const url = new URL(post.url, origin).toString();
      return `
        <item>
          <title><![CDATA[${post.frontmatter.title}]]></title>
          <description><![CDATA[${post.frontmatter.description ?? ""}]]></description>
          <link>${url}</link>
          <guid>${url}</guid>
          <pubDate>${new Date(post.frontmatter.pubDate).toUTCString()}</pubDate>
        </item>`;
    })
    .join("");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8" ?>
    <rss version="2.0">
      <channel>
        <title>Personal Blog</title>
        <description>Writings, fragments, pictures, and field notes.</description>
        <link>${origin}</link>
        ${items}
      </channel>
    </rss>`,
    {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8"
      }
    }
  );
}
