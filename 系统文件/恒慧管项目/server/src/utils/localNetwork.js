const os = require('os');

/** 获取本机局域网 IPv4（排除 127.x） */
function getLanIPv4List() {
  const ips = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const addr of ifaces[name] || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push(addr.address);
      }
    }
  }
  return [...new Set(ips)];
}

function getPrimaryLanIPv4() {
  const list = getLanIPv4List();
  const preferred = list.find(ip => ip.startsWith('192.168.'));
  return preferred || list[0] || null;
}

module.exports = { getLanIPv4List, getPrimaryLanIPv4 };
