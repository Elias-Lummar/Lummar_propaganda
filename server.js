const express = require("express");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const { initDatabase, getDb } = require("./db/database");
const { setupSwagger } = require("./swagger");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "1GB" }));
app.use(express.urlencoded({ extended: true, limit: "1GB" }));
app.use(express.static("public"));

// Garantir diretório de uploads
const uploadsDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype.startsWith("video/")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não permitido"));
    }
  },
});

// Utils
function getVideoDuration(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return resolve(0);
      resolve(Math.ceil(metadata?.format?.duration || 0));
    });
  });
}

// Swagger Docs
setupSwagger(app);

// ============================================================================
// Helper: Detecta IP local da máquina
// ============================================================================
function getLocalIPAddress() {
  const os = require("os");
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Ignora interno e IPv6
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

// Pages
app.get("/", (req, res) => res.redirect("/admin"));
app.get("/admin", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "admin.html")),
);
app.get("/selector", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "screen-selector.html")),
);
app.get("/presenter", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "presenter.html")),
);
app.get("/presenter1", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "presenter1.html")),
);
app.get("/presenter2", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "presenter2.html")),
);
app.get("/presenter3", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "presenter3.html")),
);
app.get("/presenter4", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "presenter4.html")),
);

// API - Config
app.get("/api/server-info", (req, res) => {
  const localIP = getLocalIPAddress();
  res.json({
    ip: localIP,
    port: PORT,
    host: `http://${localIP}:${PORT}`,
    timestamp: new Date().toISOString(),
  });
});

// API - Lançar Electron
let electronProcess = null;

