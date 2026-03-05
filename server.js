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
app.use(express.json({ limit: "1gb" }));
app.use(express.urlencoded({ extended: true, limit: "1gb" }));
app.use(express.static("public"));

// Timeout maior para uploads grandes (10 minutos)
app.use((req, res, next) => {
  if (req.url === "/api/upload") {
    req.setTimeout(10 * 60 * 1000); // 10 min
    res.setTimeout(10 * 60 * 1000);
  }
  next();
});

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
  limits: { fileSize: 1024 * 1024 * 1024 },
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
  const db = getDb();
  db.all(
    "SELECT * FROM ads ORDER BY display_order ASC, id DESC",
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(
        rows.map((r) => ({ ...r, screens: JSON.parse(r.screens || "[]") })),
      );
    },
  );
});

app.get("/api/ads/active", (req, res) => {
  const db = getDb();
  const now = new Date().toISOString();
  const panel = req.query.panel || "presenter";

  db.all(
    "SELECT * FROM ads WHERE start_time <= ? AND end_time >= ? ORDER BY display_order ASC, id ASC",
    [now, now],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const ads = rows
        .map((r) => ({ ...r, screens: JSON.parse(r.screens || "[]") }))
        .filter((r) => r.screens.includes(panel));

      res.json(ads);
    },
  );
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

  console.log("[POST /api/ads] Recebido:", { title, file_path, screens });

  if (!Array.isArray(screens) || !screens.length) {
    return res.status(400).json({ error: "Selecione ao menos um painel" });
  }

  if (!file_path) {
    return res.status(400).json({ error: "Caminho do arquivo não informado" });
  }

  const db = getDb();
  // Obter o próximo display_order disponível
  db.get(
    "SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM ads",
    [],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      const nextOrder = row.next_order;
      db.run(
        "INSERT INTO ads (title, file_path, start_time, end_time, transition_type, transition_duration, screens, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          title,
          file_path,
          start_time,
          end_time,
          transition_type,
          transition_duration,
          JSON.stringify(screens),
          nextOrder,
        ],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ id: this.lastID });
        },
      );
    },
  );
});

// Reorder ads (drag-and-drop) — must come BEFORE /api/ads/:id
app.put("/api/ads/reorder", (req, res) => {
  const { orders } = req.body;
  if (!Array.isArray(orders)) {
    return res.status(400).json({ error: "orders deve ser um array" });
  }

  const db = getDb();
  const stmt = db.prepare("UPDATE ads SET display_order = ? WHERE id = ?");
  let errors = [];

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    for (let i = 0; i < orders.length; i++) {
      stmt.run([orders[i].order, orders[i].id], (err) => {
        if (err) errors.push(err.message);
      });
    }
    stmt.finalize();
    db.run("COMMIT", (err) => {
      if (err || errors.length > 0) {
        return res
          .status(500)
          .json({ error: errors.join(", ") || err.message });
      }
      res.json({ success: true, updated: orders.length });
    });
  });
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

  const db = getDb();
  db.run(
    "UPDATE ads SET title=?, file_path=?, start_time=?, end_time=?, transition_type=?, transition_duration=?, screens=? WHERE id=?",
    [
      title,
      file_path,
      start_time,
      end_time,
      transition_type,
      transition_duration,
      JSON.stringify(screens),
      req.params.id,
    ],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    },
  );
});

app.delete("/api/ads/:id", (req, res) => {
  const db = getDb();
  db.get(
    "SELECT file_path FROM ads WHERE id=?",
    [req.params.id],
    (err, row) => {
      if (row?.file_path) {
        const file = path.join(__dirname, "public", row.file_path);
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }

      db.run("DELETE FROM ads WHERE id=?", [req.params.id], () =>
        res.json({ success: true }),
      );
    },
  );
});

app.post(
  "/api/upload",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res
              .status(413)
              .json({ error: "Arquivo muito grande! Tamanho máximo: 1GB" });
          }
          return res
            .status(400)
            .json({ error: "Erro no upload: " + err.message });
        }
        return res.status(500).json({ error: err.message });
      }
      if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado" });
      }
      next();
    });
  },
  async (req, res) => {
    const file_path = "/uploads/" + req.file.filename;
    let duration = 0;

    if (req.file.mimetype.startsWith("video/")) {
      duration = await getVideoDuration(
        path.join(__dirname, "public", file_path),
      );
    }

    res.json({ file_path, video_duration: duration });
  },
);

// Errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(413)
        .json({ error: "Arquivo muito grande! Tamanho máximo: 1GB" });
    }
    return res.status(400).json({ error: "Erro no upload: " + err.message });
  }
  res.status(500).json({ error: err.message });
});

initDatabase().then(() => {
  app.listen(PORT, () =>
    console.log(`Servidor rodando em http://localhost:${PORT}`),
  );
});
