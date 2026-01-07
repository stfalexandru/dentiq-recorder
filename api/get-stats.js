import { readFile } from 'fs/promises';
import { join } from 'path';

const STATS_FILE = join(process.cwd(), 'data', 'stats.json');

export default async function handler(req, res) {
  try {
    const data = await readFile(STATS_FILE, 'utf-8');
    const stats = JSON.parse(data);
    res.status(200).json(stats);
  } catch (err) {
    res.status(200).json([]);
  }
}
