import asset from '../../../../assets/enemies/camera-visuals.json';
import { enemyCatalog, getEnemyInfo, type EnemyInfo } from './enemy';

function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeDeep); Object.freeze(value); }
  return value;
}
export function createEnemyVisualCatalog(data: typeof asset) {
  const ids = (entries: readonly { id: string }[]) => {
    if (new Set(entries.map(e => e.id)).size !== entries.length || entries.some(e => !e.id)) throw new Error('Invalid visual IDs');
  };
  const image = (path: string) => { if (!/^images\/enemies\/[a-zA-Z0-9._-]+\.png$/.test(path)) throw new Error('Invalid visual image'); };
  ids(data.sockets); ids(data.modules);
  if (![data.cameraSize.width, data.cameraSize.height, data.displayScale].every(n => Number.isFinite(n) && n > 0)) throw new Error('Invalid visual size');
  data.sockets.forEach(s => { if (![s.x, s.y].every(Number.isFinite)) throw new Error('Invalid socket'); });
  data.modules.forEach(m => {
    image(m.image);
    if (![m.width, m.height, m.scale].every(n => Number.isFinite(n) && n > 0) || ![m.pivot.x, m.pivot.y].every(Number.isFinite)) throw new Error('Invalid module geometry');
  });
  if (data.variants.length !== enemyCatalog.length || new Set(data.variants.map(v => v.typeId)).size !== data.variants.length) throw new Error('Invalid visual types');
  const result = data.variants.map(variant => {
    const info = getEnemyInfo(variant.typeId); image(variant.image);
    const usedSockets = new Set<string>();
    variant.attachments.forEach(a => {
      if (!data.modules.some(m => m.id === a.moduleId) || !data.sockets.some(s => s.id === a.socketId) || usedSockets.has(a.socketId)) throw new Error('Invalid attachment');
      usedSockets.add(a.socketId);
      const module = data.modules.find(m => m.id === a.moduleId)!;
      if (module.requiredRole !== info.role || module.requiredLayer !== info.Placement.Value) throw new Error('Module incompatible with enemy');
    });
    return freezeDeep({ typeId: variant.typeId, image: variant.image, cameraSize: { ...data.cameraSize }, displayScale: data.displayScale,
      sockets: structuredClone(data.sockets), modules: structuredClone(data.modules), attachments: structuredClone(variant.attachments) });
  });
  return Object.freeze(result);
}
export const enemyVisualCatalog = createEnemyVisualCatalog(asset);
export function getEnemyVisualInfo(typeId: string) {
  const visual = enemyVisualCatalog.find(v => v.typeId === typeId);
  if (!visual) throw new Error(`Unknown enemy visual: ${typeId}`);
  return visual;
}
/** One composition resolver for canvas, DOM, previews and bounds; coordinates use source pixels. */
export function createEnemyVisualLayout(info: EnemyInfo) {
  const visual = getEnemyVisualInfo(info.typeId);
  const parts = visual.attachments.map(attachment => {
    const module = visual.modules.find(m => m.id === attachment.moduleId)!;
    if (module.requiredRole !== info.role || module.requiredLayer !== info.Placement.Value) throw new Error('Module incompatible with enemy');
    const socket = visual.sockets.find(s => s.id === attachment.socketId)!;
    return { id: module.id, image: module.image, x: socket.x - module.pivot.x * module.scale, y: socket.y - module.pivot.y * module.scale,
      width: module.width * module.scale, height: module.height * module.scale };
  });
  parts.push({ id: 'camera', image: visual.image, x: 0, y: 0, width: visual.cameraSize.width, height: visual.cameraSize.height });
  const left = Math.min(...parts.map(p => p.x)), top = Math.min(...parts.map(p => p.y));
  const right = Math.max(...parts.map(p => p.x + p.width)), bottom = Math.max(...parts.map(p => p.y + p.height));
  return { typeId: info.typeId, displayScale: visual.displayScale, parts, bounds: { x: left, y: top, width: right - left, height: bottom - top } };
}
