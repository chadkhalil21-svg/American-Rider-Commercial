'use strict';
// Private photo/file uploads have separate business purposes.
// Operators need a valid state policy to prepare qualifications; Travelers
// must not need an Operator account to report a lost item. The owner-specific
// R2 key, authentication, rate limit and fresh token are checked elsewhere.
function privateUploadScope(purpose) {
  if (purpose === 'operator-document') return 'operator-preparation';
  if (purpose === 'lost-item') return 'authenticated-traveler';
  return null;
}
module.exports={privateUploadScope};
