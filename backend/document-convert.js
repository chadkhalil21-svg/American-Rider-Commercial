'use strict';
// Local, zero-per-document-fee extraction from private <=5 MiB originals.
// Poppler extracts embedded text and renders scanned PDF pages; libheif/webp tools
// normalize native phone images to PNG for the existing Tesseract reader.
// No external document service receives Operator evidence. Names are random,
// arguments are fixed (no shell), output and wall-clock work are bounded.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const MAX_FILE = 5 * 1024 * 1024;
const MAX_PAGES = 2;
const MAX_PAGE = 5 * 1024 * 1024;
const MAX_TEXT = 16_000;
function formatOf(buf) {
  if (!Buffer.isBuffer(buf) || !buf.length || buf.length > MAX_FILE) return null;
  if (buf.subarray(0,5).toString('ascii') === '%PDF-') return 'pdf';
  if (buf.length >= 3 && buf[0] === 255 && buf[1] === 216 && buf[2] === 255) return 'jpeg';
  if (buf.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) return 'png';
  if (buf.subarray(0,4).toString('ascii') === 'RIFF' && buf.subarray(8,12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.length > 12 && buf.subarray(4,8).toString('ascii') === 'ftyp' &&
    /^(heic|heix|hevc|hevx|mif1|msf1)/.test(buf.subarray(8,12).toString('ascii'))) return 'heif';
  return null;
}
async function extractLocalDocument(buf, ocr, { command = run } = {}) {
  const fmt = formatOf(buf);
  if (!fmt) throw Error('Unsupported, empty or oversized original.');
  if (fmt === 'png' || fmt === 'jpeg') return ocr(buf);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ar-doc-'));
  const original = path.join(dir, 'original.' + (fmt === 'heif' ? 'heic' : fmt));
  async function exec(program, args) {
    return command(program, args, { timeout: 15000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  }
  try {
    await fs.writeFile(original, buf, { mode: 0o600, flag: 'wx' });
    if (fmt === 'webp' || fmt === 'heif') {
      const output = path.join(dir, 'page.png');
      if (fmt === 'webp') await exec('dwebp', [original,'-o',output]);
      else await exec('heif-convert', [original,output]);
      const image = await fs.readFile(output);
      if (!image.length || image.length > MAX_PAGE) throw Error('Converted image exceeds safe OCR size.');
      return ocr(image);
    }
    // Native-text PDF first. Scanned PDFs automatically rasterize and use OCR.
    let text = '';
    try {
      const got = await exec('pdftotext', ['-f','1','-l',String(MAX_PAGES),'-layout',original,'-']);
      text = String(got.stdout || '').slice(0, MAX_TEXT);
    } catch { /* scanned, encrypted, or textless originals receive OCR fallback */ }
    if (text.trim().length >= 50) {
      return { text, confidence: 99, source: 'pdf-text' };
    }
    const prefix = path.join(dir, 'scan');
    await exec('pdftoppm', ['-f','1','-l',String(MAX_PAGES),'-scale-to','1600','-png',original,prefix]);
    const files = (await fs.readdir(dir)).filter(x=>/^scan-\d+\.png$/.test(x)).sort().slice(0,MAX_PAGES);
    if (!files.length) throw Error('PDF has no extractable pages.');
    const outputs = [];
    for (const file of files) {
      const image = await fs.readFile(path.join(dir,file));
      if (!image.length || image.length > MAX_PAGE) throw Error('Rendered page exceeds safe OCR size.');
      outputs.push(await ocr(image));
    }
    return {
      text: outputs.map(x=>String(x.text||'')).join('\n').slice(0, MAX_TEXT),
      confidence: Math.min(...outputs.map(x=>Number(x.confidence)||0)),
      source: 'pdf-ocr',
    };
  } finally { await fs.rm(dir, { recursive: true, force: true }).catch(()=>{}); }
}
module.exports = { formatOf, extractLocalDocument, MAX_FILE };
