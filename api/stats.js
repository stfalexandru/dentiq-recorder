import { Octokit } from "https://cdn.skypack.dev/octokit";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'No token' });

  const octokit = new Octokit({ auth: token });

  const owner = "stfalexandru"; // numele tău GitHub
  const repo = "dentiq-recorder";
  const path = "stats.json";

  try {
    let stats = [];
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner, repo, path
      });
      const content = Buffer.from(data.content, 'base64').toString();
      stats = JSON.parse(content);
    } catch (e) {
      stats = [];
    }

    const newEntry = req.body;
    newEntry.timestamp = new Date().toISOString();
    stats.push(newEntry);

    const content = Buffer.from(JSON.stringify(stats, null, 2)).toString('base64');

    const sha = stats.length > 0 ? (await octokit.rest.repos.getContent({ owner, repo, path })).data.sha : undefined;

    await octokit.rest.repos.createOrUpdateFileContents({
      owner, repo, path,
      message: 'Update stats',
      content,
      sha
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Eroare salvare stats' });
  }
}
