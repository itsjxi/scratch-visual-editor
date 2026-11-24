import { useEffect, useState } from 'react';
import { useEditor } from '../editor/store';
import { newSprite } from '../model/project';
import { addSprite, deleteSprite, renameSprite } from '../model/tree';
import CatSprite from './CatSprite';
import { useServices } from './context';
import { useRuntime } from './hooks';
import { CloseIcon, PlusIcon } from './icons';

export function SpritePanel() {
  const { store, runtime } = useServices();
  const project = useEditor(store, (s) => s.history.present);
  const selectedId = useEditor(store, (s) => s.selectedSpriteId);
  const snapshot = useRuntime();
  const selected = project.sprites.find((s) => s.id === selectedId)!;
  const pose = snapshot.sprites[selectedId];
  const [name, setName] = useState(selected.name);
  useEffect(() => setName(selected.name), [selected.name]);

  const add = () => {
    const sprite = newSprite(project.sprites.length);
    store.edit((p) => addSprite(p, sprite), `add sprite ${sprite.name}`, { announce: `Added ${sprite.name}` });
    store.selectSprite(sprite.id);
  };

  const pose3 = (field: 'x' | 'y' | 'direction', raw: string) => {
    const value = Number(raw);
    if (Number.isFinite(value)) runtime.setPose(selectedId, { [field]: value });
  };

  return (
    <section className="sprite-panel" aria-labelledby="sprite-panel-title">
      <div className="sprite-panel-head">
        <h2 id="sprite-panel-title">Sprites</h2>
        <button type="button" className="btn btn-quiet" onClick={add}><PlusIcon /> Add sprite</button>
      </div>

      <ul className="sprite-list">
        {project.sprites.map((sprite) => (
          <li key={sprite.id} className={`sprite-card${sprite.id === selectedId ? ' is-selected' : ''}`}>
            <button type="button" className="sprite-card-main" aria-pressed={sprite.id === selectedId} onClick={() => store.selectSprite(sprite.id)}>
              <CatSprite size={34} style={{ filter: sprite.hue ? `hue-rotate(${sprite.hue}deg)` : undefined }} />
              <span>{sprite.name}</span>
            </button>
            {project.sprites.length > 1 && (
              <button type="button" className="icon-button" aria-label={`Delete ${sprite.name}`}
                onClick={() => store.edit((p) => deleteSprite(p, sprite.id), `delete sprite ${sprite.name}`, { toast: `Deleted ${sprite.name}` })}>
                <CloseIcon />
              </button>
            )}
          </li>
        ))}
      </ul>

      {pose && (
        <div className="sprite-fields">
          <label className="field field-name">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)}
              onBlur={() => store.edit((p) => renameSprite(p, selectedId, name), `rename ${selected.name}`)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
          </label>
          {(['x', 'y', 'direction'] as const).map((field) => (
            <label key={field} className="field">
              <span>{field === 'direction' ? 'Direction' : field}</span>
              <input key={Math.round(pose[field])} defaultValue={Math.round(pose[field])} inputMode="decimal"
                onBlur={(e) => pose3(field, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
