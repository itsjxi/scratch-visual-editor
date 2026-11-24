import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/ui/App';
import { EditorStore } from '../src/editor/store';
import { Runtime } from '../src/runtime/runtime';
import { DragController } from '../src/ui/drag';
import { createBlock as b } from '../src/model/blocks';
import type { Project } from '../src/model/types';
import type { EditorServices } from '../src/ui/context';

function setup(project?: Project) {
  const p: Project = project ?? {
    version: 1,
    sprites: [{ id: 'cat', name: 'Cat', hue: 0, scripts: [{ id: 's1', x: 20, y: 20, blocks: [b('whenFlag'), b('move', { steps: 10 }), b('turnRight', { degrees: 15 })] }] }],
  };
  const store = new EditorStore(p);
  const runtime = new Runtime({ cat: { x: 0, y: 0, direction: 90 } });
  const services: EditorServices = { store, runtime, ensureLoop: () => {}, drag: new DragController(store) };
  const user = userEvent.setup();
  render(<App services={services} />);
  return { store, runtime, user };
}
const canvas = () => screen.getByRole('region', { name: /Scripts for/ });
const blocks = () => within(canvas()).getAllByRole('group').map((g) => g.getAttribute('aria-label'));
const live = () => document.querySelector('[aria-live="polite"]')!.textContent!.replace('​', '');

beforeEach(() => localStorage.clear());

describe('editor', () => {
  it('adds a block from the palette with the keyboard, and undoes it', async () => {
    const { user } = setup();
    const palette = screen.getByRole('navigation', { name: 'Blocks' });
    within(palette).getByRole('button', { name: /say Hello! for 2 seconds/ }).focus();
    await user.keyboard('{Enter}');
    expect(blocks().at(-1)).toBe('say Hello! for 2 seconds, 4 of 4');
    expect(live()).toBe('Added “say Hello! for 2 seconds”');

    await user.keyboard('{Control>}z{/Control}');
    expect(blocks()).toHaveLength(3);
    expect(live()).toBe('Undid add “say Hello! for 2 seconds”');
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(blocks()).toHaveLength(4);
  });

  it('a hat block from the palette starts a new script', async () => {
    const { user, store } = setup();
    await user.click(within(screen.getByRole('navigation', { name: 'Blocks' })).getByRole('button', { name: /when this sprite clicked/ }));
    expect(store.project.sprites[0].scripts).toHaveLength(2);
  });

  it('reorders and deletes blocks with the keyboard and keeps focus in the script', async () => {
    const { user } = setup();
    within(canvas()).getByRole('group', { name: /move 10 steps/ }).focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(blocks()).toEqual(['when green flag clicked, 1 of 3', 'turn right 15 degrees, 2 of 3', 'move 10 steps, 3 of 3']);
    expect(live()).toBe('Moved “move 10 steps” down');

    await user.keyboard('{Alt>}{ArrowUp}{ArrowUp}{/Alt}'); // can't go above the hat
    expect(live()).toBe('Can’t move “move 10 steps” further'.replace('’', "'"));

    await user.keyboard('{Delete}');
    expect(blocks()).toEqual(['when green flag clicked, 1 of 2', 'turn right 15 degrees, 2 of 2']);
    expect(live()).toMatch(/Deleted “move 10 steps”. Press Ctrl\+Z to undo./);
    await user.click(screen.getByRole('button', { name: 'Undo' })); // from the toast
    expect(blocks()).toHaveLength(3);
  });

  it('typing a number is one undo step, and invalid input is cleaned up on blur', async () => {
    const { user, store } = setup();
    const steps = within(canvas()).getByRole('textbox', { name: /steps for move 10 steps/ });
    await user.tripleClick(steps);
    await user.keyboard('250');
    expect(store.project.sprites[0].scripts[0].blocks[1].args.steps).toBe(250);
    await user.click(document.body);
    await user.keyboard('{Control>}z{/Control}');
    expect(store.project.sprites[0].scripts[0].blocks[1].args.steps).toBe(10);

    const field = within(canvas()).getByRole('textbox', { name: /steps for move 10 steps/ });
    await user.tripleClick(field);
    await user.keyboard('abc');
    await user.tab();
    expect(field).toHaveValue('10');
  });

  it('runs the program from the toolbar and the stage reflects it', async () => {
    const { user, runtime } = setup();
    await user.click(screen.getByRole('button', { name: 'Run (green flag)' }));
    act(() => runtime.step(16));
    expect(screen.getByRole('button', { name: 'Cat, x 10, y 0, direction 105' })).toBeInTheDocument();
  });

  it('adds, renames and deletes sprites; deleting is undoable', async () => {
    const { user, store } = setup();
    await user.click(screen.getByRole('button', { name: 'Add sprite' }));
    expect(store.project.sprites).toHaveLength(2);
    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Dog{Enter}');
    expect(store.project.sprites[1].name).toBe('Dog');
    await user.click(screen.getByRole('button', { name: 'Delete Dog' }));
    expect(store.project.sprites).toHaveLength(1);
    await user.keyboard('{Control>}z{/Control}');
    expect(store.project.sprites.map((s) => s.name)).toEqual(['Cat', 'Dog']);
  });

  it('refuses a broken project file and says why', async () => {
    const { user, store } = setup();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([JSON.stringify({ version: 1, sprites: [] })], 'bad.json', { type: 'application/json' });
    await user.upload(input, file);
    await waitFor(() => expect(document.querySelector('.toast-error')).toHaveTextContent('Couldn’t open the file: The project has no sprites'));
    expect(live()).toBe('Couldn’t open the file: The project has no sprites');
    expect(store.project.sprites[0].name).toBe('Cat');
  });
});
