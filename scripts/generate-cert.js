/**
 * ============================================================================
 * Gerador de certificado TLS self-signed para a rede interna
 * ============================================================================
 * Cria ./certs/server.key e ./certs/server.crt com SubjectAltName (SAN)
 * apontando para localhost, 127.0.0.1 e o IP da LAN detectado.
 *
 * Uso:
 *   npm run gen-cert
 *   node scripts/generate-cert.js                       (só IP local)
 *   node scripts/generate-cert.js 192.168.0.50          (IP fixo extra)
 *   node scripts/generate-cert.js signage.lummar.local  (hostname extra)
 *
 * Os argumentos extras viram SANs adicionais (IP ou DNS, detectado pelo
 * formato). Útil para o caminho do "certificado real": gere apontando para
 * o hostname que o DNS interno resolve para o servidor.
 *
 * ⚠️  Certificado self-signed NÃO é confiável por padrão em navegadores
 *     nativos de smart TV (Tizen/WebOS). Veja o README para o caminho com
 *     certificado real (Let's Encrypt + DNS interno). Em HTTP, o sistema
 *     continua funcionando — o vídeo-âncora mantém as TVs acordadas.
 * ============================================================================
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { getLocalIPAddress } = require("../lib/network");

function isIPv4(value) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value);
}

function ensureOpenssl() {
  try {
    const out = execFileSync("openssl", ["version"], { encoding: "utf8" });
    console.log("OpenSSL: " + out.trim());
  } catch (e) {
    console.error("❌ OpenSSL não encontrado no PATH. Instale-o e tente de novo.");
    console.error("   Windows: https://slproweb.com/products/Win32OpenSSL.html");
    process.exit(1);
  }
}

function main() {
  ensureOpenssl();

  const localIP = getLocalIPAddress();
  const extras = process.argv.slice(2);

  // Monta a lista de SANs
  const dnsNames = ["localhost"];
  const ipAddrs = ["127.0.0.1", localIP];

  extras.forEach((arg) => {
    if (isIPv4(arg)) {
      if (ipAddrs.indexOf(arg) === -1) ipAddrs.push(arg);
    } else {
      if (dnsNames.indexOf(arg) === -1) dnsNames.push(arg);
    }
  });

  const certDir = path.join(__dirname, "..", "certs");
  fs.mkdirSync(certDir, { recursive: true });

  const keyPath = path.join(certDir, "server.key");
  const crtPath = path.join(certDir, "server.crt");
  const cnfPath = path.join(certDir, "openssl.cnf");

  // Monta o bloco [alt_names]
  let altLines = "";
  dnsNames.forEach((d, i) => {
    altLines += "DNS." + (i + 1) + " = " + d + "\n";
  });
  ipAddrs.forEach((ip, i) => {
    altLines += "IP." + (i + 1) + " = " + ip + "\n";
  });

  const cn = dnsNames.length > 1 ? dnsNames[1] : localIP;

  const conf =
    "[req]\n" +
    "distinguished_name = dn\n" +
    "x509_extensions = v3_req\n" +
    "prompt = no\n\n" +
    "[dn]\n" +
    "C = BR\n" +
    "O = Lummar Propaganda\n" +
    "CN = " + cn + "\n\n" +
    "[v3_req]\n" +
    "basicConstraints = CA:FALSE\n" +
    "keyUsage = digitalSignature, keyEncipherment\n" +
    "extendedKeyUsage = serverAuth\n" +
    "subjectAltName = @alt_names\n\n" +
    "[alt_names]\n" +
    altLines;

  fs.writeFileSync(cnfPath, conf);

  console.log("\nGerando certificado self-signed...");
  console.log("  CN:   " + cn);
  console.log("  DNS:  " + dnsNames.join(", "));
  console.log("  IPs:  " + ipAddrs.join(", "));

  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-nodes",
      "-newkey",
      "rsa:2048",
      "-keyout",
      keyPath,
      "-out",
      crtPath,
      "-days",
      "825",
      "-config",
      cnfPath,
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );

  // O .cnf não é mais necessário
  try {
    fs.unlinkSync(cnfPath);
  } catch (e) {
    /* silencioso */
  }

  console.log("\n✅ Certificado gerado:");
  console.log("   " + keyPath);
  console.log("   " + crtPath);
  console.log("\nReinicie o servidor (npm start) e abra:");
  console.log("   https://" + localIP + ":3443/presenter\n");
  console.log(
    "ℹ️  Em smart TV nativa, certificado self-signed pode ser recusado.",
  );
  console.log(
    "   Se isso acontecer, use HTTP normal (o vídeo-âncora segura a tela)",
  );
  console.log("   ou siga o caminho de certificado real no README.\n");
}

main();
