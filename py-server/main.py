import matplotlib.pyplot as plt
import io
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

plt.rcParams['axes.facecolor'] = '#313338'
plt.rcParams['figure.facecolor'] = '#2B2D31'
plt.rcParams['text.color'] = '#E0E0E0'
plt.rcParams['axes.labelcolor'] = '#E0E0E0'
plt.rcParams['axes.edgecolor'] = '#E0E0E0'
plt.rcParams['xtick.color'] = '#E0E0E0'
plt.rcParams['ytick.color'] = '#E0E0E0'
plt.rcParams['grid.color'] = '#4F4F4F'
plt.rcParams['grid.linestyle'] = '--'

class SimpleChartServer(BaseHTTPRequestHandler):
    def do_POST(self):        
        # check path
        if self.path != '/bar':
            self.send_error(404)
            return  

        try:
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len)
            data = json.loads(post_body.decode('utf-8'))

            if type(data) is not dict:
                raise Exception('Invalid data type')

            title = data.get('title', '')
            xlabel = data.get('xlabel', '')
            ylabel = data.get('ylabel', '')
            grid = data.get('grid', True)
            color = data.get('color', 'm')
            
            x = data['xdata']
            y = data['ydata']

            if type(x) is not list or type(y) is not list:
                raise Exception('Invalid data type')
        except:
            self.send_error(400)
            return

        plt.figure(figsize=(8, 4.5))
        plt.title(title)
        plt.bar(x, y, color=color)
        plt.xlabel(xlabel)
        plt.ylabel(ylabel)
        plt.grid(grid)

        buf = io.BytesIO()
        plt.savefig(buf, format='png')

        self.send_response(200)
        self.send_header('Content-type', 'image/png')
        self.end_headers()
        self.wfile.write(buf.getvalue())

if __name__ == '__main__':
    server = HTTPServer(('', 5301), SimpleChartServer)
    try:
      server.serve_forever()
    except KeyboardInterrupt:
      pass
    finally:
      server.server_close()
