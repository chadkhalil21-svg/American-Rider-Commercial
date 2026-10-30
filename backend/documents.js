// Reading an operator's documents.
//
// WHAT THIS REPLACES. `verifyDoc` in src/state/OperatorContext.tsx set a flag to 'checking',
// waited 900 milliseconds, and set it to 'ok'. Driver licence, vehicle registration, annual
// inspection and commercial insurance — every one of them approved by a countdown. Worse than
// it sounds: no image was ever captured, so there was nothing to approve. Five screens said
// "Test program — document review is simulated", which was honest and did not make it safe.
//
// WHERE AI IS ALLOWED TO DO THIS, WHICH IS THE PART THAT MATTERS.
//
// FCRA §603(d)(2)(A)(i) excludes from "consumer report" any report containing information
// SOLELY about transactions or experiences between the consumer and the report-maker. An
// operator hands US their own licence; we read it and decide about our own relationship with
// them. That is first-party, and it is not a consumer report.
//
// CFPB Circular 2024-06 draws the other edge of the same line: a "background dossier" or
// algorithmic score assembled from THIRD-PARTY sources and used for an employment decision IS
// a consumer report, and assembling one could make American Rider a consumer reporting agency
// in its own right. So this file must never do that, and does not:
//
//   IT READS   documents the operator gave us, and compares them with each other and with
//              what the operator told us.
//   IT NEVER   looks anything up about the person, scores them against a population, or
//              consults any source outside this conversation and our own records.
//
// The criminal and driving history stay with a licensed CRA (backend/screening.js) because the
// statute names them and the DPPA governs the driving record. This is the cheap half — the
// half that needs no vendor, and the half a $47.49 report was never going to check anyway.
const { recognize, extract, localReady } = require('./localocr');
const { extractLocalDocument } = require('./document-convert');
const MODEL = 'local-tesseract-7.0.0';

const KINDS = {
  license: {
    title: 'Driver licence',
    wants: ['full name', 'licence number', 'expiry date', 'issuing state', 'date of birth'],
    // §627.748(12)(d): no valid driver licence is disqualifying, full stop.
    mustNotBeExpired: true,
  },
  registration: {
    title: 'Vehicle registration',
    wants: ['registered owner', 'plate number', 'vehicle make and model', 'year', 'expiry date'],
    mustNotBeExpired: true,
  },
  inspection: {
    title: 'Vehicle inspection',
    wants: ['vehicle identified', 'inspection date', 'result', 'expiry date'],
    mustNotBeExpired: true,
  },
  insurance: {
    title: 'Commercial insurance',
    // The declarations page, not the wallet card: the card shows a policy exists, the
    // declarations page shows what it covers. The Operator's policy is a mandatory eligibility
    // layer; any separate TNC coverage required by applicable law is handled independently.
    wants: [
      'named insured',
      'policy number',
      'policy period start and end',
      'whether it covers commercial, livery or for-hire use',
      'bodily injury and property damage limits',
      'the vehicle it applies to',
      // Florida TNC evidence, extracted into the `insurance` object and judged in code by
      // backend/qualification.js — never judged here.
      'every named insured and listed driver',
      'every covered vehicle with its VIN and plate',
      'whether a transportation network company (ride-hailing) endorsement or for-hire use is stated',
      'liability limits stated for the period when the driver is logged on but not on a ride',
      'liability limits stated for the period of a prearranged ride',
      'personal injury protection (PIP) and its amount',
      'uninsured / underinsured motorist coverage, or a stated rejection of it',
    ],
    mustNotBeExpired: true,
  },
};

// THE READER'S VERSION. Stored with every reading; a reading from an older version is re-read
// by infra/migrate-documents.js rather than trusted. Bump it when the schema or prompt changes
// what is extracted.
const READER_VERSION = 5;

/**
 * Download only the authenticated R2-signed document, bound memory, and extract locally.
 * Routine clear originals can pass local deterministic document checks automatically.
 * This does NOT replace independent background screening and carrier/broker confirmation
 * of live insurance. Unreadable/ambiguous evidence remains a human exception, never a pass.
 */
async function readDocument({ kind, imageUrl, expect = {}, now = Date.now(), ocr = recognize }) {
  const spec = KINDS[kind];
  if (!spec) return { ok:false, error:`unknown document kind: ${kind}` };
  const review = (reason) => ({ ok:true, verdict:'review', reasons:[reason], fields:{},
    summary:'Document saved. Please check the requested details in the app; further verification may be needed.', expiry:null,
    evidence:{ documentType:'unidentified', isTheRequestedDocument:false, legible:false,
      fields:{}, insurance:null, concerns:[reason] }, readerVersion:READER_VERSION });
  let bytes;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return review('The private document could not be read; review the original upload.');
    const advertised = Number(res.headers.get('content-length') || 0);
    if (advertised > 5*1024*1024) return review('Document received. Automatic text reading was skipped for this larger file; the original is held for private review.');
    const chunks=[]; let total=0;
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > 5*1024*1024) return review('Document received. Automatic text reading was skipped for this larger file; the original is held for private review.');
      chunks.push(Buffer.from(chunk));
    }
    bytes=Buffer.concat(chunks,total);
  } catch {
    return review('The private document is temporarily unavailable; human review is required.');
  }
  // Accept all original upload types, normalizing PDF (digital and scanned), HEIC/
  // HEIF, WebP and standard camera JPEG/PNG locally. No third-party OCR API call.
  // The reader never guesses through extraction or format errors.
  try {
    const found = await extractLocalDocument(bytes, ocr);
    const reading = extract({ kind, text:found.text, confidence:found.confidence });
    const result = decide({ kind, spec, read:reading, expect, now });
    // For scans, confident and complete structured evidence may be accepted without
    // a routine human click. Otherwise preserve the actual document and queue review.
    // Independent insurer status and licensed screening checks run separately at
    // every qualification and dispatch gate.
    return { ...result, readerVersion:READER_VERSION };
  } catch {
    return review('Automated extraction was unavailable or inconclusive; the original remains available for review.');
  }
}

