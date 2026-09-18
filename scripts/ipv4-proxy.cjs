// Local HTTPS CONNECT proxy that forces IPv4 DNS resolution.
// Workaround for corporate networks (e.g. Zscaler) where IPv6 is advertised
// but not actually routable, causing Go-based CLIs (like the Supabase CLI)
// to time out instead of falling back to IPv4. Requires no admin rights -
// point HTTPS_PROXY/HTTP_PROXY at this instead of editing hosts/network config.
//
// Usage:
//   node scripts/ipv4-proxy.cjs
//   $env:HTTPS_PROXY = "http://127.0.0.1:18080"
//   $env:HTTP_PROXY  = "http://127.0.0.1:18080"

const net = require("net");
const dns = require("dns");
const http = require("http");

const PORT = 18080;

const server = http.createServer((_req, res) => {
  res.writeHead(405);
  res.end("Method not allowed - this proxy only handles CONNECT tunnels.");
});

server.on("connect", (req, clientSocket, head) => {
  const [host, portStr] = req.url.split(":");
  const port = Number(portStr) || 443;

  dns.lookup(host, { family: 4 }, (err, address) => {
    if (err) {
      console.error(`[ipv4-proxy] IPv4 lookup failed for ${host}: ${err.message}`);
      clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      return;
    }

    const upstream = net.connect(port, address, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });

    upstream.on("error", (e) => {
      console.error(`[ipv4-proxy] upstream error for ${host} (${address}): ${e.message}`);
      clientSocket.end();
    });
    clientSocket.on("error", () => upstream.end());

    console.log(`[ipv4-proxy] ${host} -> ${address}:${port}`);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`IPv4-forcing proxy listening on http://127.0.0.1:${PORT}`);
  console.log("Leave this running, then in another terminal set:");
  console.log(`  $env:HTTPS_PROXY = "http://127.0.0.1:${PORT}"`);
  console.log(`  $env:HTTP_PROXY  = "http://127.0.0.1:${PORT}"`);
});
