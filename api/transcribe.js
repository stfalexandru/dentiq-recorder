export const config = { &nbsp;&nbsp;api: { &nbsp;&nbsp;&nbsp;&nbsp;bodyParser: false, &nbsp;&nbsp;&nbsp;&nbsp;sizeLimit: '10mb', &nbsp;&nbsp;}, }; const OPENAI_API_KEY = process.env.OPENAI_API_KEY; export default async function handler(req, res) { &nbsp;&nbsp;if (req.method !== 'POST') { &nbsp;&nbsp;&nbsp;&nbsp;return res.status(405).send('Method not allowed'); &nbsp;&nbsp;} &nbsp;&nbsp;if (!OPENAI_API_KEY) { &nbsp;&nbsp;&nbsp;&nbsp;return res.status(500).json({ error: 'Cheie API lipsă' }); &nbsp;&nbsp;} &nbsp;&nbsp;try { &nbsp;&nbsp;&nbsp;&nbsp;const buffers = []; &nbsp;&nbsp;&nbsp;&nbsp;for await (const chunk of req) { &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;buffers.push(chunk); &nbsp;&nbsp;&nbsp;&nbsp;} &nbsp;&nbsp;&nbsp;&nbsp;const audioBuffer = Buffer.concat(buffers); &nbsp;&nbsp;&nbsp;&nbsp;if (audioBuffer.length === 0) { &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;throw new Error('Audio gol'); &nbsp;&nbsp;&nbsp;&nbsp;} &nbsp;&nbsp;&nbsp;&nbsp;// Transcriere Whisper &nbsp;&nbsp;&nbsp;&nbsp;const formData = new FormData(); &nbsp;&nbsp;&nbsp;&nbsp;formData.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm'); &nbsp;&nbsp;&nbsp;&nbsp;formData.append('model', 'whisper-1'); &nbsp;&nbsp;&nbsp;&nbsp;formData.append('language', 'ro'); &nbsp;&nbsp;&nbsp;&nbsp;const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', { &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;method: 'POST', &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;headers: { 'Authorization': Bearer ${OPENAI_API_KEY} }, &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;body: formData, &nbsp;&nbsp;&nbsp;&nbsp;}); &nbsp;&nbsp;&nbsp;&nbsp;if (!whisperResponse.ok) { &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;const err = await whisperResponse.text(); &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;throw new Error(Whisper error: ${err}); &nbsp;&nbsp;&nbsp;&nbsp;} &nbsp;&nbsp;&nbsp;&nbsp;const { text: fullText } = await whisperResponse.json(); &nbsp;&nbsp;&nbsp;&nbsp;const trimmedText = (fullText || '').trim() || 'Fără text detectat'; &nbsp;&nbsp;&nbsp;&nbsp;// Rezumat GPT &nbsp;&nbsp;&nbsp;&nbsp;const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', { &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;method: 'POST', &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;headers: { &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'Authorization': Bearer ${OPENAI_API_KEY}, &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'Content-Type': 'application/json', &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;}, &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;body: JSON.stringify({ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;model: 'gpt-4o-mini', &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;temperature: 0.3, &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;messages: [ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{ &nbsp;&nbsp;role: 'system', &nbsp;&nbsp;content: Ești un asistent stomatologic expert în România, cu rol STRICT de structurare a informațiilor dintr-o dictare clinică.
Analizează EXCLUSIV informațiile prezente explicit în transcriere.
NU adăuga, NU presupune și NU inventa dinți, diagnostice sau tratamente.
Corectează DOAR erori evidente de recunoaștere speech-to-text,
fără a modifica sensul clinic (ex: „care e” → „carie”, „dintele douăzeci și șase” → „26”).
Dacă există ambiguități, marchează-le clar.
 REGULI OBLIGATORII:

Listează DOAR dinții menționați explicit în dictare (sistem FDI: 11–48).
NU muta problemele între dinți sau cadrane.
NU introduce dinți suplimentari.
NU formula diagnostice (ex. pulpită, D1/D2/D3) decât dacă sunt EXPLICIT menționate.
Dacă o informație este incertă sau incompletă, notează: „Necesită confirmare clinică”.
Dacă o categorie nu este prezentă în dictare, scrie exact: „Nu s-au identificat din dictare.”
STRUCTURĂ OBLIGATORIE:


Simptome generale:


Listează doar simptomele menționate explicit.


Dinți menționați (FDI):


Pentru fiecare dinte menționat explicit:
  - Dinte XX: descriere exactă a observației clinice, fără interpretări.


Observații din consultație:


Doar constatări clinice descrise (ex. carie profundă, sensibilitate la percuție).


Diagnostic:


DOAR diagnostice exprimate explicit în dictare.
Dacă nu există: „Nu s-au identificat din dictare.”


Propuneri / Tratament recomandat:


Doar tratamente menționate explicit.


Urmărire / Recomandări suplimentare:


Doar dacă sunt menționate explicit.
La final, NU adăuga concluzii sau interpretări suplimentare. }, &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{ role: 'user', content: trimmedText }, &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;], &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;}), &nbsp;&nbsp;&nbsp;&nbsp;}); &nbsp;&nbsp;&nbsp;&nbsp;if (!gptResponse.ok) { &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;const err = await gptResponse.text(); &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;throw new Error(GPT error: ${err}`);
    }
    const gptData = await gptResponse.json();
    const summary = gptData.choices[0].message.content.trim();
    res.status(200).json({ fullText: trimmedText, summary });
  } catch (error) {
    console.error('Eroare backend:', error);
    res.status(500).json({ error: 'Eroare procesare', details: error.message });
  }
}
