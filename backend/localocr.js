// No metered AI call and no third-party OCR API: both WASM engine and English trained data
// are pinned in backend/package-lock.json. The source image stays in server memory/R2.
const fs = require('node:fs');
const path = require('node:path');
const { createWorker } = require('tesseract.js');
const language = require('@tesseract.js-data/eng');

const MAX_QUEUE = 8;
const MAX_MS = 45_000;
let worker = null;
let serial = Promise.resolve();
let queued = 0;
let idleTimer = null;
const localReady = () => fs.existsSync(path.join(language.langPath, 'eng.traineddata.gz'));

async function recognize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > 5 * 1024 * 1024) throw new Error('OCR input is missing or too large');
  if (!localReady()) throw new Error('Bundled OCR language data is unavailable');
  if (queued >= MAX_QUEUE) throw new Error('Document reader is busy; retry later');
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  queued++;
  const job = serial.then(async () => {
    let timer;
    try {
      if (!worker) worker = await createWorker('eng', 1, {
        langPath: language.langPath, gzip: true, cacheMethod: 'none',
      });
      const output = await Promise.race([
        worker.recognize(buffer),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Local OCR timed out')), MAX_MS); }),
      ]);
      return { text: String(output.data?.text || '').slice(0, 16_000),
        confidence: Number(output.data?.confidence) || 0 };
    } catch (e) {
      const old = worker; worker = null;
      if (old) old.terminate().catch(() => {});
      throw e;
    } finally { if (timer) clearTimeout(timer); }
  });
  serial = job.catch(() => {});
  return job.finally(() => {
    queued--;
    if (!queued && worker) {
      idleTimer = setTimeout(() => {
        if (!queued && worker) {
          const old = worker; worker = null;
          old.terminate().catch(() => {});
        }
        idleTimer = null;
      }, 1500);
    }
  });
}

function iso(raw) {
  const s = String(raw || '').trim();
  let y,m,d;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) [y,m,d]=s.split('-').map(Number);
  else if (/^\d{1,2}[/.]\d{1,2}[/.]\d{4}$/.test(s)) [m,d,y]=s.split(/[/.]/).map(Number);
  else return '';
  const date = new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y && date.getUTCMonth()===m-1 && date.getUTCDate()===d
    ? `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` : '';
}

