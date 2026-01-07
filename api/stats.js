import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';

const STATS_FILE = join(process.cwd(), 'data', 'stats.json');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    let stats = [];
    try {
      const data = await readFile(STATS_FILE, 'utf-8');
      stats = JSON.parse(data);
    } catch (e) {
      stats = [];
    }

    const newEntry = req.body;
    newEntry.timestamp = new Date().toISOString();
    stats.push(newEntry);

    await writeFile(STATS_FILE, JSON.stringify(stats, null, 2));

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Eroare salvare stats' });
  }
}

export const config = {
  api: {
    bodyParser: true,
  },
};
