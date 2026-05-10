const drawingTools = [
  {
    type: 'function',
    function: {
      name: 'draw_annotation',
      description:
        'Draw a shape over the worksheet to point at exactly what you are talking about. ' +
        'Use this when referring to a specific question, a wrong answer, or a region the student should look at. ' +
        'Coordinates are normalized 0..1 relative to the image (0,0 = top-left, 1,1 = bottom-right). ' +
        'Prefer one annotation per turn. Do not draw if the student is asking a general or off-page question.',
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

export default drawingTools;