app.post("/api/launch-electron", (req, res) => {
  const { spawn } = require("child_process");

  // Se já há um processo Electron rodando, avisa
  if (electronProcess && !electronProcess.killed) {
    return res.json({
      success: false,
      message: "Electron já está em execução",
    });
  }

  try {
    const electronPath = require.resolve("electron/cli.js");
    const projectRoot = path.resolve(__dirname);

    // Monta argumentos: projeto + presenter (se fornecido)
    const args = [electronPath, projectRoot];
    const presenter = req.body && req.body.presenter;
    if (presenter) {
      args.push("--presenter=" + presenter);
    }

    electronProcess = spawn(process.execPath, args, {
      detached: true,
      stdio: "ignore",
      cwd: projectRoot,
    });

    electronProcess.unref();

    electronProcess.on("exit", () => {
      electronProcess = null;
    });

    console.log(`[Electron] Processo iniciado (PID: ${electronProcess.pid})`);
    res.json({ success: true, pid: electronProcess.pid });
  } catch (err) {
    console.error("[Electron] Erro ao iniciar:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API - Ads
app.get("/api/ads", (req, res) => {
  try {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM ads ORDER BY display_order ASC, id DESC")
      .all();
    res.json(
      rows.map((r) => ({ ...r, screens: JSON.parse(r.screens || "[]") })),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/ads/active", (req, res) => {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    const panel = req.query.panel || "presenter";

    const rows = db
      .prepare(
        "SELECT * FROM ads WHERE start_time <= ? AND end_time >= ? ORDER BY display_order ASC, id ASC",
      )
      .all(now, now);

    const ads = rows
      .map((r) => ({ ...r, screens: JSON.parse(r.screens || "[]") }))
      .filter((r) => r.screens.includes(panel));

    res.json(ads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ads", (req, res) => {
  const {
    title,
    file_path,
    start_time,
    end_time,
    transition_type,
    transition_duration,
    screens,
  } = req.body;
  if (!Array.isArray(screens) || !screens.length) {
    return res.status(400).json({ error: "Selecione ao menos um painel" });
  }

  try {
    const db = getDb();
    const info = db
      .prepare(
        "INSERT INTO ads (title, file_path, start_time, end_time, transition_type, transition_duration, screens) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        title,
        file_path,
        start_time,
        end_time,
        transition_type,
        transition_duration,
        JSON.stringify(screens),
      );
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reorder ads (drag-and-drop) — must come BEFORE /api/ads/:id
app.put("/api/ads/reorder", (req, res) => {
  const { orders } = req.body;
  if (!Array.isArray(orders)) {
    return res.status(400).json({ error: "orders deve ser um array" });
  }

  try {
    const db = getDb();
    const stmt = db.prepare("UPDATE ads SET display_order = ? WHERE id = ?");
    const updateAll = db.transaction((items) => {
      for (const o of items) stmt.run(o.order, o.id);
    });
    updateAll(orders);
    res.json({ success: true, updated: orders.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/ads/:id", (req, res) => {
  const {
    title,
    file_path,
    start_time,
    end_time,
    transition_type,
    transition_duration,
    screens,
  } = req.body;
  if (!Array.isArray(screens) || !screens.length) {
    return res.status(400).json({ error: "Selecione ao menos um painel" });
  }

  try {
    const db = getDb();
    db.prepare(
      "UPDATE ads SET title=?, file_path=?, start_time=?, end_time=?, transition_type=?, transition_duration=?, screens=? WHERE id=?",
    ).run(
      title,
      file_path,
      start_time,
      end_time,
      transition_type,
      transition_duration,
      JSON.stringify(screens),
      req.params.id,
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/ads/:id", (req, res) => {
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT file_path FROM ads WHERE id=?")
      .get(req.params.id);
    if (row?.file_path) {
      const file = path.join(__dirname, "public", row.file_path);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    db.prepare("DELETE FROM ads WHERE id=?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  const file_path = "/uploads/" + req.file.filename;
  let duration = 0;

  if (req.file.mimetype.startsWith("video/")) {
    duration = await getVideoDuration(
      path.join(__dirname, "public", file_path),
    );
  }

  res.json({ file_path, video_duration: duration });
});

// ============================================================================
// Deploy – Registro de Dispositivos & Envio do Instalador Electron
// ============================================================================

const registeredDevices = new Map(); // ip → objeto device
const sseAgents = new Map(); // ip → SSE res (agentes conectados)
const sseBuildClients = new Set(); // SSE res (admins acompanhando o build)

function broadcastBuild(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  sseBuildClients.forEach((r) => {
    try {
      r.write(msg);
    } catch {}
  });
}

function extractClientIP(req) {
  const raw =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  return raw.replace("::ffff:", "");
}

// Página do agente (roda no dispositivo remoto)
app.get("/agent", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "deploy-agent.html")),
);

// Retorna o IP de quem está fazendo a requisição e registra o device
app.get("/api/client-ip", (req, res) => {
  const ip = extractClientIP(req);
  const existing = registeredDevices.get(ip) || {};
  registeredDevices.set(ip, {
    ...existing,
    ip,
    name: existing.name || `Dispositivo (${ip})`,
    userAgent: req.headers["user-agent"] || "unknown",
    lastSeen: new Date().toISOString(),
    connected: sseAgents.has(ip),
  });
  res.json({ ip, registered: true });
});

// Lista dispositivos registrados
app.get("/api/deploy/devices", (req, res) => {
  const list = Array.from(registeredDevices.values()).map((d) => ({
    ...d,
    connected: sseAgents.has(d.ip),
  }));
  res.json(list);
});

// Remove dispositivo
app.delete("/api/deploy/devices/:ip", (req, res) => {
  registeredDevices.delete(req.params.ip);
  res.json({ success: true });
});

// Renomeia dispositivo
app.patch("/api/deploy/devices/:ip", (req, res) => {
  const device = registeredDevices.get(req.params.ip);
  if (!device)
    return res.status(404).json({ error: "Dispositivo não encontrado" });
  device.name = req.body.name || device.name;
  res.json({ success: true });
});

// SSE – Agente remoto escuta comandos do servidor
app.get("/api/deploy/listen", (req, res) => {
  const ip = extractClientIP(req);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  res.write(`data: ${JSON.stringify({ type: "connected", ip })}\n\n`);
  sseAgents.set(ip, res);

  const existing = registeredDevices.get(ip) || {};
  registeredDevices.set(ip, {
    ...existing,
    ip,
    name: existing.name || `Dispositivo (${ip})`,
    userAgent: req.headers["user-agent"] || "unknown",
    firstSeen: existing.firstSeen || new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    connected: true,
  });

  const hb = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
    } catch {
      clearInterval(hb);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(hb);
    sseAgents.delete(ip);
    const d = registeredDevices.get(ip);
    if (d) registeredDevices.set(ip, { ...d, connected: false });
  });
});

// SSE – Admin acompanha o log do build em tempo real
app.get("/api/deploy/build-log", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  sseBuildClients.add(res);
  req.on("close", () => sseBuildClients.delete(res));
  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
});

// Info sobre o instalador disponível
app.get("/api/deploy/installer-info", (req, res) => {
  const distDir = path.join(__dirname, "dist");
  if (!fs.existsSync(distDir)) return res.json({ available: false });
  const exts = [".exe", ".AppImage", ".dmg", ".deb", ".rpm"];
  const files = fs
    .readdirSync(distDir)
    .filter((f) => exts.some((e) => f.endsWith(e)));
  if (!files.length) return res.json({ available: false });

  const latest = files
    .map((f) => {
      const s = fs.statSync(path.join(distDir, f));
      return { name: f, size: s.size, builtAt: s.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.builtAt) - new Date(a.builtAt))[0];

  res.json({ available: true, ...latest });
});

// Serve o instalador compilado para download
app.get("/api/deploy/installer", (req, res) => {
  const distDir = path.join(__dirname, "dist");
  if (!fs.existsSync(distDir))
    return res
      .status(404)
      .json({ error: "Pasta dist não encontrada. Execute o build primeiro." });

  const files = fs.readdirSync(distDir).filter((f) => f.endsWith(".exe"));
  if (!files.length)
    return res
      .status(404)
      .json({ error: "Nenhum instalador .exe encontrado em /dist." });

  const latest = files
    .map((f) => ({ name: f, time: fs.statSync(path.join(distDir, f)).mtime }))
    .sort((a, b) => b.time - a.time)[0];

  res.download(path.join(distDir, latest.name), latest.name);
});

// Inicia o build via electron-builder
let buildProc = null;
app.post("/api/deploy/build", (req, res) => {
  if (buildProc && !buildProc.killed)
    return res.json({ success: false, message: "Build já está em andamento." });

  const { spawn } = require("child_process");
  const cwd = path.resolve(__dirname);

  buildProc = spawn("npx", ["electron-builder", "--win", "--x64"], {
    cwd,
    shell: true,
  });

  res.json({ success: true, message: "Build iniciado." });
  broadcastBuild({ type: "start" });

  buildProc.stdout?.on("data", (d) =>
    broadcastBuild({ type: "log", level: "info", text: d.toString() }),
  );
  buildProc.stderr?.on("data", (d) =>
    broadcastBuild({ type: "log", level: "warn", text: d.toString() }),
  );
  buildProc.on("exit", (code) => {
    buildProc = null;
    broadcastBuild({ type: "done", code, success: code === 0 });
  });
  buildProc.on("error", (err) => {
    buildProc = null;
    broadcastBuild({ type: "error", message: err.message });
  });
});

// Empurra o link do instalador para um IP específico ou para todos os agentes
app.post("/api/deploy/push", (req, res) => {
  const { ip, mode } = req.body; // mode: "single" | "all"
  const localIP = getLocalIPAddress();
  const url = `http://${localIP}:${PORT}/api/deploy/installer`;
  const msg = `data: ${JSON.stringify({ type: "install", url, serverIp: localIP })}\n\n`;

  if (mode === "all") {
    let sent = 0;
    sseAgents.forEach((client) => {
      try {
        client.write(msg);
        sent++;
      } catch {}
    });
    return res.json({
      success: true,
      sent,
      message: `Enviado para ${sent} dispositivo(s).`,
    });
  }

  if (!ip) return res.status(400).json({ error: "Informe o IP." });
  const client = sseAgents.get(ip);
  if (!client)
    return res
      .status(404)
      .json({ error: `Dispositivo ${ip} não está conectado como agente.` });

  try {
    client.write(msg);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Errors
app.use((err, req, res, next) => res.status(500).json({ error: err.message }));

initDatabase().then(() => {
  app.listen(PORT, () =>
    console.log(`Servidor rodando em http://localhost:${PORT}`),
  );
});
