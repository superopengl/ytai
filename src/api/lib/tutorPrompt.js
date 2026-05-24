import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import db from '../db/index.js';
import { imageOcr } from '../db/schema.js';
import { ANNOTATION_COLOR_NAMES } from './annotationPalette.js';
import isSubject, { DEFAULT_SUBJECT, SUBJECTS } from './tutorSubject.js';

const PROMPTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../prompts'
);
const CATALOG_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../data/nswSyllabus.json'
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
// NSW K-10 Syllabus (2022) catalog — same file the post-session reporter
// uses. Injected into every turn's system prompt so Brain can name the
// outcome code, focus area, and stage/year when it wraps up a question.
const NSW_CATALOG_RAW = readFileSync(CATALOG_PATH, 'utf8');

export const GUIDANCE_LEVELS = Object.freeze(['guided', 'balanced', 'direct']);
export const DEFAULT_GUIDANCE_LEVEL = 'direct';

export function isGuidanceLevel(value) {
  return typeof value === 'string' && GUIDANCE_LEVELS.includes(value);
}

// Build the per-page OCR preview block Brain sees before every turn.
// One line per page, with the first ~6 OCR lines joined. Brain uses this
// to decide *which* page to drill into with lookup_on_image, and to spot
// cross-page references without burning a vision call.
async function buildDocManifest(activeDoc) {
  if (!activeDoc || !Array.isArray(activeDoc.pages) || activeDoc.pages.length === 0) {
    return null;
  }
  const pageIds = activeDoc.pages.map((p) => p.id);
  const ocrRows = await db()
    .select({
      imageId: imageOcr.imageId,
      status: imageOcr.status,
      lines: imageOcr.lines
    })
    .from(imageOcr)
    .where(inArray(imageOcr.imageId, pageIds));
  const ocrByPage = new Map(ocrRows.map((r) => [r.imageId, r]));

  const previews = activeDoc.pages.map((p) => {
    const ocr = ocrByPage.get(p.id);
    if (!ocr) return { page: p.pageNumber, preview: '(OCR not yet available)' };
    if (ocr.status !== 'ready') return { page: p.pageNumber, preview: `(OCR ${ocr.status})` };
    const lines = Array.isArray(ocr.lines) ? ocr.lines : [];
    if (lines.length === 0) return { page: p.pageNumber, preview: '(no printed text found)' };
    const preview = lines
      .slice(0, 8)
      .map((l) => (typeof l.text === 'string' ? l.text.trim() : ''))
      .filter(Boolean)
      .join(' / ');
    return { page: p.pageNumber, preview: preview || '(no readable text)' };
  });

  return previews;
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
    { role: 'system', content: PACE_BY_LEVEL[level] },
    {
      role: 'system',
      content:
        'NSW K-10 Syllabus (2022) outcome catalog — use this when wrapping up a question to ' +
        'name the curriculum outcome, focus area, and stage/year. Pick the single outcome whose ' +
        '`text` best matches the question. Use the exact `code` string. Stage 2 = Years 3–4, ' +
        'Stage 3 = Years 5–6, Stage 4 = Years 7–8.\n\n' +
        NSW_CATALOG_RAW
    }
  ];

  if (hasDoc) {
    const pageCount = activeDoc.pages.length;
    const manifest = await buildDocManifest(activeDoc);
    const manifestLines = (manifest || [])
      .map((m) => `  - Page ${m.page}: ${m.preview}`)
      .join('\n');
    const viewing =
      Number.isInteger(viewingPage) && viewingPage >= 1 && viewingPage <= pageCount
        ? viewingPage
        : null;

    messages.push({
      role: 'system',
      content:
        `The student is studying a ${pageCount}-page worksheet (the "current doc"). You cannot see ` +
        `it directly. Here is an OCR preview of every page:\n\n${manifestLines}\n\n` +
        (viewing
          ? `The student is currently looking at page ${viewing}. Default page-specific lookups ` +
            'to that page unless the question clearly references a different page.\n\n'
          : '') +
        'You have three tools:\n' +
        '\n' +
        `1. find_text_on_image({ query, end_query?, page? }) — fast OCR. Use FIRST whenever you ` +
        `want to point at printed text you already know the wording of. If \`page\` is omitted, ` +
        `the tool searches every page of the doc and returns the matching pages in its results. ` +
        `If you know which page, pass it to narrow the search. Returns a tight bounding box.\n` +
        '\n' +
        `2. lookup_on_image({ question, page }) — vision model. Use when you need to understand a ` +
        `page: what the questions are, what the student wrote, judging answers, interpreting ` +
        `diagrams or math notation, what the student circled. Returns a short text answer — no ` +
        `coordinates. Pass an explicit \`page\` (1..${pageCount}) — each call inspects ONE page. ` +
        `To draw on something you read this way, follow up with find_text_on_image using the exact ` +
        `wording you got back.\n` +
        '\n' +
        `3. draw_annotation({ shape, x1, y1, x2, y2, page, color?, label? }) — draws on a specific ` +
        `page. Pass the \`page\` (1..${pageCount}) the bbox belongs to. Coordinates are normalized ` +
        `0..1 corners within that page.\n` +
        '\n' +
        'Chain calls if you need more. Each call is one focused query.\n' +
        '\n' +
        'The student can draw freehand on the page — colored circles, underlines, highlights — ' +
        'to point at what they are stuck on. These marks DO show up to lookup_on_image (Eyes ' +
        'sees the flattened canvas, not the bare photo) and you should look for them whenever ' +
        'the student asks about "this", "what I circled", "the highlighted bit", or anything ' +
        'pointing at the page without naming printed text. find_text_on_image cannot see ' +
        'freehand marks — it reads printed text only — so for "what did I circle?" use ' +
        'lookup_on_image with a question like "What is enclosed by the colored freehand mark ' +
        'the student drew on this page?"\n' +
        '\n' +
        'Annotation is the default — almost every turn that references the page should call ' +
        'draw_annotation. But do not loop on OCR failures:\n' +
        '- Try find_text_on_image once with the most distinctive printed phrase. If it returns ' +
        '  no-match, try ONE more shorter or alternate phrase from the same area (a number, a ' +
        '  keyword). After two no-match results, give up on the annotation and just answer the ' +
        '  student in plain text — do not keep guessing queries.\n' +
        '- Never call lookup_on_image twice for the same thing. If you already learned what the ' +
        "  question says, move on — don't re-ask Eyes for confirmation."
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
          'visible to lookup_on_image — call it on that page with a question about the ' +
          "freehand mark (e.g. \"What did the student circle on this page? Describe what is " +
          'inside the colored freehand ring and quote any printed text it surrounds."). Do not ' +
          'tell the student you cannot see the mark — Eyes can. Once you know what is inside ' +
          'the mark, follow up with find_text_on_image on a distinctive phrase from that area ' +
          'and draw_annotation on the bbox to acknowledge it.'
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
