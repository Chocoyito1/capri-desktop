'use strict';
// Require the complete address at the start of an utterance, never a bare name.
function wakePhrase(text) {
  if (typeof text !== 'string') return null;
  const match = text.trim().match(/^(?:hey|hei|ey)[\s,!.:-]+capri\b[\s,!.:;?\-]*(.*)$/iu);
  return match ? { text: match[1].trim().slice(0, 501) } : null;
}
module.exports = { wakePhrase };
