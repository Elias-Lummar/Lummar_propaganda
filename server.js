const express = require("express");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const { initDatabase, getDb } = require("./db/database");
const { setupSwagger } = require("./swagger");

const app = express();
const PORT = process.env.PORT || 3010;

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
// Helper: Detecção de IP local (prefere a LAN/Wi-Fi real, ignora VPN/virtual)
// ============================================================================
const { getLocalIPAddress, getAllIPAddresses } = require("./lib/network");

// Pages
app.get("/", (req, res) => res.redirect("/admin"));
app.get("/admin", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "admin.html")),
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

// API - Ads
app.get("/api/ads", (req, res) => {
  const db = getDb();
  db.all(
    "SELECT * FROM ads ORDER BY display_order ASC, id DESC",
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      db.all(
        "SELECT ad_id, screen, display_order FROM ad_screen_orders",
        [],
        (err2, orderRows) => {
          if (err2) return res.status(500).json({ error: err2.message });
          const screenOrders = {};
          if (orderRows) {
            for (const r of orderRows) {
              if (!screenOrders[r.ad_id]) screenOrders[r.ad_id] = {};
              screenOrders[r.ad_id][r.screen] = r.display_order;
            }
          }
          res.json(
            rows.map((r) => ({
              ...r,
              screens: JSON.parse(r.screens || "[]"),
              screen_orders: screenOrders[r.id] || {},
            })),
          );
        },
      );
    },
  );
});

app.get("/api/ads/active", (req, res) => {
  const db = getDb();
  const now = new Date().toISOString();
  const panel = req.query.panel || "presenter";

  db.all(
    `SELECT ads.*, COALESCE(aso.display_order, ads.display_order) AS effective_order
     FROM ads
     LEFT JOIN ad_screen_orders aso ON aso.ad_id = ads.id AND aso.screen = ?
     WHERE ads.start_time <= ? AND ads.end_time >= ?
     ORDER BY effective_order ASC, ads.id ASC`,
    [panel, now, now],
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
          const newId = this.lastID;
          // Inserir ordens por tela em ad_screen_orders
          let pending = screens.length;
          if (pending === 0) return res.json({ id: newId });
          screens.forEach((screen) => {
            db.get(
              "SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM ad_screen_orders WHERE screen = ?",
              [screen],
              (e2, row2) => {
                const screenOrder = row2 && !e2 ? row2.next_order : nextOrder;
                db.run(
                  "INSERT OR IGNORE INTO ad_screen_orders (ad_id, screen, display_order) VALUES (?, ?, ?)",
                  [newId, screen, screenOrder],
                  () => {
                    pending--;
                    if (pending === 0) res.json({ id: newId });
                  },
                );
              },
            );
          });
        },
      );
    },
  );
});

// Reorder ads (drag-and-drop) — must come BEFORE /api/ads/:id
app.put("/api/ads/reorder", (req, res) => {
  const { orders, screen } = req.body;
  if (!Array.isArray(orders)) {
    return res.status(400).json({ error: "orders deve ser um array" });
  }

  const db = getDb();
  let errors = [];

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    if (screen) {
      // Ordem específica por tela
      const stmt = db.prepare(
        "INSERT OR REPLACE INTO ad_screen_orders (ad_id, screen, display_order) VALUES (?, ?, ?)",
      );
      for (let i = 0; i < orders.length; i++) {
        stmt.run([orders[i].id, screen, orders[i].order], (err) => {
          if (err) errors.push(err.message);
        });
      }
      stmt.finalize();
    } else {
      // Legado: ordem global
      const stmt = db.prepare("UPDATE ads SET display_order = ? WHERE id = ?");
      for (let i = 0; i < orders.length; i++) {
        stmt.run([orders[i].order, orders[i].id], (err) => {
          if (err) errors.push(err.message);
        });
      }
      stmt.finalize();
    }
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

  // Buscar telas atuais para detectar adições/remoções
  db.get(
    "SELECT screens FROM ads WHERE id = ?",
    [req.params.id],
    (err0, oldRow) => {
      if (err0) return res.status(500).json({ error: err0.message });
      const oldScreens = oldRow ? JSON.parse(oldRow.screens || "[]") : [];
      const removedScreens = oldScreens.filter((s) => !screens.includes(s));
      const addedScreens = screens.filter((s) => !oldScreens.includes(s));

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

          function removeScreens(cb) {
            if (!removedScreens.length) return cb();
            let pending = removedScreens.length;
            removedScreens.forEach((screen) => {
              db.run(
                "DELETE FROM ad_screen_orders WHERE ad_id = ? AND screen = ?",
                [req.params.id, screen],
                () => {
                  if (--pending === 0) cb();
                },
              );
            });
          }

          function addScreens(cb) {
            if (!addedScreens.length) return cb();
            let pending = addedScreens.length;
            addedScreens.forEach((screen) => {
              db.get(
                "SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM ad_screen_orders WHERE screen = ?",
                [screen],
                (e2, row2) => {
                  const order = row2 && !e2 ? row2.next_order : 1;
                  db.run(
                    "INSERT OR IGNORE INTO ad_screen_orders (ad_id, screen, display_order) VALUES (?, ?, ?)",
                    [req.params.id, screen, order],
                    () => {
                      if (--pending === 0) cb();
                    },
                  );
                },
              );
            });
          }

          removeScreens(() => addScreens(() => res.json({ success: true })));
        },
      );
    },
  );
});

