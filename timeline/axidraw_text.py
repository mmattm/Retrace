"""Convert plain Paper.js SVG text to paths using locally installed fonts."""

import os
import re
from functools import lru_cache
from pathlib import Path
from xml.etree import ElementTree

SVG = '{http://www.w3.org/2000/svg}'


@lru_cache(maxsize=16)
def load_font(family, weight, italic):
    from fontTools.ttLib import TTFont
    family = family.split(',')[0].strip(' \"\'').lower()
    if family in ('unica77ll', 'unica'):
        path = Path(__file__).resolve().parent.parent / 'public/assets/fonts/Unica77LL-Regular.otf'
        font = TTFont(path)
        return font.getGlyphSet(), font.getBestCmap(), font['hmtx'].metrics, font['head'].unitsPerEm
    bold = weight.lower() in ('bold', 'bolder') or (weight.isdigit() and int(weight) >= 600)
    suffix = (' Bold' if bold else '') + (' Italic' if italic else '')
    fonts = {
        'arial': ('Arial', 'arial'), 'sans-serif': ('Arial', 'arial'),
        'times new roman': ('Times New Roman', 'times'), 'serif': ('Times New Roman', 'times'),
        'courier new': ('Courier New', 'cour'), 'monospace': ('Courier New', 'cour'),
    }
    if family not in fonts:
        raise ValueError(f'Text font "{family}" is not supported for AxiDraw. Use Unica77LL, Arial, Times New Roman or Courier New.')
    name, windows_name = fonts[family]
    windows_suffix = 'bi' if bold and italic else 'bd' if bold else 'i' if italic else ''
    candidates = [
        Path('/System/Library/Fonts/Supplemental') / f'{name}{suffix}.ttf',
        Path('/Library/Fonts') / f'{name}{suffix}.ttf',
        Path.home() / 'Library/Fonts' / f'{name}{suffix}.ttf',
        Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts' / f'{windows_name}{windows_suffix}.ttf',
        Path('/usr/share/fonts/truetype/msttcorefonts') / f'{name.replace(" ", "_")}{suffix.replace(" ", "_")}.ttf',
    ]
    path = next((path for path in candidates if path.is_file()), None)
    if path is None:
        raise ValueError(f'Install the {name}{suffix} font on the computer running the AxiDraw bridge.')
    font = TTFont(path)
    glyphs = font.getGlyphSet()
    return glyphs, font.getBestCmap(), font['hmtx'].metrics, font['head'].unitsPerEm


def number(value):
    if not re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:px)?', value):
        raise ValueError('AxiDraw text requires simple pixel coordinates and font sizes.')
    return float(value.removesuffix('px'))


def outline_svg_text(svg):
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    root = ElementTree.fromstring(svg)

    def visit(node, inherited):
        properties = dict(inherited)
        properties.update(node.attrib)
        for rule in node.get('style', '').split(';'):
            if ':' in rule:
                name, value = rule.split(':', 1)
                properties[name.strip()] = value.strip()
        if node.tag == SVG + 'text':
            if len(node):
                raise ValueError('AxiDraw currently supports plain text; convert styled or multiline text to paths first.')
            text = node.text or ''
            if not text.strip():
                node.tag, node.text = SVG + 'g', None
                return
            glyphs, cmap, metrics, units = load_font(
                properties.get('font-family', 'Arial'), properties.get('font-weight', 'normal'),
                properties.get('font-style', 'normal') in ('italic', 'oblique'))
            names = [cmap.get(ord(char)) for char in text]
            if any(name is None for name in names):
                raise ValueError('The selected font does not contain every character in the text.')
            scale = number(properties.get('font-size', '16')) / units
            advance = sum(metrics[name][0] for name in names) * scale
            anchor = properties.get('text-anchor', 'start')
            x = number(node.get('x', '0')) - advance * {'middle': 0.5, 'end': 1}.get(anchor, 0)
            y = number(node.get('y', '0'))
            pen = SVGPathPen(glyphs)
            for name in names:
                glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, y)))
                x += metrics[name][0] * scale
            node.tag = SVG + 'path'
            node.text = None
            for name in ('x', 'y', 'font-family', 'font-weight', 'font-style', 'font-size', 'text-anchor'):
                node.attrib.pop(name, None)
            node.set('d', pen.getCommands())
        for child in node:
            visit(child, properties)

    visit(root, {})
    ElementTree.register_namespace('', 'http://www.w3.org/2000/svg')
    return ElementTree.tostring(root, encoding='unicode')
