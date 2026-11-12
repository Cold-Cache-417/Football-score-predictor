"""Print the metrics needed to build metric-matched CSS fallbacks.

Used once, offline, to derive the `size-adjust` / `ascent-override` /
`descent-override` / `line-gap-override` values for the self-hosted webfonts
in `web/assets/fonts`. Not part of the runtime, not part of the build.

Usage: .venv/bin/python scripts/font_metrics.py
"""

from pathlib import Path

from fontTools.ttLib import TTFont

FONT_DIR = Path(__file__).resolve().parent.parent / "web" / "assets" / "fonts"


def metrics(path: Path) -> dict:
    font = TTFont(path)
    upem = font["head"].unitsPerEm
    hhea = font["hhea"]
    os2 = font["OS/2"]
    return {
        "unitsPerEm": upem,
        "hhea.ascent": hhea.ascent,
        "hhea.descent": hhea.descent,
        "hhea.lineGap": hhea.lineGap,
        "os2.typoAscender": os2.sTypoAscender,
        "os2.typoDescender": os2.sTypoDescender,
        "os2.typoLineGap": os2.sTypoLineGap,
        "os2.winAscent": os2.usWinAscent,
        "os2.winDescent": os2.usWinDescent,
        "os2.xAvgCharWidth": os2.xAvgCharWidth,
        "css.ascent-override": f"{os2.sTypoAscender / upem * 100:.2f}%",
        "css.descent-override": f"{abs(os2.sTypoDescender) / upem * 100:.2f}%",
        "css.line-gap-override": f"{os2.sTypoLineGap / upem * 100:.2f}%",
    }


for file in sorted(FONT_DIR.glob("*.woff2")):
    print(file.name)
    for key, value in metrics(file).items():
        print(f"  {key}: {value}")
