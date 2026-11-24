import { describe, it, expect } from 'vitest';
import { exampleProject, validateProject, validatePoses, ProjectError } from '../src/model/project';
import { loadSaved, STORAGE_KEY } from '../src/editor/store';

describe('project files', () => {
  it('round-trips the example project', () => {
    const { project } = exampleProject();
    expect(validateProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
  });

  it('rejects files that are not projects, with a reason', () => {
    expect(() => validateProject({ hello: 1 })).toThrow(ProjectError);
    expect(() => validateProject({ version: 1, sprites: [] })).toThrow('no sprites');
    const bad = { version: 1, sprites: [{ id: 's', name: 'S', scripts: [{ id: 'x', x: 0, y: 0, blocks: [{ id: 'b', opcode: 'deleteEverything', args: {} }] }] }] };
    expect(() => validateProject(bad)).toThrow('unknown opcode "deleteEverything"');
  });

  it('rejects duplicate block ids, which would make edits hit the wrong block', () => {
    const block = { id: 'same', opcode: 'move', args: { steps: 1 } };
    const dup = { version: 1, sprites: [{ id: 's', name: 'S', scripts: [{ id: 'x', x: 0, y: 0, blocks: [block, block] }] }] };
    expect(() => validateProject(dup)).toThrow('Duplicate block id');
  });

  it('repairs bad argument values and long names instead of failing', () => {
    const file = { version: 1, sprites: [{ id: 's', name: 'N'.repeat(100), scripts: [{ id: 'x', x: 0, y: 0, blocks: [{ id: 'b', opcode: 'move', args: { steps: 'lots' } }] }] }] };
    const project = validateProject(file);
    expect(project.sprites[0].name).toHaveLength(40);
    expect(project.sprites[0].scripts[0].blocks[0].args.steps).toBe(10);
    expect(validatePoses({}, project)).toEqual({ s: { x: -150, y: 0, direction: 90 } });
  });

  it('falls back to the example when the autosave is corrupt', () => {
    const storage = { getItem: (k: string) => (k === STORAGE_KEY ? '{not json' : null) };
    expect(loadSaved(storage).project.sprites.map((s) => s.name)).toEqual(['Cat', 'Cat 2']);
  });
});
