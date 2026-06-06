import { ANNOTATION_COLOR_NAMES } from './annotationPalette.js';

// Tools exposed to Brain on every turn that has a doc attached. Brain is a
// multimodal model and sees every page of the worksheet directly in its
// user message, so the only tool it needs is `draw_annotation` — its bbox
// comes from Brain's own visual estimation.

const drawAnnotation = {
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

const brainTools = [drawAnnotation];

export default brainTools;
