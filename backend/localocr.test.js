const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const { recognize, extract, localReady, iso }=require('./localocr');
const { readDocument, documentsReady, READER_VERSION }=require('./documents');
(async()=>{
  assert.equal(localReady(),true,'bundled trained data must exist locally');
  assert.equal(documentsReady(),true);
  assert.equal(iso('02/30/2030'),'','invalid calendar date');
  const fixture=fs.readFileSync(path.join(__dirname,'fixtures/synthetic-license.png'));
  const actual=await recognize(fixture);
  assert(actual.confidence>=80,`unexpected synthetic OCR confidence ${actual.confidence}`);
  const fields=extract({kind:'license',...actual});
  assert.equal(fields.fields.expiry,'2030-12-31');
  assert.equal(fields.isTheRequestedDocument,true);
  const fetchBefore=global.fetch;
  try {
    global.fetch=async()=>new globalThis.Response(fixture,{status:200,headers:{'content-type':'image/png'}});
    const output=await readDocument({ kind:'license',imageUrl:'https://private.example/signed',
      expect:{name:'Alex Morgan'},ocr:async()=>actual });
    assert.equal(output.ok,true);assert.notEqual(output.verdict,'refuse','unreliable OCR must not be treated as proof of refusal');
    assert.equal(output.expiry,'2030-12-31');
    assert.equal(output.readerVersion,READER_VERSION);
    assert(output.evidence?.fields, 'retain extracted fields for independent qualification and review');
    const autoText = 'DRIVER LICENSE\nNAME: ALEX MORGAN\nDLN: A12345678\nEXP: 2030-12-31\nDRIVER LICENSE NUMBER: A12345678\n';
    const accepted = await readDocument({ kind:'license',imageUrl:'https://private.example/signed',
      expect:{name:'Alex Morgan'},ocr:async()=>({text:autoText,confidence:96}) });
    assert.equal(accepted.verdict,'accept','clear current license should not require a Founder click');
    const confidentFieldsAtModerateOcr = await readDocument({
      kind:'license',imageUrl:'https://private.example/signed',
      expect:{name:'Alex Morgan'},ocr:async()=>({text:autoText,confidence:68}),
    });
    assert.equal(confidentFieldsAtModerateOcr.verdict,'accept',
      'complete matched licence details should not require arbitrary 85% OCR confidence');
    const tooUncertain = await readDocument({
      kind:'license',imageUrl:'https://private.example/signed',
      expect:{name:'Alex Morgan'},ocr:async()=>({text:autoText,confidence:18}),
    });
    assert.equal(tooUncertain.verdict,'review',
      'extremely low-confidence text cannot authorize even an apparently complete document');
    const wrongPerson = await readDocument({ kind:'license',imageUrl:'https://private.example/signed',
      expect:{name:'Other Person'},ocr:async()=>({text:autoText,confidence:96}) });
    assert.equal(wrongPerson.verdict,'review','identity mismatch never automatically approves');
    const insufficient = await readDocument({ kind:'insurance',imageUrl:'https://private.example/signed',
      expect:{name:'Alex Morgan'},ocr:async()=>({text:'INSURANCE DECLARATIONS PAGE\\nPERSONAL USE ONLY\\nEXP: 2030-12-31',confidence:96}) });
    assert.notEqual(insufficient.verdict,'accept','personal-only insurance cannot automatically qualify');
    const unavailable=await readDocument({kind:'license',imageUrl:'https://private.example/signed',
      ocr:async()=>{throw Error('model unavailable');}});
    assert.equal(unavailable.verdict,'review');
    global.fetch=async()=>new globalThis.Response(Buffer.from('not an image'),{status:200});
    const invalid=await readDocument({kind:'insurance',imageUrl:'https://private.example/signed'});
    assert.equal(invalid.verdict,'review','unsupported images never pass');
  } finally {global.fetch=fetchBefore;}
  console.log('PASS bounded OCR, automatic clean license, exception handling, insurance rejection and missing OCR fallback');
})().catch((e)=>{console.error(e);process.exitCode=1;});
