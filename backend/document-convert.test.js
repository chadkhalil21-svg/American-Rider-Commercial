'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { formatOf, extractLocalDocument, MAX_FILE } = require('./document-convert');
const png = Buffer.from('89504e470d0a1a0a'+'00'.repeat(24),'hex');
const jpeg = Buffer.from([0xff,0xd8,0xff,0xe0,0,0]);
const pdf = Buffer.from('%PDF-1.7\nexample','ascii');
const heif = Buffer.concat([Buffer.from([0,0,0,16]),Buffer.from('ftypheic','ascii'),Buffer.alloc(8)]);
const webp = Buffer.concat([Buffer.from('RIFF','ascii'),Buffer.alloc(4),Buffer.from('WEBP','ascii'),Buffer.alloc(12)]);
async function run() {
  assert.equal(formatOf(png),'png');
  assert.equal(formatOf(jpeg),'jpeg');
  assert.equal(formatOf(pdf),'pdf');
  assert.equal(formatOf(heif),'heif');
  assert.equal(formatOf(webp),'webp');
  assert.equal(formatOf(Buffer.alloc(MAX_FILE+1)),null);
  assert.equal(formatOf(Buffer.from('not an image')),null);
  let calls=0;
  const ocr=async bytes=>{calls++;assert(bytes.equals(png));return {text:'OCR from page',confidence:95}};
  const digital=await extractLocalDocument(pdf,ocr,{command:async(program,args)=>{
    assert.equal(program,'pdftotext');
    assert.deepEqual(args.slice(0,4),['-f','1','-l','2']);
    return {stdout:'Driver licence\nName: Alex Morgan\nDLN: A1234567\nExpiration: 2030-12-31\n'.repeat(2)};
  }});
  assert.equal(digital.source,'pdf-text');
  assert.equal(digital.confidence,99);
  assert.equal(calls,0,'native PDF text does not need image OCR');
  const scanned=await extractLocalDocument(pdf,ocr,{command:async(program,args)=>{
    if(program==='pdftotext')return {stdout:' '};
    assert.equal(program,'pdftoppm');
    await fs.writeFile(args.at(-1)+'-1.png',png);
    return {stdout:''};
  }});
  assert.equal(scanned.source,'pdf-ocr');
  assert.equal(calls,1,'scanned PDF should run bounded OCR');
  for(const [buf,expected] of [[heif,'heif-convert'],[webp,'dwebp']]){
    const result=await extractLocalDocument(buf,ocr,{command:async(program,args)=>{
      assert.equal(program,expected);
      await fs.writeFile(args.at(-1),png);
      return {stdout:''};
    }});
    assert.equal(result.confidence,95);
  }
  assert.equal(calls,3);
  assert.deepEqual(await extractLocalDocument(png,ocr),{text:'OCR from page',confidence:95});
  await assert.rejects(()=>extractLocalDocument(Buffer.alloc(MAX_FILE+1),ocr),/Unsupported/);
  console.log('PASS bounded native PDF, scanned PDF, JPEG/PNG, HEIC/HEIF and WebP document processing');
}
run().catch(e=>{console.error(e);process.exitCode=1});