/**
 * Turn a reading into a verdict.
 *
 * THE RULES ARE HERE, NOT IN THE PROMPT. What disqualifies a document is a policy decision and
 * must be reviewable, testable and identical for everybody — so the model reports what it sees
 * and this function alone decides what that means. Changing the model cannot change the
 * standard.
 *
 * 'review' rather than 'refuse' wherever the answer is "we cannot tell". Nobody drives on a
 * review, so it is the safe direction, and a person deciding is better than a machine guessing.
 */
function decide({ kind, spec, read, expect, now }) {
  const reasons = [];
  const f = read.fields || {};

  if (!read.legible) reasons.push(`The ${spec.title.toLowerCase()} could not be read clearly.`);
  if (!read.isTheRequestedDocument) {
    reasons.push(
      `That does not look like a ${spec.title.toLowerCase()}` +
        (read.documentType ? ` — it appears to be a ${read.documentType}.` : '.'),
    );
  }

  // ---- Expiry. -----------------------------------------------------------------------------
  let expired = false;
  if (spec.mustNotBeExpired) {
    const end = Date.parse(`${f.expiry}T23:59:59`);
    if (!f.expiry || Number.isNaN(end)) {
      reasons.push('No expiry date could be read.');
    } else if (end < now) {
      expired = true;
      reasons.push(`Expired ${f.expiry}.`);
    }
  }

  // ---- Does it belong to the person who sent it? -------------------------------------------
  // A loose comparison on purpose: middle names, initials and suffixes differ legitimately
  // between a licence and an insurance schedule. A real mismatch is a person's job, not a
  // string comparison's.
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, '').trim();
  const surname = (s) => norm(s).split(/\s+/).filter(Boolean).pop() || '';
  if (expect.name && f.name && surname(expect.name) && surname(expect.name) !== surname(f.name)) {
    reasons.push(`The name on the document (${f.name}) does not match the account (${expect.name}).`);
  }
  if (expect.plate && f.plate && norm(expect.plate).replace(/ /g, '') !== norm(f.plate).replace(/ /g, '')) {
    reasons.push(`The plate on the document (${f.plate}) is not the vehicle on file (${expect.plate}).`);
  }

  // ---- Insurance only: it must actually cover carrying people for money. -------------------
  //
  // CAUGHT BY THE TEST, and it was the dangerous direction. Only 'no' raised a reason, so a
  // policy whose cover could not be determined — 'unclear', or a field the reader could not
  // find — produced no reasons at all and was ACCEPTED. American Rider carries no coverage
  // behind the operator, so the limits on that page are the only ones a traveler has, and
  // "we could not tell" must never read as "yes".
  if (kind === 'insurance') {
    if (f.commercialUse === 'no') {
      reasons.push(
        'This policy appears to be for personal use. Carrying passengers for hire needs ' +
          'commercial, livery or for-hire cover.',
      );
    } else if (f.commercialUse !== 'yes') {
      reasons.push('Whether this policy covers carrying passengers for hire could not be read.');
    }
    if (!f.limits) reasons.push('The coverage limits could not be read.');
  }

  const concerns = Array.isArray(read.concerns) ? read.concerns : [];

  // Expired, wrong document, or personal-use insurance are refusals: each is a fact the
  // document itself states. Everything else a person looks at.
  // Low-confidence OCR is never evidence for outright refusal.
  const hardFail = read.legible === true && (
    expired ||
    (read.isTheRequestedDocument === false && read.documentType && read.documentType !== 'unidentified') ||
    (kind === 'insurance' && f.commercialUse === 'no')
  );

  const verdict = hardFail ? 'refuse' : reasons.length || concerns.length ? 'review' : 'accept';

  return {
    ok: true,
    verdict,
    reasons: [...reasons, ...concerns],
    fields: f,
    summary: String(read.summary || '').slice(0, 300),
    expiry: f.expiry || null,
    // The reading itself, stored with the verdict so qualification can re-check it in code.
    evidence: {
      documentType: String(read.documentType || ''),
      isTheRequestedDocument: read.isTheRequestedDocument === true,
      legible: read.legible === true,
      fields: f,
      insurance: kind === 'insurance' ? read.insurance || null : null,
      concerns,
    },
    readerVersion: READER_VERSION,
  };
}

/** Local installed OCR readiness; model API keys are not required. */
const documentsReady = () => localReady();
module.exports = { readDocument, decide, KINDS, documentsReady, MODEL, READER_VERSION };
