import type { TypeEnemyParameter } from '../enemies/enemy';
/** These enums belong to different domains and cannot be interchanged. */
export enum TypeParameter {
  AllReqAction = 'all-req-action',
  LastPerformed = 'last-performed',
  FirstPerformed = 'first-performed',
}

export enum TypeNPCParameter {
  Health = 'health',
  Armor = 'armor',
  Damage = 'damage',
}

export type ParameterType = TypeParameter | TypeNPCParameter | TypeEnemyParameter;

export class Parameter<TType extends ParameterType> {
  constructor(public readonly Type: TType, public Value: number) {
    assertFinite(Value);
  }
}

/** An additive effect. Value is the delta, not an absolute target value. */
export class RestoreParameter<TType extends ParameterType> {
  constructor(public readonly UseTypeParameter: TType, public readonly Value: number) {
    assertFinite(Value);
  }
}

export function assertFinite(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Parameter Value must be a finite number');
  }
}

export function isTypeNPCParameter(value: unknown): value is TypeNPCParameter {
  return typeof value === 'string' && Object.values(TypeNPCParameter).some(type => type === value);
}

export function validateNPCParameters(value: unknown): Parameter<TypeNPCParameter>[] {
  if (!Array.isArray(value)) throw new Error('Parameters must be an array');
  const seen = new Set<TypeNPCParameter>();
  const result: Parameter<TypeNPCParameter>[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || !('Type' in entry) || !('Value' in entry)) {
      throw new Error('Invalid parameter object');
    }
    if (!isTypeNPCParameter(entry.Type)) throw new Error('Unknown TypeNPCParameter');
    if (seen.has(entry.Type)) throw new Error(`Duplicate parameter: ${entry.Type}`);
    assertFinite(entry.Value);
    if (entry.Value < 0) throw new Error('NPC parameters cannot be negative in this demo');
    seen.add(entry.Type);
    result.push(new Parameter(entry.Type, entry.Value));
  }
  if (seen.size !== Object.values(TypeNPCParameter).length) throw new Error('Required parameter is missing');
  return result;
}

