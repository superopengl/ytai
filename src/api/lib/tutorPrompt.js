import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ANNOTATION_COLOR_NAMES } from './annotationPalette.js';

const PROMPTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../prompts'
);

function loadPrompt(name) {
  return readFileSync(path.join(PROMPTS_DIR, name), 'utf8').trimEnd();
}

// Loaded once at module init — edit the markdown files under
// src/api/prompts/ to change Brain's persona, pacing, or tool-use rules,
// then restart the server to pick up the change.
const PERSONA = loadPrompt('tutorPersona.md');
const PACE_BY_LEVEL = {
  guided: loadPrompt('tutorPace.guided.md'),
  balanced: loadPrompt('tutorPace.balanced.md'),
  direct: loadPrompt('tutorPace.direct.md')
};

export const GUIDANCE_LEVELS = Object.freeze(['guided', 'balanced', 'direct']);
export const DEFAULT_GUIDANCE_LEVEL = 'direct';

export function isGuidanceLevel(value) {
  return typeof value === 'string' && GUIDANCE_LEVELS.includes(value);
}

export default function tutorPrompt({ hasImage, usedColors = [], guidanceLevel } = {}) {
  const level = isGuidanceLevel(guidanceLevel) ? guidanceLevel : DEFAULT_GUIDANCE_LEVEL;
  const messages = [
    { role: 'system', content: PERSONA },
    { role: 'system', content: PACE_BY_LEVEL[level] }
  ];

  if (hasImage) {
    messages.push({
      role: 'system',
      content:
        'An image is attached to this session. You cannot see it directly. You have two tools to inspect it:\n' +
        '\n' +
        '1. find_text_on_image(query) — fast OCR. Use it FIRST whenever you want to point at ' +
        'printed text you already know the wording of (question numbers, prompts, headings, ' +
        'equations made of normal characters). It returns a tight bounding box.\n' +
        '\n' +
        '2. lookup_on_image(question) — vision model. Use it when you need to understand the page: ' +
        'what the questions are, what the student wrote, judging whether an answer is right, ' +
        'interpreting diagrams or math notation, or figuring out what the student has circled or ' +
        'highlighted. Returns a short text answer — no coordinates. To draw on something you read ' +
        'this way, follow up with find_text_on_image using the exact wording you got back.\n' +
        '\n' +
        'Chain calls if you need more. Each call is one focused query.\n' +
        '\n' +
        'Important: draw_annotation is OPTIONAL. The student\'s answer matters more than a mark on ' +
        'the page. If find_text_on_image returns no-match, pending, failed, or unavailable on your ' +
        'first try, do NOT keep retrying with reworded queries — just answer the student in plain ' +
        'text without an annotation. Two rules of thumb:\n' +
        '- If you already have the answer from lookup_on_image, REPLY TO THE STUDENT next. Skip ' +
        '  draw_annotation entirely if OCR can\'t find a bbox for it.\n' +
        '- Never call lookup_on_image twice for the same thing. If you already learned what the ' +
        '  question says, answer the student — do not re-ask Eyes for confirmation.'
    });

    const usedSet = new Set(
      (Array.isArray(usedColors) ? usedColors : []).map((c) => String(c).toLowerCase())
    );
    const used = ANNOTATION_COLOR_NAMES.filter((c) => usedSet.has(c));
    const free = ANNOTATION_COLOR_NAMES.filter((c) => !usedSet.has(c));
    const usedList = used.length > 0 ? used.join(', ') : 'none yet';
    // When every palette color has been used in a long session, "free" is
    // empty — fall back to the full palette so Brain still has options
    // rather than picking nothing.
    const freeList = (free.length > 0 ? free : ANNOTATION_COLOR_NAMES).join(', ');
    messages.push({
      role: 'system',
      content:
        'When you call draw_annotation:\n' +
        `- Colors used so far this session: ${usedList}.\n` +
        `- Colors still available: ${freeList}.\n` +
        '- Pick a `color` from the AVAILABLE list so each mark stands apart from the previous ones. ' +
        'Only repeat a used color if every color has been used.\n' +
        '- Always provide a short `label` naming what you are pointing at (e.g. "Question 3", ' +
        '"the + sign", "wrong answer"). The student sees this caption beside the mark on the page.\n' +
        '- In the same message, include one short sentence telling the student which color you used ' +
        'and why, e.g. "I\'ve put a yellow highlight on question 3 so you can see what we\'re looking at." ' +
        'Keep it to a single sentence; do not list every previous color or apologize.'
    });
  } else {
    messages.push({
      role: 'system',
      content:
        'No image has been uploaded yet. If the student asks about a worksheet, ' +
        'ask them kindly to upload a clear photo first.'
    });
  }

  return messages;
}
