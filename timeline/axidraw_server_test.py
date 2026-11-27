"""Bridge tests with a fake API; no AxiDraw hardware is used."""

import http.client
import importlib.util
import json
import threading
import time
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from axidraw_server import BridgeHandler, Plotter, ThreadingHTTPServer, validate_svg

SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="90mm" height="160mm" viewBox="375 0 225 400"><path d="M375 0L600 400" fill="none" stroke="white"/></svg>'


class FakeAPI:
    def __init__(self, code=0, failure=None):
        self.options = SimpleNamespace()
        self.params = SimpleNamespace()
        self.errors = SimpleNamespace(code=code)
        self.failure = failure
        self.started = threading.Event()
        self.finish = threading.Event()

    def plot_setup(self, svg):
        self.svg = svg

    def plot_run(self):
        self.started.set()
        if not self.finish.wait(3):
            raise RuntimeError('Test plot timed out.')
        if self.failure:
            raise RuntimeError(self.failure)


def plotter(api, find_devices=lambda: ['/dev/axidraw-test']):
    return Plotter(SimpleNamespace(model=1, speed=25, pen_up=60, pen_down=40), lambda: api, find_devices)


def await_result(bridge):
    deadline = time.monotonic() + 3
    while bridge.status()['state'] == 'printing' and time.monotonic() < deadline:
        time.sleep(0.01)
    return bridge.status()


