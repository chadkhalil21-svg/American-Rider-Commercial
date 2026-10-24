'use strict';
// Versioned, Founder-ratified independent Recruiter commercial agreement.
// This is the participant-facing contract, not a claim of attorney certification.
// Every person must accept these exact SHA256-bound terms while signed in.
// Changing the text requires a new named version and an explicit new acceptance.
const VERSION='recruiter-15c-20261024-v1';
const TEXT=[
'AMERICAN RIDER INDEPENDENT RECRUITER AGREEMENT',
'Version: '+VERSION,
'',
'1. Participation. American Rider may invite an individual to introduce new Operators or Travelers. An invitation is not employment, a franchise or an earnings guarantee. Participation is optional and approval may be withdrawn for misconduct or material contract violations. A Recruiter must use their own authenticated account, accurate identity and verified email, and must obey applicable laws. Each approved Recruiter may use the assigned role-specific link or QR code; ordinary Travelers and Operators never have to join this program.',
'',
'2. Qualifying compensation. American Rider pays $0.15 for each genuinely attributed, eligible, completed, paid and settled Travel involving a referred Operator, for the first 200 qualifying Travels for that Operator; and $0.15 for each genuinely attributed, eligible, completed, paid and settled Travel involving a referred Traveler, for the first 200 qualifying Travels for that Traveler. Either or both roles may earn a commission on a qualifying Travel; the maximum combined referral cost for one Travel is $0.30. The first 200 qualifying Travels and $30 lifetime gross cap apply separately to each introduced person and role, not to the Recruiter overall. Existing, fraudulent, duplicate, self-generated, collusive, refunded or disputed activity does not qualify. A valid attribution requires the identified new participant to claim the Recruiter code through the approved signed-in process within its allowed period.',
'',
'3. Protection of Traveler and Operator money. Recruiting commissions are an American Rider platform expense from verified available platform contribution. They do not reduce the Operator’s 99% of the Travel Fare and do not add an undisclosed fee to the Traveler Total. Where a Travel does not provide sufficient verified budget, no Recruiter commission is payable on that Travel.',
'',
'4. Payment schedule and hold. Every qualifying $0.15 commission is held at least 24 hours after its paid and settled Travel is recorded, plus any documented payment, fraud, chargeback or refund risk hold. Verified, matured, undisputed commissions become available in the private Recruiter earnings ledger. Standard payments are processed once each calendar month, at the first eligible UTC month boundary after the Recruiter’s gross available balance reaches $25. $25 is a processing threshold, not a fee or lifetime cap. Funds arrive according to Stripe and the receiving financial institution. No specific bank-arrival date is guaranteed.',
'',
'5. Fees. An independent Recruiter accepts a single $2.00 Connect administration fee deducted from their earned commissions in each calendar month that a bank payout is successfully made. There is no such fee for an enrollment month without a successful payout, and it is not charged per Travel, invitation or click. American Rider covers standard bank payout processing charges. A Recruiter already using a qualifying Operator Stripe Connect account continues using that same account and existing payout schedule, with no second Recruiter Connect account and no second $2 monthly Connect fee.',
'',
'6. Balances below the monthly threshold. After 90 consecutive days without new qualifying Recruiter activity, or upon cessation of participation, matured undisputed earnings remain owed and become eligible for closeout without the $25 threshold. American Rider waives or absorbs its $2 fee for an eligible final residual payout. Stripe may not permit a standalone U.S. bank payout below its minimum amount; smaller residual obligations are retained and reconciled by a lawful alternative arrangement rather than forfeited. Suspended or disputed balances remain subject to documented review and applicable unclaimed-property law.',
'',
'7. Provider and tax onboarding. Stripe Connect provides the account and bank-identity onboarding. The participant separately accepts Stripe’s connected-account terms and provides complete and truthful required identity, tax and payout information. American Rider does not request banking credentials by email or store bank account numbers in the Recruiter portal. No payout can occur until the recipient’s account is verified for transfers and payouts, required tax status is recorded, sufficient provider funds exist, and each credit passes the commission ledger’s checks. Incomplete onboarding delays payment but does not erase earned undisputed compensation.',
'',
'8. Refunds, disputes and recoveries. Verified refunds, reversed or disputed payments, and fraudulent activity may reduce commissions that have not been paid. If a later dispute concerns an already paid commission, American Rider maintains a separate documented recovery claim. American Rider will not silently withdraw unrelated Operator earnings. An authenticated payout submission is not proof of bank receipt; final paid status follows a verified provider confirmation.',
'',
'9. Public representations. Recruiters must clearly disclose any material paid referral relationship in each relevant recommendation or promotional communication, avoid spam and prohibited solicitation, use truthful descriptions of American Rider, respect privacy and consent, and never claim employment, guaranteed earnings, guaranteed insurance or authority they have not been given. American Rider may suspend invitations prospectively for abuse.',
'',
'10. Records, communications and changes. The account displays the credited roles and payment states. Communications about the agreement, payout disputes and beneficiary updates may be sent to relations@americanrider.tech. American Rider retains records needed for reconciliation, tax reporting, fraud and lawful dispute resolution. Changes that materially affect compensation require a newly versioned agreement and fresh individual affirmative acceptance. Earned undisputed amounts are not silently forfeited on termination.',
'',
'Acceptance. By selecting the affirmative agreement control while logged in with a verified email, the participant accepts this version of the American Rider Independent Recruiter Agreement and the disclosed Stripe payout fee. No one else may accept it on their behalf.'
].join('\n');
const CURRENT_TERMS=Object.freeze({
 text:TEXT,version:VERSION,expiresAt:Date.UTC(2032,0,1)
});
module.exports={CURRENT_TERMS};
