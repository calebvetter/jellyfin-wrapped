"""Combine screenshots into contact sheets: python scripts/contact-sheet.py <glob> <out-prefix> [per_sheet] [scale]"""
import glob, sys
from PIL import Image
files = sorted(glob.glob(sys.argv[1]))
prefix = sys.argv[2]
per = int(sys.argv[3]) if len(sys.argv) > 3 else 4
scale = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5
for n in range(0, len(files), per):
    imgs = [Image.open(f) for f in files[n:n + per]]
    imgs = [im.resize((int(im.width * scale), int(im.height * scale))) for im in imgs]
    w = sum(im.width for im in imgs) + 10 * (len(imgs) - 1)
    h = max(im.height for im in imgs)
    sheet = Image.new('RGB', (w, h), (40, 40, 40))
    x = 0
    for im in imgs:
        sheet.paste(im, (x, 0)); x += im.width + 10
    out = f"{prefix}-{n // per}.png"
    sheet.save(out); print(out)
