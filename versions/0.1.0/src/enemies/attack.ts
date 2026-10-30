import testAttack from '../../../../assets/attacks/test-attack.json';

export class AttackInfo {
  constructor(readonly typeId: string, readonly name: string) {
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(typeId) || !name.trim()) throw new Error('Invalid attack asset');
    Object.freeze(this);
  }
}
const attacks = Object.freeze([new AttackInfo(testAttack.typeId, testAttack.name)]);
export function getAttackInfo(typeId: string): AttackInfo {
  const info = attacks.find(attack => attack.typeId === typeId);
  if (!info) throw new Error('Unknown attack');
  return info;
}
