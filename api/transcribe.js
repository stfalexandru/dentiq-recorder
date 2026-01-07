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

    // Transcriere Whisper
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'ro');

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const err = await whisperResponse.text();
      throw new Error(`Whisper error: ${err}`);
    }

    const { text: fullText } = await whisperResponse.json();
    const trimmedText = (fullText || '').trim() || 'Fără text detectat';

    // Rezumat GPT
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
  content: `Ești un asistent stomatologic expert în România. Analizează transcrierea consultației și extrage informațiile în format structurat. Corectează erori de recunoaștere speech-to-text comune (ex. "care e" poate fi "carie", "dintele" sau numere similare în context medical).

Structură obligatorie:
1. Simptome generale: (listează simptomele principale menționate, ex. durere, sensibilitate).
2. Dinti menționați (sistem adulți: cadrane 1-4, dinți 1-8 per cadran - ex. 11, 12...18; 21...28; 31...38; 41...48):
   - Pentru fiecare dinte menționat: Descriere problemă (ex. Dinte 25: Carie pe partea vestibulară).
   - Dacă un dinte nu e menționat: Nu lista, doar cei identificați.
3. Observații din consultație: (detalii clinice, ex. carie profundă, pulpă afectată).
4. Diagnostic: (ex. pulpită, carie D3).
5. Propuneri / Tratament recomandat: (ex. plombă, tratament de canal).
6. Urmărire / Recomandări suplimentare: (ex. control în 7 zile, igienă).

Dacă o categorie lipsește complet, scrie: "Nu s-au identificat din dictare."`
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
