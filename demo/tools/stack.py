# Stack images vertically (or horizontally with -h) for quick review.
import sys
from PIL import Image
args = sys.argv[1:]
horiz = '-h' in args
args = [a for a in args if a != '-h']
out_path, paths = args[0], args[1:]
ims = [Image.open(p).convert('RGB') for p in paths]
if horiz:
    out = Image.new('RGB', (sum(i.width for i in ims), max(i.height for i in ims)))
    x = 0
    for i in ims: out.paste(i, (x, 0)); x += i.width
else:
    out = Image.new('RGB', (max(i.width for i in ims), sum(i.height for i in ims)))
    y = 0
    for i in ims: out.paste(i, (0, y)); y += i.height
out.save(out_path)
print(out_path, out.size)
