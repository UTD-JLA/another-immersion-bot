import matplotlib.pyplot as plt
import io
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

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
    server.serve_forever()
