import FormData from 'form-data';

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '10mb',
  },
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Cheie API lipsă' });
  }

  try {
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const audioBuffer = Buffer.concat(buffers);

    if (audioBuffer.length === 0) {
      throw new Error('Audio gol');
    }

    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: 'audio.webm',
      contentType: 'audio/webm'
    });
    formData.append('model', 'whisper-1'); // stabil, testăm întâi asta
    formData.append('language', 'ro');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        ...formData.getHeaders() // asta rezolvă boundary-ul și parse error-ul
      },
      body: formData
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Whisper error: ${err}`);
    }

    const { text } = await response.json();
    const fullText = (text || '').trim() || 'Fără text detectat';

    // GPT rezumat (simplu, poți pune promptul tău vechi)
    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: 'Structurăază strict informațiile din dictare stomatologică fără să inventezi nimic.'
          },
          { role: 'user', content: fullText }
        ]
      })
    });

    if (!gptResponse.ok) {
      throw new Error('GPT error');
    }

    const gptData = await gptResponse.json();
    const summary = gptData.choices?.[0]?.message?.content?.trim() || 'Nu s-a putut genera rezumatul.';

    res.status(200).json({ fullText, summary });
  } catch (error) {
    console.error('Eroare:', error.message);
    res.status(500).json({ error: 'Eroare procesare', details: error.message });
  }
}
