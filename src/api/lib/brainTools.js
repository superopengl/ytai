import { ANNOTATION_COLOR_NAMES } from './annotationPalette.js';

// Tools exposed to Brain (the chat model) on every turn that has a doc
// attached to the session. The current doc has 1..N pages; tools take an
// optional `page` parameter to narrow to a specific page.
//
// Reach for them in this order:
//   1. find_text_on_image — cheap, fast, tight bboxes from EasyOCR. Use
//      whenever you already know the printed text you want to point at.
//      Searches all pages by default; pass `page` to narrow.
//   2. lookup_on_image    — Qwen2.5-VL. Use for semantic reading: what the
//      student wrote, what a diagram shows, whether an answer is right.
//      Inspects ONE page per call — `page` is required.
//   3. draw_annotation    — draws on a specific page using a bbox you
//      already have.

// Unified-vision tool list — exposed when YTAI_UNIFIED_VISION=true and Brain
// is a multimodal model that sees the worksheet directly in its user
// message. There is no OCR sidecar and no separate Eyes call; Brain reads
// the page itself, so find_text_on_image and lookup_on_image are gone.
// Only draw_annotation survives, and its bbox now comes from Brain's own
// visual estimation rather than a tightly-snapped OCR line.
const unifiedDrawAnnotation = {
  type: 'function',
  function: {
    name: 'draw_annotation',
    description:
      'Draw a shape over the worksheet to point at exactly what you are talking about. ' +
      'You can see the worksheet directly in the user message — estimate the bbox yourself from ' +
      'what you see. Pass the `page` (1..N) the bbox belongs to — coordinates are normalized ' +
      '0..1 corners within that page (x1,y1 = top-left, x2,y2 = bottom-right of that page; ' +
      '0,0 is top-left, 1,1 is bottom-right). ' +
      'Default to shape="highlight" — a soft semi-transparent fill is forgiving of slight bbox ' +
      'inaccuracy and reads as a tutor sweeping a marker over the text. Only pick a different ' +
      'shape when the student explicitly asks for it. ' +
      'Prefer one annotation per turn. Skip this tool for general or off-page questions.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        shape: {
          type: 'string',
          enum: ['highlight', 'circle', 'rect'],
          description:
            'highlight = soft translucent fill sweeping across a region (DEFAULT); ' +
            'circle = ring around a single answer or symbol; ' +
            'rect = outline a question or block of text.'
        },
        page: {
          type: 'integer',
          minimum: 1,
          description:
            'Which page of the current doc the bbox belongs to (1..N). For a single-page doc, pass 1.'
        },
        x1: { type: 'number', minimum: 0, maximum: 1, description: 'Top-left x in 0..1.' },
        y1: { type: 'number', minimum: 0, maximum: 1, description: 'Top-left y in 0..1.' },
        x2: { type: 'number', minimum: 0, maximum: 1, description: 'Bottom-right x in 0..1.' },
        y2: { type: 'number', minimum: 0, maximum: 1, description: 'Bottom-right y in 0..1.' },
        color: {
          type: 'string',
          enum: [...ANNOTATION_COLOR_NAMES],
          description:
            'Color name from the fixed palette. Pick one you have NOT used yet in this session ' +
            'so consecutive marks are easy to tell apart. The system message lists which colors ' +
            'have already been used and which are still free. Optional — if omitted, an unused ' +
            'palette color is auto-assigned.'
        },
        label: {
          type: 'string',
          description:
            'Short caption shown next to the mark — the name of the thing you are pointing at. ' +
            'Keep it under 30 characters. Examples: "Question 3", "the + sign", "wrong answer". ' +
            'Optional but strongly encouraged.'
        }
      },
      required: ['shape', 'page', 'x1', 'y1', 'x2', 'y2']
    }
  }
};

export const unifiedBrainTools = [unifiedDrawAnnotation];

