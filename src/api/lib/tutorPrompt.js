import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ANNOTATION_COLOR_NAMES } from './annotationPalette.js';

const PERSONA_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../prompts/tutorPersona.md'
);

// Loaded once at module init — edit src/api/prompts/tutorPersona.md to change
// Brain's persona, boundaries, or tool-use rules; restart the server to pick
// up the change.
const PERSONA = readFileSync(PERSONA_PATH, 'utf8').trimEnd();

export default function tutorPrompt({ hasImage, usedColors = [] } = {}) {
  const messages = [{ role: 'system', content: PERSONA }];

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
        'Chain calls if you need more. Each call is one focused query.'
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
