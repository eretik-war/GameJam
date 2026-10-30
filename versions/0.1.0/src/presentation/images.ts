import hero from '../../../../assets/images/test1.jpg';
import enemy from '../../../../assets/images/tes2.jpg';
import burning from '../../../../assets/images/testeffect.jpg';

const images: Readonly<Record<string, string>> = Object.freeze({
  'images/test1.jpg': hero,
  'images/tes2.jpg': enemy,
  'images/testeffect.jpg': burning,
});
export function resolveImage(path: string): string {
  const image = images[path];
  if (!image) throw new Error(`Unknown image asset: ${path}`);
  return image;
}
