import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '10mb',
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Citește audio
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const audioBuffer = Buffer.concat(buffers);

    if (audioBuffer.length === 0) {
      throw new Error('Audio gol');
    }

    // Transcriere Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: new File([audioBuffer], 'recording.webm', { type: 'audio/webm' }),
      model: 'whisper-1',
      language: 'ro',
    });

    const fullText = transcription.text.trim() || 'Fără text detectat';

    // Rezumat structurat
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: `Ești asistent stomatologic. Extrage din transcriere doar următoarele categorii în acest format exact:

Simptome:
Observații din consultație:
Diagnostic:
Propuneri / Tratament recomandat:
Urmărire / Recomandări suplimentare:

Dacă o categorie lipsește, scrie: "Nu s-au identificat din dictare."`
        },
        { role: 'user', content: fullText },
      ],
    });

    const summary = completion.choices[0].message.content.trim();

    // Returnează JSON cu textul
    res.status(200).json({
      fullText,
      summary,
    });

  } catch (error) {
    console.error('Eroare backend:', error);
    res.status(500).json({
      error: 'Eroare procesare AI',
      details: error.message,
    });
  }
}
