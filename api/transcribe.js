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

    // Transcriere Whisper stabil (merge 100%)
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm');
    formData.append('model', 'whisper-1');  // stabil, fără erori
    formData.append('language', 'ro');

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const err = await whisperResponse.text();
      throw new Error(`Whisper error: ${err}`);
    }

    const { text: fullText } = await whisperResponse.json();
    const trimmedText = (fullText || '').trim() || 'Fără text detectat';

    // Rezumat GPT cu promptul tău PRO
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
            content: `Ești un asistent stomatologic expert în România, cu rol STRICT de structurare a informațiilor dintr-o dictare clinică.
Analizează EXCLUSIV informațiile prezente explicit în transcriere.
NU adăuga, NU presupune și NU inventa dinți, diagnostice sau tratamente.
Corectează DOAR erori evidente de recunoaștere speech-to-text,
fără a modifica sensul clinic (ex: „care e” → „carie”, „dintele douăzeci și șase” → „26”).
Dacă există ambiguități, marchează-le clar.
 REGULI OBLIGATORII:
- Listează DOAR dinții menționați explicit în dictare (sistem FDI: 11–48).
- NU muta problemele între dinți sau cadrane.
- NU introduce dinți suplimentari.
- NU formula diagnostice (ex. pulpită, D1/D2/D3) decât dacă sunt EXPLICIT menționate.
- Dacă o informație este incertă sau incompletă, notează: „Necesită confirmare clinică”.
- Dacă o categorie nu este prezentă în dictare, scrie exact: „Nu s-au identificat din dictare.”
STRUCTURĂ OBLIGATORIE:
1. Simptome generale:
- Listează doar simptomele menționate explicit.
2. Dinți menționați (FDI):
- Pentru fiecare dinte menționat explicit:
  - Dinte XX: descriere exactă a observației clinice, fără interpretări.
3. Observații din consultație:
- Doar constatări clinice descrise (ex. carie profundă, sensibilitate la percuție).
4. Diagnostic:
- DOAR diagnostice exprimate explicit în dictare.
- Dacă nu există: „Nu s-au identificat din dictare.”
5. Propuneri / Tratament recomandat:
- Doar tratamente menționate explicitly.
6. Urmărire / Recomandări suplimentare:
- Doar dacă sunt menționate explicit.
La final, NU adăuga concluzii sau interpretări suplimentare.`
          },
          { role: 'user', content: trimmedText },
        ],
      }),
    });

    if (!gptResponse.ok) {
      const err = await gptResponse.text();
      throw new Error(`GPT error: ${err}`);
    }

    const gptData = await gptResponse.json();
    const summary = gptData.choices[0].message.content.trim();

    res.status(200).json({ fullText: trimmedText, summary });
  } catch (error) {
    console.error('Eroare backend:', error);
    res.status(500).json({ error: 'Eroare procesare', details: error.message });
  }
}
