import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
const doc = await getDocument(process.argv[2]).promise;
for (let i = 1; i <= doc.numPages; i++) {
  const p = await doc.getPage(i);
  const c = await p.getTextContent();
  console.log(`\n=== PAGE ${i} ===\n` + c.items.map(x => x.str + (x.hasEOL ? '\n' : '')).join(''));
}
