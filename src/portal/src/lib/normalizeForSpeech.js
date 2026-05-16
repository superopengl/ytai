// Turn Brain's raw markdown/KaTeX into something a TTS model will speak
// naturally. Strips formatting characters, expands the common math macros
// we see on elementary worksheets, and collapses whitespace.

const MATH_MACROS = [
  [/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1 over $2'],
  [/\\sqrt\s*\{([^{}]+)\}/g, 'square root of $1'],
  [/\\sqrt\b/g, 'square root'],
  [/\\times\b/g, ' times '],
  [/\\div\b/g, ' divided by '],
  [/\\cdot\b/g, ' times '],
  [/\\pm\b/g, ' plus or minus '],
  [/\\pi\b/g, ' pi '],
  [/\\theta\b/g, ' theta '],
  [/\\le(?:q)?\b/g, ' less than or equal to '],
  [/\\ge(?:q)?\b/g, ' greater than or equal to '],
  [/\\neq\b/g, ' not equal to '],
  [/\\approx\b/g, ' approximately '],
  [/\\sum\b/g, ' sum '],
  [/\\to\b/g, ' to '],
  [/\\left|\\right/g, ''],
  [/\\,|\\;|\\:|\\!/g, ' ']
];

function expandSuperSub(text) {
  // x^2 → x squared, x^3 → x cubed, x^n → x to the n
  return text
    .replace(/([A-Za-z0-9)])\^\{([^{}]+)\}/g, (_, base, exp) => `${base} to the ${exp}`)
    .replace(/([A-Za-z0-9)])\^(2)\b/g, '$1 squared')
    .replace(/([A-Za-z0-9)])\^(3)\b/g, '$1 cubed')
    .replace(/([A-Za-z0-9)])\^([A-Za-z0-9]+)/g, '$1 to the $2')
    .replace(/([A-Za-z0-9)])_\{([^{}]+)\}/g, '$1 sub $2')
    .replace(/([A-Za-z0-9)])_([A-Za-z0-9]+)/g, '$1 sub $2');
}

function stripMath(text) {
  // Replace KaTeX delimiters with their inner content, then expand macros.
  let out = text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, inner) => ` ${inner} `)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, inner) => ` ${inner} `)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, inner) => ` ${inner} `)
    .replace(/\$([^$\n]+)\$/g, (_, inner) => ` ${inner} `);
  for (const [pattern, replacement] of MATH_MACROS) {
    out = out.replace(pattern, replacement);
  }
  out = expandSuperSub(out);
  // Drop any stray remaining backslash commands so the TTS doesn't try to
  // pronounce "backslash frac".
  out = out.replace(/\\[A-Za-z]+\b/g, ' ');
  return out;
}

function stripMarkdown(text) {
  return text
    // Fenced code → speak the content but drop the fences.
    .replace(/```[a-zA-Z]*\n([\s\S]*?)```/g, '$1')
    // Inline code: keep the inside.
    .replace(/`([^`]+)`/g, '$1')
    // Images: drop entirely.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // Links: keep label, drop URL.
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Bold / italic / strike — drop the markers, keep the content.
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    // Headers: drop the leading #s.
    .replace(/^#+\s+/gm, '')
    // Blockquote / list markers.
    .replace(/^\s*[>*+-]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '');
}

// Pictographs, skin-tone modifiers, regional indicators (flags), the ZWJ
// that stitches compound emoji together, and the emoji-presentation
// variation selector. Kokoro otherwise tries to verbalize the codepoint
// (e.g. reads the smile emoji as "smiling face with smiling eyes").
const EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}‍️]/gu;

export default function normalizeForSpeech(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  let out = stripMath(raw);
  out = stripMarkdown(out);
  out = out.replace(EMOJI_RE, '');
  // Collapse runs of whitespace including newlines into single spaces so
  // the TTS doesn't insert long pauses where the original had layout
  // breaks but no semantic break.
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}
