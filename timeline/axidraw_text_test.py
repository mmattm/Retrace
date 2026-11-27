"""Type on Line regression: exported PointText must become drawable paths."""

import importlib.util
import unittest
from xml.etree import ElementTree

from axidraw_text import SVG, load_font, outline_svg_text


@unittest.skipUnless(importlib.util.find_spec('fontTools'), 'FontTools is not installed')
class TextOutlineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            load_font('Unica77LL', 'normal', False)
        except ValueError as error:
            raise unittest.SkipTest(str(error))

    def test_type_on_line_letters_become_paths_with_their_positions_and_rotation(self):
        from fontTools.pens.boundsPen import BoundsPen
        from fontTools.svgLib.path import parse_path
        letters = ''.join(f'<text x="{100 + index * 100}" y="300" transform="rotate(15)" font-family="Unica77LL" font-size="100" font-weight="normal" text-anchor="middle">{letter}</text>' for index, letter in enumerate('RETRACE'))
        source = f'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect fill="black" width="800" height="600"/><g stroke="white" fill="none">{letters}</g></svg>'
        root = ElementTree.fromstring(outline_svg_text(source))
        self.assertEqual(root.findall('.//' + SVG + 'text'), [])
        paths = root.findall('.//' + SVG + 'path')
        self.assertEqual(len(paths), 7)
        for index, path in enumerate(paths):
            self.assertEqual(path.get('transform'), 'rotate(15)')
            pen = BoundsPen(None)
            parse_path(path.get('d'), pen)
            left, top, right, bottom = pen.bounds
            self.assertLess(left, 100 + index * 100)
            self.assertGreater(right, 100 + index * 100)
            self.assertLess(top, 300)
            # Rounded glyphs slightly overshoot the baseline in the font design.
            self.assertLess(abs(bottom - 300), 2)

    def test_font_settings_inherited_from_groups_are_kept(self):
        source = '<svg xmlns="http://www.w3.org/2000/svg"><g style="font-family:Arial;font-weight:bold;font-size:100"><text x="10" y="100">R</text></g></svg>'
        root = ElementTree.fromstring(outline_svg_text(source))
        self.assertTrue(root.find('.//' + SVG + 'path').get('d'))

    @unittest.skipUnless(importlib.util.find_spec('pyaxidraw'), 'AxiDraw API is not installed')
    def test_converted_letter_is_drawable_by_the_real_api_without_moving_hardware(self):
        from pyaxidraw import axidraw
        source = '<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><text x="50" y="70" font-family="Unica77LL" font-size="50" font-weight="normal" text-anchor="middle" stroke="black" fill="none">R</text></svg>'
        api = axidraw.AxiDraw()
        api.plot_setup(outline_svg_text(source))
        api.options.preview = True
        api.options.auto_rotate = False
        api.plot_run()
        self.assertEqual(api.errors.code, 0)
        self.assertGreater(api.distance_pendown, 0)


if __name__ == '__main__':
    unittest.main()
