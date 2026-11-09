// Metro config for DaCy.
// Adds a small proxy: requests to /dacy-api/* are forwarded to the DaCy server on
// localhost:8787. The phone then reaches the API through the same address as the
// JS bundle — this works on LAN *and* through `expo start --tunnel`, so no second
// tunnel is needed for the API.
const http = require('http');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const API_PREFIX = '/dacy-api';
const API_PORT = Number(process.env.DACY_SERVER_PORT || 8787);

const previous = config.server && config.server.enhanceMiddleware;

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    const base = previous ? previous(middleware, server) : middleware;
    return (req, res, next) => {
      if (!req.url || !req.url.startsWith(`${API_PREFIX}/`)) return base(req, res, next);
      const headers = { ...req.headers, host: `127.0.0.1:${API_PORT}` };
      const upstream = http.request(
        { host: '127.0.0.1', port: API_PORT, path: req.url.slice(API_PREFIX.length), method: req.method, headers },
        (upstreamRes) => {
          res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
          upstreamRes.pipe(res);
        },
      );
      upstream.setTimeout(60_000, () => upstream.destroy(new Error('timeout')));
      upstream.on('error', () => {
        if (res.headersSent) return res.end();
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'INTERNAL', message: 'DaCy server is not running on this computer' } }));
      });
      req.pipe(upstream);
    };
  },
};

module.exports = config;
