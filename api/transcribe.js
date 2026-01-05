import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  api: {
    bodyParser: false, // Obligatoriu pentru fișiere audio mari
    sizeLimit: '10mb', // Limita audio
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Citește tot body-ul ca buffer
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const audioBuffer = Buffer.concat(buffers);

    if (audioBuffer.length === 0) {
      throw new Error('Audio gol');
    }

    // Transcriere cu Whisper
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
          content: `Ești asistent stomatologic. Extrage din transcriere doar următoarele categorii, în exact acest format:

Simptome:
Observații din consultație:
Diagnostic:
Propuneri / Tratament recomandat:
Urmărire / Recomandări suplimentare:

Dacă o categorie lipsește complet, scrie: "Nu s-au identificat din dictare."`
        },
        { role: 'user', content: fullText },
      ],
    });

    const summary = completion.choices[0].message.content.trim();

    // Generează PDF simplu cu text
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = 780;
    const draw = (text, size = 12, isBold = false) => {
      page.drawText(text, { x: 50, y, size, font: isBold ? bold : font, color: rgb(0, 0, 0) });
      y -= size + 6;
    };

    draw('Rezumat Consultație Stomatologică - Dentiq', 20, true);
    draw(`Data: ${new Date().toLocaleDateString('ro-RO')}`, 12);
    y -= 20;

    draw('Transcriere completă:', 14, true);
    fullText.match(/.{1,85}(\s|$)/g || [fullText]).forEach(line => draw(line.trim()));

    y -= 20;
    draw('Rezumat structurat:', 14, true);
    summary.split('\n').forEach(line => {
      const isCategory = line.includes(':');
      draw(line.trim(), 12, isCategory);
    });

    const pdfBytes = await pdfDoc.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=rezumat_${new Date().toISOString().slice(0,10)}.pdf`);
    res.status(200).send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error('Eroare în api/transcribe:', error);
    res.status(500).json({ 
      error: 'Eroare procesare AI', 
      details: error.message 
    });
  }
}
