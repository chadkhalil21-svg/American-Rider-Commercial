// Presentation-only menu casing. Leave translations, messages, and long-form copy untouched.
// Conventional English Title Case: capitalize principal words, retain short joining words,
// and preserve acronyms. Do not impose English capitalization rules on other languages.
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'via', 'with']);

export function menuTitleCase(label: string, language: string): string {
  if (language !== 'en') return label;
  return label.replace(/[A-Za-z]+(?:['’][A-Za-z]+)*/g, (word, index: number) => {
    const lower = word.toLowerCase();
    if (index > 0 && SMALL_WORDS.has(lower)) return lower;
    // QR, PIN and similar intentionally capitalized acronyms must stay intact.
    if (word.length > 1 && word === word.toUpperCase()) return word;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}
