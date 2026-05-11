// Tools exposed to Brain (the chat model) on every turn that has an image
// attached to the session. Brain calls lookup_on_image whenever it needs to
// know something on the page; the server runs Qwen2.5-VL on the current
// image bytes and feeds the answer back. draw_annotation then lets Brain
// point at the page using a normalized 0..1 bbox — usually one it just
// received from a lookup_on_image call.

const brainTools = [
  {
    type: 'function',
    function: {
      name: 'lookup_on_image',
      description:
        'Look at the worksheet photo and answer a specific question about it. ' +
        'Use this whenever you need to know what is printed on the page, what the student wrote, ' +
        'whether an answer is right, where something is on the page, or what the student has circled/highlighted with their pen. ' +
        'Returns a short text answer and (when the question is locational) a normalized 0..1 bounding box. ' +
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
        'Use this AFTER lookup_on_image gave you a bounding box, or when you already know the coordinates. ' +
        'Coordinates are normalized 0..1 relative to the image (0,0 = top-left, 1,1 = bottom-right). ' +
        'Prefer one annotation per turn. Skip this tool for general or off-page questions.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          shape: {
            type: 'string',
            enum: ['circle', 'rect', 'highlight'],
            description:
              'circle = ring around a single answer or symbol; rect = outline a question or block of text; highlight = translucent fill over a region.'
          },
          x: { type: 'number', minimum: 0, maximum: 1, description: 'Top-left x in 0..1.' },
          y: { type: 'number', minimum: 0, maximum: 1, description: 'Top-left y in 0..1.' },
          width: { type: 'number', minimum: 0, maximum: 1, description: 'Width in 0..1.' },
          height: { type: 'number', minimum: 0, maximum: 1, description: 'Height in 0..1.' },
          color: {
            type: 'string',
            description: 'CSS color, e.g. "#3aa0ff". Optional; a friendly blue is used by default.'
          },
          label: {
            type: 'string',
            description: 'Optional short caption (≤ 24 chars) shown next to the shape.'
          }
        },
        required: ['shape', 'x', 'y', 'width', 'height']
      }
    }
  }
];

export default brainTools;
