import { Parameter, RestoreParameter, TypeNPCParameter, assertFinite, validateNPCParameters } from './parameters';

export class NPCInfo {
  public readonly Parameters: readonly Readonly<Parameter<TypeNPCParameter>>[];

  constructor(public readonly typeId: string, public readonly Name: string, parameters: unknown) {
    if (!typeId || !Name) throw new Error('NPCInfo requires typeId and Name');
    this.Parameters = Object.freeze(validateNPCParameters(parameters).map(parameter => Object.freeze(parameter)));
    if (this.Parameters.find(p => p.Type === TypeNPCParameter.Health)!.Value <= 0) {
      throw new Error('Base health must be positive');
    }
    Object.freeze(this);
  }
}

export const traineeInfo = new NPCInfo('npc.trainee', 'Разведчик', [
  new Parameter(TypeNPCParameter.Health, 100),
  new Parameter(TypeNPCParameter.Armor, 2),
  new Parameter(TypeNPCParameter.Damage, 5),
]);

const npcCatalog: ReadonlyMap<string, NPCInfo> = new Map([[traineeInfo.typeId, traineeInfo]]);
export function getNPCInfo(typeId: string): NPCInfo {
  const info = npcCatalog.get(typeId);
  if (!info) throw new Error(`Unknown NPC typeId: ${typeId}`);
  return info;
}

export interface SavedNPC {
  id: string;
  typeId: string;
  Parameters: readonly Readonly<Parameter<TypeNPCParameter>>[];
}

export class NPC {
  readonly #parameters: Parameter<TypeNPCParameter>[];

  constructor(public readonly id: string, public readonly NPCInfo: NPCInfo, parameters?: unknown) {
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(id)) throw new Error('Invalid instance ID');
    this.#parameters = validateNPCParameters(parameters ?? NPCInfo.Parameters);
    if (this.GetParameter(TypeNPCParameter.Health) > this.GetBaseParameter(TypeNPCParameter.Health)) {
      throw new Error('Saved health exceeds base maximum');
    }
  }

  get typeId(): string { return this.NPCInfo.typeId; }

  /** Read-only snapshots prevent callers from bypassing ChangeParameter. */
  get Parameters(): readonly Readonly<Parameter<TypeNPCParameter>>[] {
    return Object.freeze(this.#parameters.map(p => Object.freeze(new Parameter(p.Type, p.Value))));
  }

  GetBaseParameter(type: TypeNPCParameter): number {
    const parameter = this.NPCInfo.Parameters.find(p => p.Type === type);
    if (!parameter) throw new Error(`Missing base parameter: ${type}`);
    return parameter.Value;
  }

  GetParameter(type: TypeNPCParameter): number {
    for (const parameter of this.#parameters) {
      if (parameter.Type === type) return parameter.Value;
    }
    throw new Error(`Missing current parameter: ${type}`);
  }

  ChangeParameter(type: TypeNPCParameter, delta: number): number {
    assertFinite(delta);
    for (const parameter of this.#parameters) {
      if (parameter.Type !== type) continue;
      const value = parameter.Value + delta;
      assertFinite(value);
      const maximum = type === TypeNPCParameter.Health ? this.GetBaseParameter(type) : Number.MAX_VALUE;
      parameter.Value = Math.max(0, Math.min(maximum, value));
      return parameter.Value;
    }
    throw new Error(`Missing current parameter: ${type}`);
  }

  ApplyRestore(effect: RestoreParameter<TypeNPCParameter>): number {
    return this.ChangeParameter(effect.UseTypeParameter, effect.Value);
  }

  Save(): SavedNPC { return { id: this.id, typeId: this.typeId, Parameters: this.Parameters }; }
}

export function createNPCFromInfo(typeId: string, id: string, parameters?: unknown): NPC {
  return new NPC(id, getNPCInfo(typeId), parameters);
}
