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

export default function tutorPrompt({ visionJson } = {}) {
  const messages = [{ role: 'system', content: PERSONA }];

  if (visionJson) {
    messages.push({
      role: 'system',
      content: `Worksheet contents (JSON):\n${JSON.stringify(visionJson)}`
    });
  }

  return messages;
}
