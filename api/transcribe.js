// Adaugă astea la începutul fișierului (pentru timeout mai mare pe Vercel)
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

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
    // Colectăm buffer-ul audio din request
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const audioBuffer = Buffer.concat(buffers);

    if (audioBuffer.length === 0) {
      throw new Error('Audio gol');
    }

    // ── Transcriere cu gpt-4o-transcribe ───────────────────────────────
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: 'audio.webm',
      contentType: 'audio/webm',
    });
    formData.append('model', 'gpt-4o-transcribe');
    formData.append('language', 'ro');

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        ...formData.getHeaders(),  // CRUCIAL: generează Content-Type + boundary corect!
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errText = await whisperResponse.text();
      throw new Error(`Transcriere error: ${whisperResponse.status} - ${errText}`);
    }

    const { text: fullText } = await whisperResponse.json();
    const trimmedText = (fullText || '').trim() || 'Fără text detectat';

    // ── Structurare cu gpt-4.1-mini ─────────────────────────────────────
    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: `Ești un asistent stomatologic expert în România, cu rol STRICT de structurare a informațiilor dintr-o dictare clinică.

Analizează EXCLUSIV informațiile prezente explicit în transcriere.
NU adăuga, NU presupune și NU inventa dinți, diagnostice sau tratamente.
Corectează DOAR erori evidente și sigure de recunoaștere speech-to-text (ex: „dintele douăzeci și șase” → „26”, „carie” în loc de „care e”).
Dacă există orice ambiguitate → marcheaz-o clar cu „Ambiguitate: ... – necesită confirmare”.

REGULI ABSOLUTE:
- Listează DOAR dinții menționați explicit (FDI 11–48)
- NU muta probleme între dinți
- NU introduce dinți care nu apar în dictare
- Diagnostice și tratamente → DOAR dacă sunt spuse cuvânt cu cuvânt
- Dacă ceva e incert/incomplet → „Necesită confirmare clinică”
- Dacă o secțiune nu apare deloc → „Nu s-au identificat din dictare.”

STRUCTURĂ OBLIGATORIE (urmeaz-o 1:1):
1. Simptome generale: ...
2. Dinți menționați (FDI): ...
   - Dinte XX: ...
3. Observații din consultație: ...
4. Diagnostic: ...
5. Propuneri / Tratament recomandat: ...
6. Urmărire / Recomandări suplimentare: ...

La final NU adăuga absolut nimic altceva.`,
          },
          { role: 'user', content: trimmedText },
        ],
      }),
    });

    if (!gptResponse.ok) {
      const errText = await gptResponse.text();
      throw new Error(`GPT error: ${gptResponse.status} - ${errText}`);
    }

    const gptData = await gptResponse.json();

    // Safe access la conținut
    const summary =
      gptData?.choices?.[0]?.message?.content?.trim() ||
      'Nu s-a putut genera structura. Verifică transcrierea brută.';

    res.status(200).json({
      fullText: trimmedText,
      summary,
    });
  } catch (error) {
    console.error('Eroare completă:', error);
    res.status(500).json({
      error: 'Eroare procesare',
      details: error.message,
    });
  }
}