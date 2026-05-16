// Incremental sentence splitter for a streaming text buffer. The caller
// keeps appending model deltas and calls this to peel off any sentences
// that are now complete. The remainder stays buffered until more tokens
// arrive or the stream finishes.
//
// "Sentence-ending punctuation" = . ! ? followed by whitespace or end of
// buffer, with some defenses:
//   - decimal numbers ("3.14")
//   - common abbreviations ("e.g.", "Mr.")
//   - ellipses ("...") — treated as one boundary, not three
//
// We also break on hard line breaks because Brain often writes step-by-step
// lists where each step is its own utterance even without terminal
// punctuation.

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr',
  'eg', 'ie', 'etc', 'vs', 'no', 'fig', 'eq'
]);

function endsWithAbbreviation(buffer, dotIndex) {
  // Walk back to find the word that the dot belongs to.
  let j = dotIndex - 1;
  while (j >= 0 && /[A-Za-z]/.test(buffer[j])) j -= 1;
  const word = buffer.slice(j + 1, dotIndex).toLowerCase();
  return ABBREVIATIONS.has(word);
}

function isDecimalPoint(buffer, dotIndex) {
  const before = buffer[dotIndex - 1];
  const after = buffer[dotIndex + 1];
  return /\d/.test(before) && /\d/.test(after);
}

// Find the cutoff index AFTER which the buffer should be split. Returns
// -1 if there's no clean sentence boundary in `buffer` yet.
function findBoundary(buffer) {
  for (let i = 0; i < buffer.length; i += 1) {
    const ch = buffer[i];

    if (ch === '\n') {
      // Hard break ends a sentence even without terminal punctuation. We
      // include the newline in the emitted chunk so length math stays
      // honest, but the consumer normalizes it away.
      return i + 1;
    }

    if (ch !== '.' && ch !== '!' && ch !== '?') continue;

    if (ch === '.') {
      if (isDecimalPoint(buffer, i)) continue;
      if (endsWithAbbreviation(buffer, i)) continue;
    }

    // Skip past any run of trailing punctuation (handles "!!", "...", "?!").
    let j = i;
    while (j + 1 < buffer.length && /[.!?]/.test(buffer[j + 1])) j += 1;

    // Boundary only if followed by whitespace — otherwise we're inside a
    // token like "github.com" or "3.14".
    if (j + 1 >= buffer.length) {
      // Punctuation at the very end of what we have so far. Don't split
      // yet — the next chunk might continue the same word ("3.14") and
      // we'd have already shipped half a sentence.
      return -1;
    }
    if (!/\s/.test(buffer[j + 1])) continue;

    return j + 1;
  }
  return -1;
}

export default function splitSentences(buffer) {
  const completed = [];
  let cursor = 0;
  while (cursor < buffer.length) {
    const slice = buffer.slice(cursor);
    const boundary = findBoundary(slice);
    if (boundary < 0) break;
    const piece = slice.slice(0, boundary).trim();
    if (piece) completed.push(piece);
    cursor += boundary;
  }
  return { completed, remainder: buffer.slice(cursor) };
}
