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
              'Examples: "Question 3", "Name:", "Show your work below".'
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
        'Use this for anything that requires understanding the page — what the student wrote, ' +
        'whether an answer is right, what a diagram shows, what the student has circled/highlighted. ' +
        'For locating printed text you already know the wording of, prefer find_text_on_image — it ' +
        'is cheaper and its bboxes are tighter. ' +
        'Returns a short text answer and (when the question is locational) a normalized 0..1 corner ' +
        'bbox [x1, y1, x2, y2] (top-left + bottom-right). ' +
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
            description: 'CSS color, e.g. "#3aa0ff". Optional; a friendly blue is used by default.'
          }
        },
        required: ['shape', 'x1', 'y1', 'x2', 'y2']
      }
    }
  }
];

export default brainTools;