class BridgeTests(unittest.TestCase):
    @unittest.skipUnless(importlib.util.find_spec('pyaxidraw'), 'AxiDraw API is not installed')
    def test_production_options_rotate_portrait_without_resizing_the_plot(self):
        from pyaxidraw import axidraw
        for width, height, rotated in [(90, 160, True), (160, 90, False), (100, 100, False)]:
            with self.subTest(width=width, height=height):
                api = axidraw.AxiDraw()
                original_run = api.plot_run
                def preview_run():
                    api.options.preview = True
                    original_run()
                api.plot_run = preview_run
                bridge = plotter(api)
                bridge.run(f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}mm" height="{height}mm" viewBox="0 0 {width} {height}"><path stroke="black" fill="none" d="M10 20L80 70"/></svg>')
                self.assertEqual(bridge.status()['state'], 'completed')
                self.assertEqual(api.rotate_page, rotated)
                self.assertAlmostEqual(api.distance_pendown, (70 ** 2 + 50 ** 2) ** 0.5 / 1000, places=6)
                points = api.digest.layers[0].paths[0].subpaths[0]
                x_extent = abs(points[-1][0] - points[0][0]) * 25.4
                y_extent = abs(points[-1][1] - points[0][1]) * 25.4
                self.assertAlmostEqual(x_extent, 50 if rotated else 70, places=4)
                self.assertAlmostEqual(y_extent, 70 if rotated else 50, places=4)

    @unittest.skipUnless(importlib.util.find_spec('pyaxidraw'), 'AxiDraw API is not installed')
    def test_real_api_draws_a_thick_stroke_once_in_preview_mode(self):
        from pyaxidraw import axidraw
        for width in ('1', '20'):
            with self.subTest(stroke_width=width):
                api = axidraw.AxiDraw()
                api.plot_setup(f'<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><path stroke="black" stroke-width="{width}" fill="none" d="M10 10L90 10"/></svg>')
                api.options.preview = True
                api.options.auto_rotate = False
                api.plot_run()
                self.assertEqual(api.errors.code, 0)
                self.assertAlmostEqual(api.distance_pendown, 0.08, places=6)

    def test_usb_status_uses_startup_detection(self):
        detect = Mock(return_value=[])
        api = FakeAPI()
        bridge = plotter(api, detect)
        detect.assert_called_once_with()
        detect.return_value = ['/dev/axidraw-test']
        self.assertFalse(bridge.status()['connected'])
        with self.assertRaisesRegex(RuntimeError, 'not connected'):
            bridge.start(SVG)
        self.assertFalse(bridge.status()['connected'])
        detect.assert_called_once_with()
        self.assertFalse(api.started.is_set())

    def test_usb_detection_failure_is_not_reported_as_connected(self):
        def failure():
            raise OSError('USB enumeration failed')
        status = plotter(FakeAPI(), failure).status()
        self.assertFalse(status['connected'])
        self.assertEqual(status['connectionError'], 'USB enumeration failed')

    def test_one_plot_at_a_time_and_physical_options(self):
        api = FakeAPI()
        bridge = plotter(api)
        self.assertEqual(bridge.start(SVG)['state'], 'printing')
        self.assertTrue(api.started.wait(1))
        with self.assertRaisesRegex(RuntimeError, 'already plotting'):
            bridge.start(SVG)
        self.assertEqual(api.svg, SVG)
        self.assertEqual(api.options.model, 1)
        self.assertEqual(api.options.copies, 1)
        self.assertTrue(api.options.auto_rotate)
        self.assertTrue(api.params.clip_to_page)
        self.assertTrue(api.errors.connect)
        self.assertTrue(api.errors.disconnect)
        api.finish.set()
        self.assertEqual(await_result(bridge)['state'], 'completed')

    def test_pause_and_usb_errors_are_never_reported_as_success(self):
        for code, failure, expected in [(102, None, 'paused'), (0, 'USB disconnected', 'error'), (104, None, 'error')]:
            with self.subTest(code=code, failure=failure):
                api = FakeAPI(code, failure)
                api.finish.set()
                bridge = plotter(api)
                bridge.start(SVG)
                self.assertEqual(await_result(bridge)['state'], expected)

    def test_rejects_raster_external_entities_and_nonphysical_dimensions(self):
        self.assertEqual(validate_svg(SVG), SVG)
        for svg in [None, '<svg', SVG.replace('90mm', '90px'), SVG.replace('90mm', '0mm'),
                    '<!DOCTYPE svg [<!ENTITY value "hello">]>' + SVG,
                    SVG.replace('<path ', '<image href="https://example.com/image.png"/><path '),
                    SVG.replace('<path ', '<use href="/file.svg#path"/><path ')]:
            with self.subTest(svg=svg), self.assertRaises(ValueError):
                validate_svg(svg)

    def test_http_status_plot_and_origin_checks(self):
        api = FakeAPI()
        bridge = plotter(api)
        server = ThreadingHTTPServer(('127.0.0.1', 0), BridgeHandler)
        server.origins = {'https://retrace.example'}
        server.plotter = bridge
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        self.addCleanup(api.finish.set)

        def request(method, path, data=None, origin='http://localhost:5173', host=None):
            connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=2)
            headers = {'Origin': origin, 'Content-Type': 'application/json'}
            if host:
                headers['Host'] = host
            connection.request(method, path, body=json.dumps(data) if data is not None else None, headers=headers)
            response = connection.getresponse()
            result = (response.status, json.loads(response.read()), response.getheader('Access-Control-Allow-Origin'))
            connection.close()
            return result

        self.assertEqual(request('GET', '/api/axidraw/status')[1]['state'], 'idle')
        self.assertEqual(request('POST', '/api/axidraw/plot', {'svg': SVG}, origin='https://evil.example')[0], 403)
        self.assertEqual(request('POST', '/api/axidraw/plot', {'svg': SVG}, host='evil.example')[0], 403)
        self.assertEqual(bridge.status()['state'], 'idle')
        self.assertEqual(request('POST', '/api/axidraw/plot', {'svg': '<svg/>'})[0], 400)
        status, data, origin = request('POST', '/api/axidraw/plot', {'svg': SVG}, origin='https://retrace.example')
        self.assertEqual((status, data['state'], origin), (202, 'printing', 'https://retrace.example'))
        self.assertEqual(request('POST', '/api/axidraw/plot', {'svg': SVG})[0], 409)
        self.assertEqual(request('GET', '/api/axidraw/status')[1]['state'], 'printing')
        api.finish.set()
        self.assertEqual(await_result(bridge)['state'], 'completed')


if __name__ == '__main__':
    unittest.main()
