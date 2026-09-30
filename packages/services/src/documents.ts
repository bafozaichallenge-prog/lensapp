import AdmZip from 'adm-zip';
import mammoth from 'mammoth';
import { badRequest } from './context';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_UNCOMPRESSED = 100 * 1024 * 1024;
const TEXT_EXT = new Set(['.md', '.markdown', '.txt', '.csv', '.json']);
export const ACCEPTED_TYPES = ['.docx', '.md', '.txt', '.csv', '.json'];
export const PDF_NOTICE = 'PDF is not supported in this version. Export the document as .docx, .md or .txt and upload that instead.';

const extOf = (n: string) => { const i = n.lastIndexOf('.'); return i < 0 ? '' : n.slice(i).toLowerCase(); };

/** Server-side text extraction for requirement documents (plan §14.1). */
export async function extractText(filename: string, bytes: Uint8Array): Promise<{ text: string; mime: string; chars: number }> {
  const ext = extOf(filename);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw badRequest(`${filename} is larger than 10 MB.`);
  if (ext === '.pdf') throw badRequest(PDF_NOTICE);
  if (ext === '.docx') {
    // guard against zip bombs before handing the archive to the DOCX reader
    let zip: AdmZip;
    try { zip = new AdmZip(Buffer.from(bytes)); } catch { throw badRequest(`${filename} is not a valid .docx file.`); }
    const entries = zip.getEntries();
    if (entries.length > 5000 || entries.reduce((a, e) => a + e.header.size, 0) > MAX_UNCOMPRESSED) throw badRequest(`${filename} expands to an unreasonable size.`);
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    const text = value.replace(/\r\n?/g, '\n').trim();
    return { text, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', chars: text.length };
  }
  if (TEXT_EXT.has(ext)) {
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { text = new TextDecoder('windows-1252').decode(bytes); }
    text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    if (ext === '.json') { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { throw badRequest(`${filename} is not valid JSON.`); } }
    return { text, mime: ext === '.json' ? 'application/json' : ext === '.csv' ? 'text/csv' : 'text/plain', chars: text.length };
  }
  throw badRequest(`${filename}: unsupported file type. Accepted: ${ACCEPTED_TYPES.join(', ')}. ${ext === '' ? '' : ''}`.trim());
}
