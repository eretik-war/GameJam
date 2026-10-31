import memory2 from '../../../../assets/cutscenes/memory-2.json';
import memory3 from '../../../../assets/cutscenes/memory-3.json';
import intro from '../../../../assets/cutscenes/intro.json';
import battle1 from '../../../../assets/encounters/battle-1.json';
import battle2 from '../../../../assets/encounters/battle-2.json';
import cutscene from '../../../../assets/cutscenes/test.json';
import outro from '../../../../assets/cutscenes/outro.json';
import finale from '../../../../assets/cutscenes/finale.json';
import campaign from '../../../../assets/campaigns/main.json';
import { Hero } from './hero';
import { EnemySession } from '../enemies/session';
import { createEnemyFromInfo } from '../enemies/enemy';
import { canSpawn, getSpawnPoint } from '../enemies/spawn';
export interface BattleInfo { readonly typeId: string; readonly background: string; readonly enemies: readonly Readonly<{id:string;typeId:string;spawnPointId:string}>[] }
export interface CutsceneInfo { readonly typeId:string; readonly background:string; readonly characters?:boolean; readonly robotTypeId?:string; readonly lines:readonly Readonly<{id:string;text:string;sound?:string;choices?:readonly Readonly<{id:string;text:string}>[]}>[] }
function freeze<T>(v:T):T { if(v && typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v; }
export const battles:readonly BattleInfo[] = freeze([battle1,battle2]);
export const testCutscene:CutsceneInfo = freeze(cutscene);
export const cutscenes:readonly CutsceneInfo[] = freeze([intro,memory2,memory3,cutscene,outro,finale]);
export function createBattle(info:BattleInfo,id:string,hero:Hero):EnemySession {
 const enemies=info.enemies.map(e=>createEnemyFromInfo(e.typeId,id+'-'+e.id));
 const deployments=info.enemies.map((e,i)=>({enemyId:enemies[i]!.id,spawnPointId:e.spawnPointId}));
 if(enemies.some((e,i)=>!canSpawn(e.EnemyInfo,getSpawnPoint(deployments[i]!.spawnPointId))))throw new Error('Invalid encounter placement');
 return new EnemySession(enemies,1,enemies[0]?.id ?? '',deployments,hero);
}
export function validateCampaign(data:typeof campaign):void {
 const ids=new Set<string>();
 if(!data.id || !data.steps.length)throw new Error('Empty campaign');
 for(const b of battles){if(!b.background || !b.enemies.length || new Set(b.enemies.map(e=>e.id)).size!==b.enemies.length)throw new Error('Invalid battle');createBattle(b,'validate',new Hero());}
 for (const c of cutscenes) {
  if (!c.background || c.lines.some(l => !l.id || !l.text || (l.choices && (l.choices.length !== 2 || l.choices.some(ch => !['restart','continue'].includes(ch.id) || !ch.text) || new Set(l.choices.map(ch => ch.id)).size !== l.choices.length))) || new Set(c.lines.map(l => l.id)).size !== c.lines.length) throw new Error('Invalid cutscene');
 }
 for(const s of data.steps){if(!s.id || ids.has(s.id) || !(s.type==='battle'?battles.some(b=>b.typeId===s.contentId):s.type==='cutscene' && cutscenes.some(c=>c.typeId===s.contentId)))throw new Error('Invalid step');ids.add(s.id);}
}
validateCampaign(campaign);freeze(campaign);
export class CampaignSession {
 hero=new Hero(); #index=0; #complete=false;
 restart():void { this.hero = new Hero(); this.#index = 0; this.#complete = false; }
 get current(){return campaign.steps[this.#index]!;} get complete(){return this.#complete;}
 advance(expectedId:string):boolean {if(this.#complete || expectedId!==this.current.id)return false;if(this.#index===campaign.steps.length-1)this.#complete=true;else this.#index++;return true;}
 createBattle():EnemySession {const info=battles.find(b=>b.typeId===this.current.contentId);if(this.current.type!=='battle'||!info)throw new Error('Not battle');return createBattle(info,this.current.id,this.hero);}
}