const brainTools = [
  {
    type: 'function',
    function: {
      name: 'find_text_on_image',
      description:
        'Find printed text on the worksheet and return its tight bounding box. ' +
        'Prefer this over lookup_on_image when you already know the exact words you want to locate ' +
        '("Question 3", "x + 5 = 12", "Show your work"). It is cheap, deterministic, and returns ' +
        'tighter coordinates than the vision model. ' +
        'Searches every page of the current doc by default — each match in the result carries the ' +
        '`page` it was found on. Pass `page` to restrict to one page when you already know which. ' +
        'Returns up to 5 best matches and a unionBbox covering them (normalized 0..1 corners ' +
        '[x1, y1, x2, y2], top-left + bottom-right). ' +
        'For multi-line blocks (a whole question, a worked solution), also pass `end_query` with a ' +
        'distinctive phrase from the LAST line — the tool then returns one unionBbox spanning the ' +
        'whole region. Start and end anchor must both be on the same page; the search picks the ' +
        'page where both are found. ' +
        'For a single-line target, omit `end_query`. ' +
        'If status is "no-match", "pending", "failed", or "unavailable", fall back to lookup_on_image. ' +
        'Does not read handwriting, math notation, or diagrams — use lookup_on_image for those.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: {
            type: 'string',
            description:
              'The exact printed text (or a distinctive phrase from it) to find on the page. ' +
              'For a multi-line region, this is the FIRST line\'s phrase. ' +
              'Examples: "Question 3", "Name:", "Daniel has 24 pens".'
          },
          end_query: {
            type: 'string',
            description:
              'Optional. A distinctive phrase from the LAST line of a multi-line region (a whole ' +
              'question, a worked solution block). When provided, the tool returns a unionBbox ' +
              'spanning from the start phrase down to this end phrase, covering every line in between. ' +
              'Omit for a single-line target. Examples: "have at first?", "= 47", "Show your work".'
          },
          page: {
            type: 'integer',
            minimum: 1,
            description:
              'Optional. Narrow the search to a specific page number (1..N) of the current doc. ' +
              'Omit to search every page. The doc manifest in the system prompt lists which page ' +
              'is which.'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'lookup_on_image',
      description:
        'Look at one page of the worksheet and answer a specific question about it. ' +
        'Use this for understanding the page — what the questions are, what the student wrote, ' +
        'whether an answer is right, what a diagram shows, what the student has circled/highlighted. ' +
        'Each call inspects ONE page; pass the page number explicitly. ' +
        'Returns a short text answer only — NO coordinates. ' +
        'For locating something on the page (so you can draw on it), use find_text_on_image — that is ' +
        'the only tool that returns bounding boxes. ' +
        'Ask one focused question per call.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          question: {
            type: 'string',
            description:
              'The natural-language question to ask about the page. ' +
              'Examples: "Read every question on the page and list them numbered.", ' +
              '"What did the student write as the answer to question 3?", ' +
              '"Where is question 3 on the page?", ' +
              '"What has the student circled or underlined?".'
          },
          page: {
            type: 'integer',
            minimum: 1,
            description:
              'Which page of the current doc to inspect (1..N). The doc manifest in the system ' +
              'prompt tells you what is on each page. Pick the one whose OCR preview matches what ' +
              'the student is asking about.'
          }
        },
        required: ['question', 'page']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'draw_annotation',
      description:
        'Draw a shape over the worksheet to point at exactly what you are talking about. ' +
        'Use this AFTER find_text_on_image or lookup_on_image gave you a bounding box, or when you already know the coordinates. ' +
        'Pass the `page` (1..N) the bbox belongs to — coordinates are normalized 0..1 corners ' +
        'within that page (x1,y1 = top-left, x2,y2 = bottom-right of that page; 0,0 is top-left, ' +
        '1,1 is bottom-right). ' +
        'Pass the bbox you received from a lookup straight through — it is already in this format. ' +
        'Default to shape="highlight" — a soft semi-transparent fill is forgiving of slight bbox inaccuracy and reads as a tutor sweeping a marker over the text. ' +
        'Only pick a different shape when the student explicitly asks for it (e.g. "circle question 3", "draw a box around it"). ' +
        'Prefer one annotation per turn. Skip this tool for general or off-page questions.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          shape: {
            type: 'string',
            enum: ['highlight', 'circle', 'rect'],
            description:
              'highlight = soft translucent fill sweeping across a region (DEFAULT — use this unless the student asks for something else); ' +
              'circle = ring around a single answer or symbol; ' +
              'rect = outline a question or block of text.'
          },
          page: {
            type: 'integer',
            minimum: 1,
            description:
              'Which page of the current doc the bbox belongs to (1..N). For a single-page doc, ' +
              'pass 1. For multi-page docs, use the page returned by find_text_on_image, or the ' +
              'page you just called lookup_on_image against.'
          },
          x1: { type: 'number', minimum: 0, maximum: 1, description: 'Top-left x in 0..1.' },
          y1: { type: 'number', minimum: 0, maximum: 1, description: 'Top-left y in 0..1.' },
          x2: { type: 'number', minimum: 0, maximum: 1, description: 'Bottom-right x in 0..1.' },
          y2: { type: 'number', minimum: 0, maximum: 1, description: 'Bottom-right y in 0..1.' },
          color: {
            type: 'string',
            enum: [...ANNOTATION_COLOR_NAMES],
            description:
              'Color name from the fixed palette. Pick one you have NOT used yet in this session ' +
              'so consecutive marks are easy to tell apart. The system message lists which colors ' +
              'have already been used and which are still free. Optional — if omitted, an unused ' +
              'palette color is auto-assigned.'
          },
          label: {
            type: 'string',
            description:
              'Short caption shown next to the mark — the name of the thing you are pointing at. ' +
              'Keep it under 30 characters. Examples: "Question 3", "the + sign", "wrong answer", ' +
              '"12 × 4". This is what the student will read on the page beside the highlight. ' +
              'Optional but strongly encouraged.'
          }
        },
        required: ['shape', 'page', 'x1', 'y1', 'x2', 'y2']
      }
    }
  }
];

export default brainTools;
