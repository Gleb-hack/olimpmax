"""Turns supplied university logos into square WebP tiles for the app.

    python3 scripts/university-logos.py /path/to/logo_base

A file is matched to a university by its name or alias from data/reference/universities.csv
(«НИУ ВШЭ.png» → hse.webp) and written to apps/web/public/logos/universities/<slug>.webp, 192×192.
A logo that fills its picture with colour (ВШЭ, ИТМО) is centre-cropped; a mark on white is trimmed and
centred with an even white margin; PLATES — a coloured plate on white — is trimmed to the plate. Needs Pillow.
"""
import csv, os, re, sys
from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'apps/web/public/logos/universities')
SIZE = 192
PLATES = {'sechenov', 'mephi'}
EXTRA = {'мифи': 'mephi'}

def key(value): return re.sub(r'[^\wа-яё]+', '', value.lower().replace('ё', 'е'))
def on_white(image):
    image = image.convert('RGBA'); background = Image.new('RGBA', image.size, (255, 255, 255, 255))
    background.alpha_composite(image); return background.convert('RGB')
def border(image):
    w, h = image.size; px = image.load(); points = []
    for x in range(0, w, max(1, w // 60)): points += [px[x, 0], px[x, h - 1]]
    for y in range(0, h, max(1, h // 60)): points += [px[0, y], px[w - 1, y]]
    return points
def near(a, b, tolerance=28): return all(abs(x - y) <= tolerance for x, y in zip(a, b))
def square(image): side = min(image.size); x = (image.width - side) // 2; y = (image.height - side) // 2; return image.crop((x, y, x + side, y + side))
def non_white(image, threshold): return ImageChops.difference(image, Image.new('RGB', image.size, (255, 255, 255))).convert('L').point(lambda v: 255 if v > threshold else 0).getbbox()

def tile(image, slug):
    if slug in PLATES:
        left, top, right, bottom = non_white(image, 90)
        return square(image.crop((left + 2, top + 2, right - 2, bottom - 2)))
    points = border(image); colour = max(set(points), key=points.count)
    if sum(near(p, colour) for p in points) / len(points) > 0.9 and not near(colour, (255, 255, 255), 20): return square(image)
    mark = image.crop(non_white(image, 18) or (0, 0, image.width, image.height))
    side = int(max(mark.size) * 1.18); canvas = Image.new('RGB', (side, side), (255, 255, 255))
    canvas.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2)); return canvas

def main(source):
    universities = list(csv.DictReader(open(os.path.join(ROOT, 'data/reference/universities.csv'), encoding='utf-8-sig'), delimiter=';'))
    names = {**EXTRA, **{key(n): u['slug'] for u in universities for n in [u['name'], *filter(None, u['aliases'].split('|'))]}}
    os.makedirs(OUT, exist_ok=True); done = set()
    for name in sorted(os.listdir(source)):
        stem, extension = os.path.splitext(name)
        if extension.lower() not in ('.png', '.jpg', '.jpeg', '.webp'): continue
        slug = names.get(key(stem))
        if not slug: sys.exit(f'Не найден вуз для файла «{name}»: добавьте название в universities.csv или EXTRA')
        tile(on_white(Image.open(os.path.join(source, name))), slug).resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, f'{slug}.webp'), 'WEBP', quality=86, method=6)
        done.add(slug)
    missing = sorted({u['slug'] for u in universities} - done)
    print(f'Логотипов: {len(done)}' + (f'; без логотипа (будут инициалы): {", ".join(missing)}' if missing else ''))

if __name__ == '__main__': main(sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__))
