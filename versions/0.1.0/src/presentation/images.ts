import guard_shield from '../../../../assets/images/enemies/guard-shield.png';
import guard_tracks from '../../../../assets/images/enemies/guard-tracks.png';
import guard_chair from '../../../../assets/images/enemies/guard-chair.png';
import guard_body from '../../../../assets/images/enemies/guard-body.png';
import rotor_gold from '../../../../assets/images/enemies/rotor-gold.png';
import healer_gold from '../../../../assets/images/enemies/healer-gold.png';
import rotor_blue from '../../../../assets/images/enemies/rotor-blue.png';
import healer_blue from '../../../../assets/images/enemies/healer-blue.png';
import rotor_teal from '../../../../assets/images/enemies/rotor-teal.png';
import healer_teal from '../../../../assets/images/enemies/healer-teal.png';
import rotor_magenta from '../../../../assets/images/enemies/rotor-magenta.png';
import healer_magenta from '../../../../assets/images/enemies/healer-magenta.png';
import finale from '../../../../assets/images/locations/finale.png';
import cutsceneTest from '../../../../assets/images/locations/CutsceneTest.jpg';
import hero from '../../../../assets/images/test1.jpg';
import burning from '../../../../assets/images/fire.jpg';
import blindness from '../../../../assets/images/blindness.png';
import stun from '../../../../assets/images/stun.jpg';
import regeneration from '../../../../assets/images/regeneration.png';
import battleLocation from '../../../../assets/images/battle-location.jpg';
import magenta from '../../../../assets/images/enemies/camera-magenta.png';
import teal from '../../../../assets/images/enemies/camera-teal.png';
import blue from '../../../../assets/images/enemies/camera-blue.png';
import gold from '../../../../assets/images/enemies/camera-gold.png';
import leg from '../../../../assets/images/enemies/shooter-leg.png';
import stand1 from '../../../../assets/images/hero/Stand1.png';
import stand2 from '../../../../assets/images/hero/Stand2.png';
import stand3 from '../../../../assets/images/hero/Stand3.png';
import itemMagenta from '../../../../assets/images/items/item-magenta.png';
import itemTeal from '../../../../assets/images/items/item-teal.png';
import itemBlue from '../../../../assets/images/items/item-blue.png';
import itemGold from '../../../../assets/images/items/item-gold.png';

const images: Readonly<Record<string, string>> = Object.freeze({
  'images/enemies/guard-shield.png': guard_shield,
  'images/enemies/guard-tracks.png': guard_tracks,
  'images/enemies/guard-chair.png': guard_chair,
  'images/enemies/guard-body.png': guard_body,
  'images/enemies/rotor-gold.png': rotor_gold,
  'images/enemies/healer-gold.png': healer_gold,
  'images/enemies/rotor-blue.png': rotor_blue,
  'images/enemies/healer-blue.png': healer_blue,
  'images/enemies/rotor-teal.png': rotor_teal,
  'images/enemies/healer-teal.png': healer_teal,
  'images/enemies/rotor-magenta.png': rotor_magenta,
  'images/enemies/healer-magenta.png': healer_magenta,
  'images/locations/finale.png': finale,
  'images/locations/CutsceneTest.jpg': cutsceneTest,
  'images/items/item-magenta.png': itemMagenta,
  'images/items/item-teal.png': itemTeal,
  'images/items/item-blue.png': itemBlue,
  'images/items/item-gold.png': itemGold,
  'images/test1.jpg': hero,
  'images/fire.jpg': burning,
  'images/blindness.png': blindness,
  'images/stun.jpg': stun,
  'images/regeneration.png': regeneration,
  'images/battle-location.jpg': battleLocation,
  'images/enemies/camera-magenta.png': magenta,
  'images/enemies/camera-teal.png': teal,
  'images/enemies/camera-blue.png': blue,
  'images/enemies/camera-gold.png': gold,
  'images/enemies/shooter-leg.png': leg,
  'images/hero/Stand1.png': stand1,
  'images/hero/Stand2.png': stand2,
  'images/hero/Stand3.png': stand3,
});
export function resolveImage(path: string): string {
  const image = images[path];
  if (!image) throw new Error(`Unknown image asset: ${path}`);
  return image;
}
