import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ANNOTATION_COLOR_NAMES } from './annotationPalette.js';
import isSubject, { DEFAULT_SUBJECT, SUBJECTS } from './tutorSubject.js';

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
// Per-subject system prompts. One file per subject under prompts/subjects/.
// Injected after the generic persona so subject-specific guidance (math
// notation, reading evidence anchoring, writing planning, etc.) layers on
// top of the shared teaching rules without duplicating them.
const SUBJECT_PROMPTS = Object.fromEntries(
  SUBJECTS.map((s) => [s, loadPrompt(`subjects/${s}.md`)])
);

export const GUIDANCE_LEVELS = Object.freeze(['guided', 'balanced', 'direct']);
export const DEFAULT_GUIDANCE_LEVEL = 'direct';

export function isGuidanceLevel(value) {
  return typeof value === 'string' && GUIDANCE_LEVELS.includes(value);
}

export default async function tutorPrompt({
  activeDoc,
  viewingPage,
  usedColors = [],
  guidanceLevel,
  subject,
  annotatedPages = []
} = {}) {
  const level = isGuidanceLevel(guidanceLevel) ? guidanceLevel : DEFAULT_GUIDANCE_LEVEL;
  const subjectKey = isSubject(subject) ? subject : DEFAULT_SUBJECT;
  const hasDoc = !!activeDoc && Array.isArray(activeDoc.pages) && activeDoc.pages.length > 0;
  const messages = [
    { role: 'system', content: PERSONA },
    { role: 'system', content: SUBJECT_PROMPTS[subjectKey] },
    { role: 'system', content: PACE_BY_LEVEL[level] }
  ];

  if (hasDoc) {
    const pageCount = activeDoc.pages.length;
    const viewing =
      Number.isInteger(viewingPage) && viewingPage >= 1 && viewingPage <= pageCount
        ? viewingPage
        : null;

    messages.push({
      role: 'system',
      content:
        `The student is studying a ${pageCount}-page worksheet (the "current doc"). You can see ` +
        `every page directly — each page is attached as an image in the user message, labeled ` +
        `"Worksheet (page N of ${pageCount}):". Read the printed text, the student's handwriting, ` +
        `any diagrams, and any freehand marks the student drew, straight from the images.\n` +
        '\n' +
        (viewing
          ? `The student is currently looking at page ${viewing}. Bias your attention toward ` +
            'that page unless the question clearly references a different one.\n\n'
          : '') +
        'You have one tool:\n' +
        '\n' +
        `1. draw_annotation({ shape, x1, y1, x2, y2, page, color?, label? }) — draws on a specific ` +
        `page. Pass the \`page\` (1..${pageCount}) the bbox belongs to. Coordinates are normalized ` +
        `0..1 corners within that page (0,0 = top-left, 1,1 = bottom-right). Estimate the bbox ` +
        `from what you see in the image.\n` +
        '\n' +
        'The student can draw freehand on the page — colored circles, underlines, highlights — ' +
        'to point at what they are stuck on. Those marks are baked into the page image you see, ' +
        'so read them as the student pointing at exactly what they want help with.\n' +
        '\n' +
        'Annotation is the default — almost every turn that references the page should call ' +
        'draw_annotation. Skip it for general or off-page questions. Do not narrate a highlight ' +
        'unless you actually called draw_annotation.'
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
    // Surface the per-turn signal that the student just drew on the page,
    // so Brain doesn't pattern-match its older "I see no red marks" replies.
    const annotatedList = Array.isArray(annotatedPages)
      ? annotatedPages.filter((n) => Number.isInteger(n) && n >= 1)
      : [];
    if (annotatedList.length > 0) {
      const pageList =
        annotatedList.length === 1
          ? `page ${annotatedList[0]}`
          : `pages ${annotatedList.join(', ')}`;
      messages.push({
        role: 'system',
        content:
          `Heads up: the student drew freehand on ${pageList} for THIS turn. Their mark is ` +
          'baked into the page image you can see — read what they circled or highlighted ' +
          'directly from the image. Do not tell the student you cannot see the mark. Then ' +
          'call draw_annotation to acknowledge it with your own bbox over the same region.'
      });
    }

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
        'No worksheet has been uploaded yet. If the student asks about a worksheet, ' +
        'ask them kindly to upload a clear photo first.'
    });
  }

  return messages;
}
