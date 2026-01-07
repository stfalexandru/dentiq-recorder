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
            content: `Ești asistent stomatologic. Extrage din transcriere doar următoarele categorii în format exact:

Simptome:
Observații din consultație:
Diagnostic:
Propuneri / Tratament recomandat:
Urmărire / Recomandări suplimentare:

Dacă o categorie lipsește, scrie: "Nu s-au identificat din dictare."`
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

    // Generează PDF cu pdf-lib
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Logo centrat sus
    const logoUrl = 'https://static.wixstatic.com/media/d8e0f5_baf5a39b63e047789999751ec53d48be~mv2.png/v1/fill/w_258,h_108,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/logo%20DentIQ.png';
    const logoBytes = await fetch(logoUrl).then(r => r.arrayBuffer());
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.5);
    page.drawImage(logoImage, {
      x: page.getWidth() / 2 - logoDims.width / 2,
      y: 770,
      width: logoDims.width,
      height: logoDims.height,
    });

    let y = 720;

    const draw = (text, size = 12, isBold = false) => {
      page.drawText(text, {
        x: 50,
        y,
        size,
        font: isBold ? bold : font,
        color: rgb(0, 0, 0),
      });
      y -= size + 8;
      if (y < 100) {
        const newPage = pdfDoc.addPage([595, 842]);
        y = 780;
        return newPage;
      }
    };

    draw('Rezumat Consultație Stomatologică - DentIQ', 18, true);
    draw(`Data: ${new Date().toLocaleDateString('ro-RO')}`, 12);
    y -= 20;

    draw('Transcriere completă:', 14, true);
    trimmedText.match(/.{1,85}(\s|$)/g || [trimmedText]).forEach(line => draw(line.trim()));

    y -= 20;
    draw('Rezumat structurat:', 14, true);
    summary.split('\n').forEach(line => {
      const isCategory = line.includes(':');
      draw(line.trim(), 12, isCategory);
    });

    // Footer
    y = 60;
    draw('Acest soft a fost creat și este oferit gratuit de www.dentiq.ro,', 10);
    draw('cu ajutorul lui Ștefan Alexandru Florin.', 10);

    const pdfBytes = await pdfDoc.save();

    // Trimite PDF-ul pentru download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=rezumat_consultatie_${new Date().toISOString().slice(0,10)}.pdf`);
    res.status(200).send(Buffer.from(pdfBytes));

  } catch (error) {
    console.error('Eroare backend:', error);
    res.status(500).json({ error: 'Eroare procesare', details: error.message });
  }
}
