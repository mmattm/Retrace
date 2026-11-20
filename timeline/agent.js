// Model responses are data, constrained by the selected version's JSON schema.
function validateRule(rule) {
  if (!rule) throw new Error('Invalid agent parameter.');
  if (rule.type === 'object') {
    if (!rule.properties || typeof rule.properties !== 'object' || Array.isArray(rule.properties)
        || !Object.keys(rule.properties).length || rule.additionalProperties !== false
        || !Array.isArray(rule.required) || rule.required.length !== Object.keys(rule.properties).length
        || Object.keys(rule.properties).some(key => !rule.required.includes(key))) {
      throw new Error('Agent objects must declare every property and reject additional properties.');
    }
    Object.values(rule.properties).forEach(validateRule);
  } else if (rule.type === 'array') {
    if (!Number.isInteger(rule.minItems) || !Number.isInteger(rule.maxItems)
        || rule.minItems < 0 || rule.minItems > rule.maxItems) {
      throw new Error('Agent arrays must have valid length bounds.');
    }
    validateRule(rule.items);
  } else if (['integer', 'number'].includes(rule.type)) {
    if (!Number.isFinite(rule.minimum) || !Number.isFinite(rule.maximum) || rule.minimum > rule.maximum) {
      throw new Error('Numeric agent parameters must have valid bounds.');
    }
  } else if (rule.type === 'string') {
    if (rule.enum !== undefined && (!Array.isArray(rule.enum) || !rule.enum.length
        || !rule.enum.every(value => typeof value === 'string'))) {
      throw new Error('String choices must be a non-empty list.');
    }
    if (rule.pattern !== undefined) {
      if (typeof rule.pattern !== 'string' || !rule.pattern.length) throw new Error('Invalid string pattern.');
      new RegExp(rule.pattern);
    }
    if (!rule.enum && !rule.pattern) throw new Error('String agent parameters require choices or a pattern.');
  } else if (rule.type !== 'boolean') throw new Error('Unsupported agent parameter type.');
}

export function agentSchema(agent) {
  if (!agent || typeof agent.systemPrompt !== 'string' || !agent.systemPrompt.trim()) {
    throw new Error('This version has an invalid agent configuration.');
  }
  const schema = agent.mode === 'drawing' ? agent.responseSchema : {
    type: 'object', properties: agent.parameters,
    required: Object.keys(agent.parameters ?? {}), additionalProperties: false,
  };
  if (schema?.type !== 'object') throw new Error('Agent responses must be objects.');
  validateRule(schema);
  return schema;
}

function validateValue(rule, value, path) {
  if (rule.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).length !== rule.required.length
        || Object.keys(value).some(key => !Object.hasOwn(rule.properties, key))) {
      throw new Error(`Unexpected properties in ${path}.`);
    }
    for (const [key, child] of Object.entries(rule.properties)) validateValue(child, value[key], `${path}.${key}`);
  } else if (rule.type === 'array') {
    if (!Array.isArray(value) || value.length < rule.minItems || value.length > rule.maxItems) {
      throw new Error(`Invalid ${path}: expected ${rule.minItems}–${rule.maxItems} items.`);
    }
    value.forEach((item, i) => validateValue(rule.items, item, `${path}[${i}]`));
  } else if (rule.type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`Invalid ${path}: expected a boolean.`);
  } else if (rule.type === 'string') {
    if (typeof value !== 'string' || (rule.enum && !rule.enum.includes(value))
        || (rule.pattern && !new RegExp(rule.pattern).test(value))) {
      throw new Error(`Invalid ${path}: expected a declared choice or matching string.`);
    }
  } else if (!Number.isFinite(value) || (rule.type === 'integer' && !Number.isInteger(value))
      || value < rule.minimum || value > rule.maximum) {
    throw new Error(`Invalid ${path}: expected ${rule.type} between ${rule.minimum} and ${rule.maximum}.`);
  }
}

export function validateAgentResponse(agent, values) {
  validateValue(agentSchema(agent), values, 'response');
  return structuredClone(values);
}

// Keep the original public helper for existing parameter-agent integrations.
export { validateAgentResponse as validateAgentParameters };
