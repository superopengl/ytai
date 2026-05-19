import { ANNOTATION_COLOR_NAMES } from './annotationPalette.js';

// Tools exposed to Brain (the chat model) on every turn that has an image
// attached to the session.
//
// Reach for them in this order:
//   1. find_text_on_image — cheap, fast, tight bboxes from EasyOCR. Use
//      whenever you already know the printed text you want to point at.
//   2. lookup_on_image    — Qwen2.5-VL. Use for semantic reading: what the
//      student wrote, what a diagram shows, whether an answer is right.
//   3. draw_annotation    — draws on the page using a bbox you already have.

const brainTools = [
  {
    type: 'function',
    function: {
      name: 'find_text_on_image',
      description:
        'Find printed text on the worksheet and return its tight bounding box. ' +
        'Prefer this over lookup_on_image when you already know the exact words you want to locate ' +
        '("Question 3", "x + 5 = 12", "Show your work"). It is cheap, deterministic, and returns ' +
        'tighter coordinates than the vision model. Returns up to 5 best matches and a unionBbox ' +
        'covering them all (normalized 0..1 corners [x1, y1, x2, y2], top-left + bottom-right). ' +
        'For multi-line blocks (a whole question, a worked solution), also pass `end_query` with a ' +
        'distinctive phrase from the LAST line — the tool then returns one unionBbox spanning the ' +
        'whole region (every line in between is included, even when the middle lines are wider than ' +
        'the anchor rows). For a single-line target, omit `end_query`. ' +
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
        'Look at the worksheet photo and answer a specific question about it. ' +
        'Use this for understanding the page — what the questions are, what the student wrote, ' +
        'whether an answer is right, what a diagram shows, what the student has circled/highlighted. ' +
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
              'The natural-language question to ask about the image. ' +
              'Examples: "Read every question on the page and list them numbered.", ' +
              '"What did the student write as the answer to question 3?", ' +
              '"Where is question 3 on the page?", ' +
              '"What has the student circled or underlined?".'
          }
        },
        required: ['question']
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
        'Coordinates are normalized 0..1 corners: x1,y1 = top-left, x2,y2 = bottom-right (0,0 is the top-left of the image, 1,1 is the bottom-right). ' +
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
        required: ['shape', 'x1', 'y1', 'x2', 'y2']
      }
    }
  }
];

export default brainTools;
