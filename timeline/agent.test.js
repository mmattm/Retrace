import test from 'node:test';
import assert from 'node:assert/strict';
import { agentSchema, validateAgentParameters, validateAgentResponse } from './agent.js';

const agent = {
  systemPrompt: 'Change only the number of squares.',
  parameters: { count: { type: 'integer', minimum: 1, maximum: 50 } },
};

test('the response schema exposes only the version’s declared parameters', () => {
  assert.deepEqual(agentSchema(agent), {
    type: 'object', properties: agent.parameters, required: ['count'], additionalProperties: false,
  });
  assert.deepEqual(validateAgentParameters(agent, { count: 12 }), { count: 12 });
  assert.deepEqual(validateAgentParameters(agent, { count: 1 }), { count: 1 });
  assert.deepEqual(validateAgentParameters(agent, { count: 50 }), { count: 50 });
});

test('invalid values and undeclared settings are rejected before reaching the sketch', () => {
  for (const values of [null, [], {}, { count: '12' }, { count: 12.5 }, { count: 0 },
    { count: 51 }, { count: NaN }, { count: Infinity }, { count: 12, speed: 1 }]) {
    assert.throws(() => validateAgentParameters(agent, values));
  }
});

test('invalid agent definitions fail before a model request can be made', () => {
  for (const invalid of [null, {}, { systemPrompt: '', parameters: agent.parameters },
    { systemPrompt: 'Change count.', parameters: {} },
    { systemPrompt: 'Change count.', parameters: { count: { type: 'integer', minimum: 50, maximum: 1 } } }]) {
    assert.throws(() => agentSchema(invalid));
  }
});

test('colors, layout choices and switches are validated without accepting arbitrary values', () => {
  const extended = {
    systemPrompt: 'Control the palette and layout.',
    parameters: {
      colorA: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      layout: { type: 'string', enum: ['grid', 'ring'] },
      filled: { type: 'boolean' },
    },
  };
  const valid = { colorA: '#12aBef', layout: 'ring', filled: false };
  assert.deepEqual(validateAgentParameters(extended, valid), valid);
  for (const changes of [{ colorA: 'red' }, { colorA: '#fff' }, { colorA: '#ffffff;code' },
    { colorA: 123 }, { layout: 'spiral' }, { filled: 'false' }, { filled: 0 }, { extra: 1 }]) {
    assert.throws(() => validateAgentParameters(extended, { ...valid, ...changes }));
  }
  for (const rule of [{ type: 'string' }, { type: 'string', enum: [] }, { type: 'string', enum: [1] },
    { type: 'string', pattern: '[' }, { type: 'object' }]) {
    assert.throws(() => agentSchema({ ...extended, parameters: { invalid: rule } }));
  }
});

test('drawing commands validate nested geometry and return an independent copy', () => {
  const drawing = {
    mode: 'drawing', systemPrompt: 'Draw paths, never code.',
    responseSchema: {
      type: 'object', additionalProperties: false, required: ['points', 'closed'],
      properties: {
        points: { type: 'array', minItems: 2, maxItems: 24, items: {
          type: 'object', additionalProperties: false, required: ['x', 'y'],
          properties: { x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 } },
        } },
        closed: { type: 'boolean' },
      },
    },
  };
  const valid = { points: [{ x: 0, y: 1 }, { x: 1, y: 0 }], closed: false };
  assert.equal(agentSchema(drawing), drawing.responseSchema);
  const result = validateAgentResponse(drawing, valid);
  assert.deepEqual(result, valid);
  result.points[0].x = 0.5;
  assert.equal(valid.points[0].x, 0);
  for (const changes of [
    { points: [] }, { points: Array(25).fill({ x: 0, y: 0 }) },
    { points: [{ x: -0.1, y: 0 }, { x: 1, y: 1 }] },
    { points: [{ x: 0, y: 0 }, { x: 1, y: Infinity }] },
    { points: [{ x: 0 }, { x: 1, y: 1 }] },
    { points: [{ x: 0, y: 0, code: 'draw()' }, { x: 1, y: 1 }] },
    { points: 'draw a triangle' }, { closed: 'false' }, { extra: true },
  ]) assert.throws(() => validateAgentResponse(drawing, { ...valid, ...changes }));
  for (const rule of [
    { type: 'array', minItems: 0, maxItems: Infinity, items: { type: 'boolean' } },
    { type: 'array', minItems: 3, maxItems: 2, items: { type: 'boolean' } },
    { type: 'array', minItems: 0, maxItems: 2 },
    { type: 'object', properties: { x: { type: 'boolean' } }, required: [], additionalProperties: false },
    { type: 'function' },
  ]) assert.throws(() => agentSchema({ ...agent, parameters: { invalid: rule } }));
});
