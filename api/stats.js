import { Octokit } from "https://cdn.skypack.dev/octokit";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("No GitHub token");
    return res.status(500).json({ error: 'No token' });
  }

  const octokit = new Octokit({ auth: token });

  const owner = "stfalexandru";
  const repo = "dentiq-recorder";
  const path = "stats.json";

  try {
    let stats = [];
    try {
      const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner, repo, path
      });
      const content = Buffer.from(data.content, 'base64').toString();
      stats = JSON.parse(content);
      console.log("Loaded stats:", stats);
    } catch (e) {
      console.log("No stats.json yet – creating new");
      stats = [];
    }

    const newEntry = req.body;
    newEntry.timestamp = new Date().toISOString();
    stats.push(newEntry);

    const content = Buffer.from(JSON.stringify(stats, null, 2)).toString('base64');

    const sha = stats.length > 0 ? (await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner, repo, path
    })).data.sha : undefined;

    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner, repo, path,
      message: 'Update stats',
      content,
      sha
    });

    console.log("Stats saved successfully");

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Eroare salvare stats:", err.message);
    res.status(500).json({ error: 'Eroare salvare stats' });
  }
}
