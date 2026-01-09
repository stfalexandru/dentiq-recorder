const FormData = require('form-data');

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '10mb',
  },
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'Cheie API lipsă' });

  try {
    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const audioBuffer = Buffer.concat(buffers);

    if (audioBuffer.length === 0) throw new Error('Audio gol');

    const form = new FormData();
    form.append('file', audioBuffer, { filename: 'audio.webm', contentType: 'audio/webm' });
    form.append('model', 'whisper-1');
    form.append('language', 'ro');

    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        ...form.getHeaders()
      },
      body: form
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Whisper: ${err}`);
    }

    const { text } = await resp.json();
    const fullText = text?.trim() || 'Fără text';

    const gpt = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          { role: 'system', content: 'Structurăază strict informațiile stomatologice din text, fără invenții.' },
          { role: 'user', content: fullText }
        ]
      })
    });

    if (!gpt.ok) throw new Error('GPT eroare');

    const data = await gpt.json();
    const summary = data.choices?.[0]?.message?.content?.trim() || 'Eroare rezumat';

    res.status(200).json({ fullText, summary });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Eroare', details: err.message });
  }
};