function extract({ kind, text, confidence }) {
  const content = String(text || '').replace(/\r/g,'').slice(0,16000);
  const upper = content.toUpperCase();
  const value = (pattern) => upper.match(pattern)?.[1]?.trim() || '';
  const datePattern = String.raw`(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.]\d{1,2}[/.]\d{4})`;
  const allDates = [...upper.matchAll(new RegExp('(?:EXP(?:IRATION|IRES|IRY)?|VALID\\s+TO|EXPIRES\\s+ON|POLICY\\s+END|END\\s+DATE)\\s*[:#.-]?\\s*'+datePattern,'g'))]
    .map(m=>iso(m[1])).filter(Boolean);
  const expiry = [...new Set(allDates)].length === 1 ? allDates[0] : '';
  const effective = iso(value(new RegExp('(?:EFFECTIVE|POLICY\\s+START|BEGIN\\s+DATE)\\s*[:#.-]?\\s*'+datePattern)));
  const name = value(/(?:^|\n)\s*(?:NAME|NAMED INSURED|REGISTERED OWNER|OWNER)\s*[:#-]?\s*([A-Z][A-Z .,']{3,60})(?:\n|$)/);
  const plate = value(/(?:^|\n)\s*(?:PLATE|TAG|LICENSE PLATE|PLATE NUMBER)\s*[:#-]?\s*([A-Z0-9 -]{5,12})(?:\n|$)/);
  const vin = value(/(?:^|\n)\s*(?:VIN|VEHICLE IDENTIFICATION NUMBER)\s*[:#-]?\s*([A-HJ-NPR-Z0-9]{17})(?:\n|$)/);
  const number = value(/(?:^|\n)\s*(?:DRIVER.?S?\s+LICEN[CS]E\s*(?:NO|NUMBER|#)?|DLN|DL\s*(?:NO|NUMBER|#))\s*[:#.-]?\s*([A-Z0-9 -]{5,20})(?:\n|$)/);
  const signs = { license:/DRIVER.?S?\s+LICEN[CS]E|DRIVER\s+LICENSE/, registration:/REGISTRATION/, inspection:/INSPECTION/, insurance:/INSURANCE|POLICY\s+DECLARATION|DECLARATIONS\s+PAGE/ };
  const identified = !!signs[kind]?.test(upper);
  // Never infer qualifying coverage from the mere word "insurance".
  const forHire = /\b(FOR.HIRE|LIVERY|RIDESHARE|RIDE.SHARING|TRANSPORTATION NETWORK COMPANY|TNC COVERAGE|COMMERCIAL PASSENGER)\b/.test(upper);
  const personalOnly = /(?:PERSONAL USE ONLY|EXCLUDES? (?:LIVERY|FOR.HIRE|RIDESHARE))/.test(upper);
  const commercialUse = kind==='insurance' ? (personalOnly ? 'no' : forHire ? 'yes' : 'unclear') : '';
  const dollar = '((?:\\$\\s*)?[\\d,]+(?:\\s*(?:MILLION|M|MM))?)';
  const limit = value(new RegExp('(?:COMBINED\\s+SINGLE\\s+LIMIT|CSL|PRIMARY\\s+LIABILITY|PER\\s+OCCURRENCE)\\s*[:$\\s-]*'+dollar));
  const pip = value(new RegExp('(?:PERSONAL INJURY PROTECTION|\\bPIP\\b)\\s*[:$\\s-]*'+dollar));
  const limitFields = {
    bodilyInjuryPerPerson: value(new RegExp('(?:BODILY INJURY PER PERSON|BI PER PERSON)\\s*[:$\\s-]*'+dollar)),
    bodilyInjuryPerIncident: value(new RegExp('(?:BODILY INJURY PER (?:ACCIDENT|INCIDENT)|BI PER ACCIDENT)\\s*[:$\\s-]*'+dollar)),
    propertyDamage: value(new RegExp('(?:PROPERTY DAMAGE|PD LIMIT)\\s*[:$\\s-]*'+dollar)),
    combinedSingleLimit: limit,
  };
  const insurer = value(/(?:^|\n)\s*(?:CARRIER|INSURER|INSURANCE COMPANY)\s*[:#.-]?\s*([A-Z0-9 &.,'-]{3,90})(?:\n|$)/);
  const policyNumber = value(/(?:^|\n)\s*(?:POLICY\s*(?:NO\.?|NUMBER|#)|POLICY\s+ID)\s*[:#.-]?\s*([A-Z0-9-/]{5,40})(?:\n|$)/);
  const umRejected = /\bUNINSURED MOTORIST\s+REJECTED\s+IN\s+WRITING\b/.test(upper);
  const um = umRejected ? 'rejected_in_writing' :
    /\b(?:UM\/UIM|UNINSURED MOTORIST)\b.{0,20}(?:COVERAGE|INCLUDED|YES)/.test(upper) ? 'yes' : 'not_shown';
  const fields = { name, number, expiry, state:'', vehicle:'', vin, plate, commercialUse, limits:limit };
  const concerns = [];
  // OCR confidence is not a statutory condition. Permit clear, internally consistent
  // essential fields at a lower score; never waive the required facts themselves.
  // Low scores without the core fields still request a better image.
  const score = Number(confidence);
  const coreComplete = kind==='license' ? !!(name && number && expiry) :
    kind==='registration' ? !!((plate || vin) && expiry) :
    kind==='insurance' ? !!(name && expiry && effective && forHire && limit &&
      (plate || vin) && pip && um !== 'not_shown') :
    kind==='inspection' ? !!expiry : false;
  const legible = identified && content.trim().length >= 20 &&
    Number.isFinite(score) && (score >= 85 || (score >= 60 && coreComplete));
  if (!legible) concerns.push('Some document text needs a clearer photo or additional evidence.');
  if (!expiry) concerns.push('Expiry could not be uniquely extracted.');
  if (!identified) concerns.push('Document type could not be established.');
  if (kind === 'license' && (!name || !number)) concerns.push('The licence holder and number must be legible.');
  if (kind === 'registration' && (!plate && !vin)) concerns.push('A registration plate or VIN must be legible.');
  if (kind === 'insurance' && (!name || !effective || !forHire || !limit || !plate && !vin || !pip || um === 'not_shown')) {
    concerns.push('Commercial policy details require complete and reliable verification.');
  }
  const insurance = kind === 'insurance' ? {
    namedInsureds: name ? [name] : [], listedDrivers: [],
    vehicles: (plate || vin) ? [{plate,vin}] : [],
    effectiveDate: effective, expirationDate: expiry,
    forHireUse: commercialUse === 'yes' ? 'yes' : commercialUse === 'no' ? 'no' : 'unknown',
    tncEndorsement: forHire ? 'yes' : 'unknown',
    generalLimits: limitFields, rideLimits: { combinedSingleLimit: limit },
    loggedOnLimits: limitFields, pip:{shown:pip?'yes':'not_shown',amount:pip},
    uninsuredMotorist:{shown:um}, insurer, policyNumber,
  } : null;
  return {
    documentType: identified ? kind : 'unidentified',
    isTheRequestedDocument: identified,
    legible,
    fields, insurance, concerns,
    summary: concerns.length ? 'Automatic extraction requires additional verification.' :
      'Document fields extracted automatically; eligibility is checked against independent records.',
  };
}

module.exports = { recognize, extract, localReady, iso, MAX_QUEUE, MAX_MS };
