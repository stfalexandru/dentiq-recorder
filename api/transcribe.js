const FormData = require('form-data');

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '10mb',
  },
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodă nepermisă' });
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

    const form = new FormData();
    form.append('file', audioBuffer, {
      filename: 'audio.webm',
      contentType: 'audio/webm'
    });
    form.append('model', 'whisper-1');
    form.append('language', 'ro');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        ...form.getHeaders()
      },
      body: form
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper error: ${errorText}`);
    }

    const { text } = await response.json();
    const fullText = text?.trim() || 'Fără text detectat';

    // GPT - prompt simplu ca să nu mai avem probleme
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
            content: 'Ești un asistent stomatologic. Structurează informațiile din textul dat strict, fără să adaugi nimic ce nu e explicit menționat.'
          },
          {
            role: 'user',
            content: fullText
          }
        ]
      })
    });

    if (!gptResponse.ok) {
      throw new Error('Eroare la GPT');
    }

    const gptData = await gptResponse.json();
    const summary = gptData.choices?.[0]?.message?.content?.trim() || 'Nu s-a putut genera rezumatul';

    res.status(200).json({ fullText, summary });
  } catch (error) {
    console.error('EROARE:', error.message);
    res.status(500).json({
      error: 'Eroare procesare',
      details: error.message
    });
  }
};
