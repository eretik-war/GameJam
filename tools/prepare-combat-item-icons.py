"""Prepare only item.09-12 icons; preserve the user's pixels and alpha.
Run from any directory: python tools/prepare-combat-item-icons.py.
Original attachments must first be copied into dev-support/art/items/combat.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'versions/0.1.0/dev-support/art/items'
SIZE, MARGIN = 128, 4
REPORT = []
for type_id, color in [('item.09', 'blue'), ('item.10', 'magenta'),
                       ('item.11', 'gold'), ('item.12', 'teal')]:
    source = ART / 'combat' / f'combat-{color}.png'
    target = ROOT / 'assets/images/items' / f'item-combat-{color}.png'
    image = Image.open(source).convert('RGBA')
    box = image.getchannel('A').getbbox()
    if box is None:
        raise ValueError(f'Empty attachment: {source}')
    body = image.crop(box)
    scale = (SIZE - MARGIN * 2) / max(body.size)
    dimensions = tuple(max(1, round(d * scale)) for d in body.size)
    # Premultiplied-alpha downscale prevents dark/coloured halos.
    body = body.convert('RGBa').resize(dimensions, Image.Resampling.LANCZOS).convert('RGBA')
    icon = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    position = tuple((SIZE - d) // 2 for d in dimensions)
    icon.paste(body, position)  # No mask: don't multiply the supplied alpha twice.
    target.parent.mkdir(parents=True, exist_ok=True)
    icon.save(target, optimize=True)
    REPORT.append({
        'id': f'item-combat-{color}', 'typeId': type_id, 'kind': 'image',
        'source': 'User attachment; transparent crop and proportional resize only, no generated or substituted art',
        'author': 'Not supplied', 'license': 'Not supplied; user-provided project asset',
        'sourceFile': f'../dev-support/art/items/combat/combat-{color}.png',
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'runtimeFile': f'../../../assets/images/items/item-combat-{color}.png',
        'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'dimensions': {'width': SIZE, 'height': SIZE},
        'bytes': target.stat().st_size,
        'modifications': {'crop': list(box), 'contentSize': list(dimensions),
                          'margin': MARGIN, 'alpha': 'Preserved with premultiplied resampling',
                          'tool': 'tools/prepare-combat-item-icons.py'},
    })
(ART / 'combat-icons-extraction.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(REPORT, ensure_ascii=False))
