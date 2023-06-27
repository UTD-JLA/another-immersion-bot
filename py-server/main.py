from matplotlib.dates import AutoDateFormatter, AutoDateLocator, date2num
import matplotlib.pyplot as plt
import io
import json
import pandas as pd
import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
import signal

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
        if self.path not in ['/bar', '/easyDateBar']:
            self.send_error(404)
            return  

        try:
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len)
            data = json.loads(post_body.decode('utf-8'))
        except:
            self.send_error(400)
            return

        if self.path == '/bar':
          if type(data) is not dict:
              self.send_error(400)
              return

          title = data.get('title', '')
          xlabel = data.get('xlabel', '')
          ylabel = data.get('ylabel', '')
          grid = data.get('grid', True)
          color = data.get('color', 'm')
          
          x = data['xdata']
          y = data['ydata']

          if type(x) is not list or type(y) is not list:
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
        else:
          if type(data) is not dict:
              self.send_error(400)
              return
            
          chart_data = list(data.get('data', []))
          buckets = data.get('buckets', 7)
          color = data.get('color', 'm')
          horizontal_color = data.get('horizontal_color', 'r')
          horizontal = data.get('horizontal', 0)

          xtick_locator = AutoDateLocator()
          xtick_formatter = AutoDateFormatter(xtick_locator)

          ax = plt.axes()
          ax.xaxis.set_major_locator(xtick_locator)
          ax.xaxis.set_major_formatter(xtick_formatter)
          ax.xaxis.set_tick_params(rotation=-20)

          x = list(map(lambda d: datetime.datetime.fromisoformat(d['x']), chart_data))
          y = list(map(lambda d: d['y'], chart_data))

          df = pd.DataFrame({'x': x, 'y': y})
          r = pd.date_range(start=df['x'].min(), end=df['x'].max())
          df = df.set_index('x').reindex(r).fillna(0.0).rename_axis('x').reset_index()

          ax.hist(date2num(df['x']), buckets, weights=df['y'], color=color, rwidth=0.7)

          if horizontal > 0:
            ax.axhline(y=horizontal, color=horizontal_color, linestyle='--')

          buf = io.BytesIO()
          ax.figure.savefig(buf, format='png')
          ax.figure.clear()

          self.send_response(200)
          self.send_header('Content-type', 'image/png')
          self.end_headers()
          self.wfile.write(buf.getvalue())
  

if __name__ == '__main__':
    server = HTTPServer(('', 5301), SimpleChartServer)
    try:
      signal.signal(signal.SIGTERM, lambda _sig, _frame: server.server_close)
      print('Listening on port 5301. Use <Ctrl-C> or send SIGTERM to exit.')
      server.serve_forever()
    except KeyboardInterrupt:
      server.server_close()
