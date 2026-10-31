import testAttack from '../../../../assets/attacks/test-attack.json';
import tealAttack from '../../../../assets/attacks/attack-teal.json';
import redAttack from '../../../../assets/attacks/attack-red.json';
import blueAttack from '../../../../assets/attacks/attack-blue.json';
import goldAttack from '../../../../assets/attacks/attack-gold.json';
import heroAttack from '../../../../assets/attacks/attack-hero.json';
import { getStatusEffect } from './status-effects/catalog';

/** A status effect an attack applies on hit. Shared immutable data. */
export interface AttackEffect { readonly typeId: string; readonly turns: number }

const attackAssets = { legacy: testAttack, teal: tealAttack, red: redAttack, blue: blueAttack, gold: goldAttack, hero: heroAttack } as const;
type AttackAsset = (typeof attackAssets)[keyof typeof attackAssets];

function createEffect(asset: AttackAsset): AttackEffect | undefined {
  const effect: { readonly typeId?: unknown; readonly turns?: unknown } | null = asset.effect;
  if (!effect) return undefined;
  const { typeId, turns } = effect;
  if (typeof typeId !== 'string' || !Number.isSafeInteger(turns) || (turns as number) <= 0) throw new Error('Invalid attack effect');
  getStatusEffect(typeId);
  return Object.freeze({ typeId, turns: turns as number });
}

/** Attack type data: damage and the effect applied on hit belong to the attack, not to the UI. */
export class AttackInfo {
  constructor(readonly typeId: string, readonly name: string, readonly damage: number, readonly effect?: AttackEffect) {
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(typeId) || !name.trim()) throw new Error('Invalid attack asset');
    if (!Number.isSafeInteger(damage) || damage < 0) throw new Error('Invalid attack damage');
    Object.freeze(this);
  }
}
const attacks: readonly AttackInfo[] = Object.freeze(Object.values(attackAssets).map(asset =>
  new AttackInfo(asset.typeId, asset.name, asset.damage, createEffect(asset))));
const catalog = new Map(attacks.map(attack => [attack.typeId, attack]));
if (catalog.size !== attacks.length) throw new Error('Duplicate attack type');

export function getAttackInfo(typeId: string): AttackInfo {
  const info = catalog.get(typeId);
  if (!info) throw new Error('Unknown attack');
  return info;
}
