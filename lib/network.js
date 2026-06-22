/**
 * ============================================================================
 * Detecção de IP local da máquina
 * ============================================================================
 * Escolhe o IP da LAN/Wi-Fi REAL, ignorando adaptadores de VPN e virtuais
 * (Radmin, Hamachi, VMware, Hyper-V, WSL, Docker, etc.) que costumam aparecer
 * primeiro em os.networkInterfaces() e "roubam" a detecção.
 *
 * Estratégia: pontua cada interface IPv4 não-interna —
 *   + faixa privada RFC1918 (10/8, 172.16-31/12, 192.168/16)  → é LAN real
 *   - nome de adaptador VPN/virtual                            → penaliza
 *   + nome de Wi-Fi / Ethernet                                 → bônus
 * e retorna o melhor candidato.
 */

const os = require("os");

const VIRTUAL_NAME =
  /(radmin|hamachi|vpn|virtual|vethernet|vmware|virtualbox|hyper-?v|loopback|docker|wsl|tailscale|zerotier|\btun\b|\btap\b)/i;

function isPrivateIPv4(addr) {
  return (
    /^10\./.test(addr) ||
    /^192\.168\./.test(addr) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(addr)
  );
}

function listCandidates() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        candidates.push({ name: name, address: iface.address });
      }
    }
  }
  return candidates;
}

function scoreCandidate(c) {
  let score = 0;
  if (isPrivateIPv4(c.address)) score += 100; // LAN real
  if (VIRTUAL_NAME.test(c.name)) score -= 100; // VPN / virtual
  if (/wi-?fi|wlan|wireless/i.test(c.name)) score += 10;
  if (/ethernet|eth\d|\blan\b/i.test(c.name)) score += 8;
  if (/^192\.168\./.test(c.address)) score += 2; // WiFi doméstico/escritório típico
  return score;
}

/**
 * Retorna o melhor IP da LAN/Wi-Fi (ou 127.0.0.1 se não houver nenhum).
 */
function getLocalIPAddress() {
  const candidates = listCandidates();
  if (!candidates.length) return "127.0.0.1";
  candidates.sort(function (a, b) {
    return scoreCandidate(b) - scoreCandidate(a);
  });
  return candidates[0].address;
}

/**
 * Lista todos os IPs IPv4 não-internos por interface (para o log de debug).
 */
function getAllIPAddresses() {
  const ips = {};
  listCandidates().forEach(function (c) {
    if (!ips[c.name]) ips[c.name] = [];
    ips[c.name].push(c.address);
  });
  return ips;
}

module.exports = {
  getLocalIPAddress,
  getAllIPAddresses,
  isPrivateIPv4,
};
