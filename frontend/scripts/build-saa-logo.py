"""Build logo-saa.png / favicon.ico from the SAA reference PNG.

The reference is already a clean, anti-aliased raster (transparent
background, blue letters) -- earlier attempts to re-vectorize it via
contour tracing introduced pixel-staircase "burrs" that a 130x48px source
can't support. This script trusts the source raster directly: it trims to
content, normalizes the letter color, upscales for retina headroom, and
emits a multi-resolution ICO from the same bitmap.
"""

from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
SRC = HERE / "saa-source.png"
OUT = HERE.parent / "public"
FILL = (0, 67, 142)
FILL_HEX = "#00438e"
UPSCALE = 4


def trim_to_content(im: Image.Image, pad: int = 2) -> Image.Image:
    alpha = np.array(im.split()[-1])
    ys, xs = np.where(alpha > 8)
    y0, y1 = max(0, ys.min() - pad), min(alpha.shape[0], ys.max() + 1 + pad)
    x0, x1 = max(0, xs.min() - pad), min(alpha.shape[1], xs.max() + 1 + pad)
    return im.crop((x0, y0, x1, y1))


def recolor(im: Image.Image) -> Image.Image:
    """Force every non-transparent pixel to the brand blue, keeping alpha
    (and thus the source's anti-aliased edges) untouched."""
    arr = np.array(im)
    arr[:, :, 0] = FILL[0]
    arr[:, :, 1] = FILL[1]
    arr[:, :, 2] = FILL[2]
    return Image.fromarray(arr, "RGBA")


def fit_square(src_img: Image.Image, size: int, pad_ratio: float = 0.08) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = max(1, int(size * (1 - 2 * pad_ratio)))
    ratio = src_img.width / src_img.height
    if ratio >= 1:
        width, height = inner, max(1, round(inner / ratio))
    else:
        height, width = inner, max(1, round(inner * ratio))
    fitted = src_img.resize((width, height), Image.Resampling.LANCZOS)
    canvas.paste(fitted, ((size - width) // 2, (size - height) // 2), fitted)
    return canvas


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    im = trim_to_content(im)
    im = recolor(im)
    im = im.resize((im.width * UPSCALE, im.height * UPSCALE), Image.Resampling.LANCZOS)
    im.save(OUT / "logo-saa.png", optimize=True)

    sizes = [16, 24, 32, 48, 64, 128, 256]
    base = fit_square(im, 256)
    base.save(
        OUT / "favicon.ico",
        format="ICO",
        sizes=[(size, size) for size in sizes],
    )
    print("wrote", OUT / "logo-saa.png", im.size)
    print("wrote", OUT / "favicon.ico", (OUT / "favicon.ico").stat().st_size)


if __name__ == "__main__":
    main()
