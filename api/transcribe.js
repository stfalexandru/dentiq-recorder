import { OpenAI } from 'openai';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Primește audio din frontend
    const audioBuffer = Buffer.from(await req.body.arrayBuffer());
    
    // Transcriere cu Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: new File([audioBuffer], 'audio.webm', { type: 'audio/webm' }),
      model: 'whisper-1',
      language: 'ro',  // Pentru română
    });
    const text = transcription.text;

    // Rezumat structurat cu GPT
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Ești un asistent stomatologic. Analizează transcrierea consultației și extrage informații pe categorii: Simptome, Observații din consultație, Propuneri/Tratament, Alte note. Dacă o categorie nu este menționată, scrie "Nu s-au identificat din dictare". Folosește format markdown clar.' },
        { role: 'user', content: `Transcriere: ${text}` },
      ],
    });
    const summary = completion.choices[0].message.content;

    // Generează PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);  // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Header
    page.drawText('Rezumat Consultație Dentiq', { x: 50, y: 790, size: 18, font: boldFont, color: rgb(0.2, 0.5, 0.8) });
    const today = new Date().toISOString().slice(0, 10);
    page.drawText(`Data: ${today}`, { x: 50, y: 770, size: 12, font });

    // Transcriere completă
    page.drawText('Transcriere completă:', { x: 50, y: 740, size: 14, font: boldFont });
    const textLines = text.split('\n').filter(line => line.trim());
    let y = 720;
    for (const line of textLines) {
      page.drawText(line, { x: 50, y, size: 10, font });
      y -= 15;
      if (y < 50) {  // Adaugă pagină nouă dacă e prea lung
        page = pdfDoc.addPage([595, 842]);
        y = 790;
      }
    }

    // Rezumat structurat
    page.drawText('Rezumat pe categorii:', { x: 50, y: y - 20, size: 14, font: boldFont });
    y -= 20;
    const summaryLines = summary.split('\n').filter(line => line.trim());
    for (const line of summaryLines) {
      page.drawText(line, { x: 50, y, size: 10, font });
      y -= 15;
      if (y < 50) {
        page = pdfDoc.addPage([595, 842]);
        y = 790;
      }
    }

    // Salvează PDF și trimite înapoi
    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=rezumat_consultatie.pdf');
    return res.status(200).send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Eroare la procesare AI' });
  }
}
