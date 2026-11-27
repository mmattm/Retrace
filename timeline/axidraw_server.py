#!/usr/bin/env python3
"""Small loopback HTTP bridge between Retrace and the AxiDraw Python API."""

import argparse
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from xml.etree import ElementTree

MAX_BODY = 10 * 1024 * 1024


def find_axidraw_devices():
    # Enumerate USB ports only: never open a port or interrupt an active plot.
    from plotink import ebb_serial
    return [port[0] for port in (ebb_serial.listEBBports() or [])]


def validate_svg(svg, allow_text=False):
    if not isinstance(svg, str) or not svg.strip():
        raise ValueError('A vector SVG is required.')
    if re.search(r'<!\s*(DOCTYPE|ENTITY)', svg, re.I):
        raise ValueError('SVG document declarations are not supported.')
    try:
        root = ElementTree.fromstring(svg)
    except ElementTree.ParseError as error:
        raise ValueError('Invalid SVG document.') from error
    if root.tag != '{http://www.w3.org/2000/svg}svg':
        raise ValueError('A vector SVG is required.')
    for side in (() if allow_text else ('width', 'height')):
        if not re.fullmatch(r'(?:\d+(?:\.\d*)?|\.\d+)mm', root.get(side, '')):
            raise ValueError('SVG dimensions must be in millimeters.')
        if not 1 <= float(root.get(side)[:-2]) <= 1000:
            raise ValueError('SVG dimensions must be between 1 and 1000 mm.')
    for node in root.iter():
        if node.tag.split('}')[-1] in ('script', 'foreignObject', 'image') or (not allow_text and node.tag.split('}')[-1] == 'text'):
            raise ValueError('Use vector paths only; convert text and images to paths first.')
        for name, value in node.attrib.items():
            if name.split('}')[-1] == 'href' and not value.startswith('#'):
                raise ValueError('External SVG references are not supported.')
    return svg


class Plotter:
    def __init__(self, options, factory, find_devices=find_axidraw_devices):
        self.options = options
        self.factory = factory
        self.find_devices = find_devices
        self.lock = threading.Lock()
        self.state = {'state': 'idle', 'message': 'Ready to plot.'}

    def status(self):
        try:
            devices = self.find_devices()
            connection = {'connected': bool(devices), 'devices': devices}
        except Exception as error:
            connection = {'connected': False, 'devices': [], 'connectionError': str(error)}
        with self.lock:
            return {**self.state, **connection}

    def start(self, svg):
        svg = validate_svg(svg)
        connection = self.status()
        with self.lock:
            if self.state['state'] == 'printing':
                raise RuntimeError('AxiDraw is already plotting. Wait for it to finish.')
            if not connection['connected']:
                raise RuntimeError('AxiDraw is not connected. Check its USB cable.')
            self.state = {'state': 'printing', 'message': 'Plotting… Use the physical pause button to stop.'}
            result = {**connection, **self.state}
            threading.Thread(target=self.run, args=(svg,), daemon=True).start()
        return result

    def run(self, svg):
        try:
            ad = self.factory()
            ad.plot_setup(svg)
            ad.options.model = self.options.model
            ad.options.speed_pendown = self.options.speed
            ad.options.pen_pos_up = self.options.pen_up
            ad.options.pen_pos_down = self.options.pen_down
            # Keep the composition's scale; rotate portrait pages for landscape plotting.
            ad.options.auto_rotate = True
            ad.options.copies = 1
            ad.params.clip_to_page = True
            ad.errors.connect = True
            ad.errors.disconnect = True
            ad.plot_run()
            code = ad.errors.code
            if code == 102:
                result = {'state': 'paused', 'message': 'Stopped by the AxiDraw pause button. The plot is incomplete.'}
            elif code:
                raise RuntimeError(f'AxiDraw stopped with error {code}. Check the USB connection.')
            else:
                result = {'state': 'completed', 'message': 'Plot completed.'}
        except Exception as error:
            print(f'AxiDraw: {error}', flush=True)
            result = {'state': 'error', 'message': f'AxiDraw: {error}'}
        with self.lock:
            self.state = result


class BridgeHandler(BaseHTTPRequestHandler):
    def allowed(self):
        # Check Host as well as Origin to reject DNS rebinding and cross-site plots.
        if self.headers.get('Host') not in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'):
            return False
        origin = self.headers.get('Origin')
        if not origin or origin in self.server.origins:
            return True
        parsed = urlsplit(origin)
        return parsed.scheme in ('http', 'https') and parsed.hostname in ('localhost', '127.0.0.1')

    def reply(self, code, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(code)
        if self.allowed() and self.headers.get('Origin'):
            self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
            self.send_header('Vary', 'Origin')
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if not self.allowed():
            self.reply(403, {'error': 'Origin is not allowed.'})
            return
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self.headers.get('Origin', 'http://localhost'))
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Vary', 'Origin')
        self.end_headers()

    def do_GET(self):
        if not self.allowed():
            self.reply(403, {'error': 'Origin is not allowed.'})
        elif self.path == '/api/axidraw/status':
            self.reply(200, self.server.plotter.status())
        else:
            self.reply(404, {'error': 'Unknown endpoint.'})

    def do_POST(self):
        self.connection.settimeout(10)
        if not self.allowed():
            self.reply(403, {'error': 'Origin is not allowed.'})
            return
        if self.path not in ('/api/axidraw/plot', '/api/axidraw/prepare'):
            self.reply(404, {'error': 'Unknown endpoint.'})
            return
        if self.headers.get_content_type() != 'application/json':
            self.reply(415, {'error': 'Send application/json.'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BODY:
                self.reply(413, {'error': 'SVG request must be under 10 MB.'})
                return
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError('Send an object containing svg.')
            if self.path == '/api/axidraw/prepare':
                from axidraw_text import outline_svg_text
                svg = outline_svg_text(validate_svg(data.get('svg'), allow_text=True))
                self.reply(200, {'svg': svg})
            else:
                self.reply(202, self.server.plotter.start(data.get('svg')))
        except ImportError:
            self.reply(503, {'error': 'Install the AxiDraw bridge dependencies: .venv-axidraw/bin/python -m pip install -r timeline/requirements-axidraw.txt'})
        except (ValueError, UnicodeDecodeError, TimeoutError) as error:
            self.reply(400, {'error': str(error)})
        except RuntimeError as error:
            self.reply(409, {'error': str(error)})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', action='append', default=[], help='Allow a hosted Retrace origin, e.g. https://example.com')
    parser.add_argument('--model', type=int, choices=range(1, 8), default=1, help='AxiDraw API model number (default: 1, V2/V3/A4)')
    parser.add_argument('--speed', type=int, choices=range(1, 111), default=25, metavar='1-110')
    parser.add_argument('--pen-up', type=int, choices=range(101), default=60, metavar='0-100')
    parser.add_argument('--pen-down', type=int, choices=range(101), default=40, metavar='0-100')
    options = parser.parse_args()
    try:
        from pyaxidraw import axidraw
    except ImportError:
        parser.exit(1, 'Install the AxiDraw API first; see the AxiDraw section in README.md.\n')
    server = ThreadingHTTPServer(('127.0.0.1', 8765), BridgeHandler)
    server.origins = set(options.origin)
    server.plotter = Plotter(options, axidraw.AxiDraw)
    print('AxiDraw bridge ready at http://127.0.0.1:8765. Keep this terminal open.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nBridge stopped. If plotting, use the physical pause button before closing.', flush=True)
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
