import { NPC } from '../domain/npc';
import { TypeNPCParameter } from '../domain/parameters';

const labels: Readonly<Record<TypeNPCParameter, string>> = Object.freeze({
  [TypeNPCParameter.Health]: 'Здоровье',
  [TypeNPCParameter.Armor]: 'Броня',
  [TypeNPCParameter.Damage]: 'Урон',
});

export const visualNPCInfos = Object.freeze({
  'npc.trainee': Object.freeze({ typeId: 'npc.trainee', tint: 0x79e0b6 }),
});

/** One evaluated view for the canvas and DOM panels. No local stat formulas. */
export function createNPCView(npc: NPC) {
  const visual = visualNPCInfos[npc.typeId as keyof typeof visualNPCInfos];
  if (!visual || visual.typeId !== npc.typeId) throw new Error(`Missing visual type: ${npc.typeId}`);
  return {
    id: npc.id,
    title: `${npc.NPCInfo.Name} · ${npc.id}`,
    tint: visual.tint,
    health: npc.GetParameter(TypeNPCParameter.Health),
    maxHealth: npc.GetBaseParameter(TypeNPCParameter.Health),
    parameters: npc.Parameters.map(p => ({ type: p.Type, label: labels[p.Type], value: p.Value })),
  };
}