app.delete("/api/ads/:id", (req, res) => {
  const db = getDb();
  const screenToRemove = req.query.screen; // Recebe a tela a ser removida

  db.get(
    "SELECT file_path, screens FROM ads WHERE id=?",
    [req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row)
        return res.status(404).json({ error: "Propaganda não encontrada" });

      // Se nenhuma tela foi especificada, exclui completamente
      if (!screenToRemove) {
        // Excluir arquivo
        if (row?.file_path) {
          const file = path.join(__dirname, "public", row.file_path);
          if (fs.existsSync(file)) fs.unlinkSync(file);
        }
        // Limpar ordens por tela e excluir do banco
        db.run(
          "DELETE FROM ad_screen_orders WHERE ad_id = ?",
          [req.params.id],
          () => {
            db.run("DELETE FROM ads WHERE id=?", [req.params.id], () =>
              res.json({ success: true, deleted: true }),
            );
          },
        );
      } else {
        // Remove apenas a tela especificada do array de screens
        try {
          let screens = JSON.parse(row.screens || "[]");
          screens = screens.filter((s) => s !== screenToRemove);

          if (screens.length === 0) {
            // Se nenhuma tela ficar, exclui a propaganda completamente
            if (row?.file_path) {
              const file = path.join(__dirname, "public", row.file_path);
              if (fs.existsSync(file)) fs.unlinkSync(file);
            }
            db.run(
              "DELETE FROM ad_screen_orders WHERE ad_id = ?",
              [req.params.id],
              () => {
                db.run("DELETE FROM ads WHERE id=?", [req.params.id], () =>
                  res.json({ success: true, deleted: true }),
                );
              },
            );
          } else {
            // Atualiza apenas o array de screens e remove a entrada de ordem da tela removida
            db.run(
              "DELETE FROM ad_screen_orders WHERE ad_id = ? AND screen = ?",
              [req.params.id, screenToRemove],
              () => {
                db.run(
                  "UPDATE ads SET screens = ? WHERE id = ?",
                  [JSON.stringify(screens), req.params.id],
                  () =>
                    res.json({
                      success: true,
                      deleted: false,
                      remainingScreens: screens,
                    }),
                );
              },
            );
          }
        } catch (parseErr) {
          res
            .status(500)
            .json({ error: "Erro ao processar screens: " + parseErr.message });
        }
      }
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

// ============================================================================
// HTTPS opcional (camada dupla: habilita a Wake Lock nativa nas TVs)
// ----------------------------------------------------------------------------
// Sobe LADO A LADO com o HTTP (sem redirect): TVs que não confiarem no
// certificado continuam funcionando por HTTP — o vídeo-âncora mantém a tela
// acordada de qualquer forma. Quem abrir por HTTPS ganha a Wake Lock de bônus.
// O certificado é lido de ./certs (gere com: npm run gen-cert).
// ============================================================================
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

function startHttpsIfAvailable(localIP) {
  const https = require("https");
  const certDir = path.join(__dirname, "certs");
  const keyPath = path.join(certDir, "server.key");
  const crtPath = path.join(certDir, "server.crt");

  if (!fs.existsSync(keyPath) || !fs.existsSync(crtPath)) {
    console.log(`ℹ️  HTTPS desativado: nenhum certificado em ./certs`);
    console.log(`   A Wake Lock nativa só funciona em HTTPS. Habilite com:`);
    console.log(`   npm run gen-cert\n`);
    return;
  }

  try {
    const options = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(crtPath),
    };
    https.createServer(options, app).listen(HTTPS_PORT, "0.0.0.0", () => {
      console.log(`🔒 HTTPS: https://${localIP}:${HTTPS_PORT}`);
      console.log(`   (abra os apresentadores por HTTPS para ativar a Wake Lock)\n`);
    });
  } catch (err) {
    console.error(`⚠️  Falha ao iniciar HTTPS: ${err.message}`);
    console.log(`   Seguindo só em HTTP (o vídeo-âncora mantém as TVs acordadas).\n`);
  }
}

initDatabase().then(() => {
  const localIP = getLocalIPAddress();
  const allIPs = getAllIPAddresses();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n✅ Servidor rodando!`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`LocalHost: http://localhost:${PORT}`);
    console.log(`Rede Padrão: http://${localIP}:${PORT}`);
    console.log(`\n📡 Todas as interfaces disponíveis:`);
    for (const [interfaceName, ips] of Object.entries(allIPs)) {
      console.log(`  ${interfaceName}: ${ips.join(", ")}`);
    }
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    startHttpsIfAvailable(localIP);
  });
});
