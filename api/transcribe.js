import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '10mb',
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  try {
    // Citește audio
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const audioBuffer = Buffer.concat(buffers);

    // Transcriere Whisper
    const { text: fullText } = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: new File([audioBuffer], 'audio.webm', { type: 'audio/webm' }),
      language: 'ro',
    });

    const trimmedText = (fullText || '').trim() || 'Fără text detectat';

    // Rezumat structurat cu GPT-4o-mini
    const { text: summary } = await generateText({
      model: openai('gpt-4o-mini'),
      temperature: 0.3,
      system: `Ești asistent stomatologic. Extrage din transcriere doar următoarele categorii în format exact:

Simptome:
Observații din consultație:
Diagnostic:
Propuneri / Tratament recomandat:
Urmărire / Recomandări suplimentare:

Dacă o categorie lipsește, scrie: "Nu s-au identificat din dictare."`,
      prompt: trimmedText,
    });

    // Returnează JSON
    res.status(200).json({
      fullText: trimmedText,
      summary: summary.trim(),
    });
  } catch (error) {
    console.error('Eroare backend:', error);
    res.status(500).json({
      error: 'Eroare procesare AI',
      details: error.message || 'Necunoscută',
    });
  }
};
