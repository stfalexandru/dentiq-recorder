import { Octokit } from "https://cdn.skypack.dev/octokit";

export default async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json([]);

  const octokit = new Octokit({ auth: token });

  const owner = "stfalexandru";
  const repo = "dentiq-recorder";
  const path = "stats.json";

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner, repo, path
    });
    const content = Buffer.from(data.content, 'base64').toString();
    const stats = JSON.parse(content);
    res.status(200).json(stats);
  } catch (err) {
    res.status(200).json([]);
  }
}
