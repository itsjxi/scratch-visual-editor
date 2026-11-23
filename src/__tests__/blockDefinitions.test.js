import { describe, it, expect } from 'vitest';
import { BLOCK_DEFINITIONS, BLOCK_CATEGORIES } from '../config/blockDefinitions';
import { EXECUTION_HANDLERS } from '../engine/ExecutionHandlers';

const blocks = Object.entries(BLOCK_DEFINITIONS);

describe('block definitions (the data-driven contract)', () => {
  it.each(blocks)('%s has a matching id and a known category', (key, block) => {
    expect(block.id).toBe(key);
    expect(Object.values(BLOCK_CATEGORIES)).toContain(block.category);
  });

  it.each(blocks.filter(([, b]) => b.execution.handler))(
    '%s points at an existing execution handler',
    (_key, block) => {
      expect(typeof EXECUTION_HANDLERS[block.execution.handler]).toBe('function');
    },
  );

  it.each(blocks)('%s declares every input used in its label, with valid defaults', (_key, block) => {
    const labelInputs = [...block.label.matchAll(/\{input:(\w+)\}/g)].map((m) => m[1]);
    const declared = block.inputs.map((i) => i.name);
    expect(declared).toEqual(expect.arrayContaining(labelInputs));
    block.inputs.forEach((input) => {
      if (input.min !== undefined) expect(input.default).toBeGreaterThanOrEqual(input.min);
      if (input.max !== undefined) expect(input.default).toBeLessThanOrEqual(input.max);
    });
  });
});
