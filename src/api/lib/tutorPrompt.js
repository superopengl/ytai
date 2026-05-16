import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PERSONA_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../prompts/tutorPersona.md'
);

// Loaded once at module init — edit src/api/prompts/tutorPersona.md to change
// Brain's persona, boundaries, or tool-use rules; restart the server to pick
// up the change.
const PERSONA = readFileSync(PERSONA_PATH, 'utf8').trimEnd();

export default function tutorPrompt({ hasImage } = {}) {
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
        'reading the student\'s handwriting, judging whether an answer is right, interpreting diagrams ' +
        'or math notation, or figuring out what the student has circled or highlighted. Also use it as ' +
        'a fallback when find_text_on_image returns status "no-match", "pending", "failed", or "unavailable".\n' +
        '\n' +
        'Chain calls if you need more. Each call is one focused query.'
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
