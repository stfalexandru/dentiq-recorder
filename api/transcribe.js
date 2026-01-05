export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '10mb',
  },
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Cheie API lipsă pe server' });
  }

  try {
    // Citește audio-ul complet
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const audioBuffer = Buffer.concat(buffers);

    if (audioBuffer.length === 0) {
      throw new Error('Fișier audio gol');
    }

    // 1. Transcriere cu Whisper
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'ro');

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errText = await whisperResponse.text();
      throw new Error(`Whisper: ${whisperResponse.status} ${errText}`);
    }

    const { text: fullText } = await whisperResponse.json();
    const trimmedText = (fullText || '').trim() || 'Fără text detectat';

    // 2. Rezumat structurat cu GPT-4o-mini
    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `Ești asistent stomatologic profesionist. Extrage din transcriere doar următoarele categorii, în format exact:

Simptome:
Observații din consultație:
Diagnostic:
Propuneri / Tratament recomandat:
Urmărire / Recomandări suplimentare:

Dacă o categorie nu este menționată, scrie: "Nu s-au identificat din dictare."`
          },
          { role: 'user', content: trimmedText },
        ],
      }),
    });

    if (!gptResponse.ok) {
      const errText = await gptResponse.text();
      throw new Error(`GPT: ${gptResponse.status} ${errText}`);
    }

    const gptData = await gptResponse.json();
    const summary = gptData.choices[0].message.content.trim();

    // Succes – trimite rezultatul
    res.status(200).json({
      fullText: trimmedText,
      summary,
    });

  } catch (error) {
    console.error('Eroare completă backend:', error);
    res.status(500).json({
      error: 'Eroare procesare AI',
      details: error.message,
    });
  }
}
