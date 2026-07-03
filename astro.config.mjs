import { defineConfig } from "astro/config";

const githubRepository = process.env.GITHUB_REPOSITORY;
const [owner, repo] = githubRepository?.split("/") ?? [];
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true" && owner && repo;
const isUserSite = isGitHubPagesBuild && repo === `${owner}.github.io`;

export default defineConfig({
  site: process.env.SITE ?? (isGitHubPagesBuild ? `https://${owner}.github.io` : "https://example.com"),
  base: process.env.BASE ?? (isGitHubPagesBuild && !isUserSite ? `/${repo}` : undefined)
});
