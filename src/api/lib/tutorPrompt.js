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
        'An image is attached to this session. You cannot see it directly. ' +
        'Call the lookup_on_image tool whenever you need to read the page, ' +
        'check the student\'s answers, or find out what they have circled. ' +
        'Each call is one focused question — chain calls if you need more.'
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
