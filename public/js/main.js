const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const http = require("http");
const https = require("https");

let selectorWindow = null;
let mainWindow = null;
let isDev = process.argv.includes("--dev");
let isLaunchingPresenter = false;

// Detecta se um presenter foi passado via argumento --presenter=arquivo.html
let cliPresenter = null;
for (const arg of process.argv) {
  if (arg.startsWith("--presenter=")) {
    cliPresenter = arg.split("=")[1];
    break;
  }
}

// ============================================================================
// Janela de Seleção de Tela
// ============================================================================
function createSelectorWindow() {
  selectorWindow = new BrowserWindow({
    width: 620,
    height: 420,
    resizable: false,
    center: true,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  selectorWindow.loadFile(path.join(__dirname, "..", "screen-selector.html"));

  if (isDev) {
    selectorWindow.webContents.openDevTools({ mode: "detach" });
  }

  selectorWindow.on("closed", () => {
    selectorWindow = null;
    // Só encerra o app se não estiver abrindo o presenter
    if (!mainWindow && !isLaunchingPresenter) app.quit();
  });
}

// ============================================================================
// Janela Presenter (abre no display escolhido)
// ============================================================================
function createPresenterWindow(
  targetDisplay,
  presenterFile = "presenter.html",
) {
  const { x, y, width, height } = targetDisplay.bounds;

  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    show: false, // mostra só quando estiver pronto para evitar flash branco
    fullscreen: !isDev,
    frame: isDev,
    kiosk: !isDev,
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  // Permissão de autoplay
  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      callback(permission === "media");
    },
  );

  mainWindow.loadFile(path.join(__dirname, "..", presenterFile));

  // Mostra a janela somente quando o conteúdo estiver pronto (sem flash branco)
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (!isDev) {
      mainWindow.setFullScreen(true);
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ============================================================================
// Flags do Chrome para autoplay
// ============================================================================
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-features", "MediaSessionService");

app.whenReady().then(() => {
  if (cliPresenter) {
    // Presenter passado via CLI — abre direto no monitor principal sem seletor
    console.log(`[Electron] Presenter via CLI: ${cliPresenter}`);
    const primaryDisplay = screen.getPrimaryDisplay();
    createPresenterWindow(primaryDisplay, cliPresenter);
  } else {
    createSelectorWindow();
  }
});

app.on("window-all-closed", () => {
  // Ignora se estiver no meio da transição seletor → presenter
  if (process.platform !== "darwin" && !isLaunchingPresenter) app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (cliPresenter) {
      const primaryDisplay = screen.getPrimaryDisplay();
      createPresenterWindow(primaryDisplay, cliPresenter);
    } else {
      createSelectorWindow();
    }
  }
});

// ============================================================================
// IPC – Seleção de tela
// ============================================================================

// Retorna lista de displays para o renderer
ipcMain.handle("get-displays", () => {
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    x: d.bounds.x,
    y: d.bounds.y,
    width: d.bounds.width,
    height: d.bounds.height,
    isPrimary: d.id === screen.getPrimaryDisplay().id,
  }));
});

// Usuário escolheu um display e um presenter
ipcMain.on("select-display", (event, displayId, presenterFile) => {
  const all = screen.getAllDisplays();
  const chosen =
    all.find((d) => d.id === displayId) || screen.getPrimaryDisplay();
  const file = presenterFile || "presenter.html";

  // Sinaliza que está abrindo o presenter para evitar app.quit() no closed
  isLaunchingPresenter = true;

  // Fecha o seletor e abre o presenter
  if (selectorWindow) {
    selectorWindow.destroy();
    selectorWindow = null;
  }

  createPresenterWindow(chosen, file);
  isLaunchingPresenter = false;
});

// Usuário pressionou Esc no seletor
ipcMain.on("close-selector", () => {
  if (selectorWindow) {
    selectorWindow.destroy();
    selectorWindow = null;
  }
  app.quit();
});

// Função auxiliar para fazer requisições HTTP
function fetchAPI(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;

    const request = protocol.get(url, (res) => {
      let data = "";

      // Verificar status HTTP
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (e) {
          reject(new Error("Erro ao parsear JSON: " + e.message));
        }
      });
    });

    request.on("error", (err) => {
      reject(new Error("Erro de conexão: " + err.message));
    });

    // Timeout de 10 segundos
    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error("Timeout: A API não respondeu em 10 segundos"));
    });
  });
}

// IPC Handler para carregar propagandas da API
ipcMain.handle("get-active-ads", async (event, panel) => {
  try {
    console.log(
      `[${new Date().toLocaleTimeString()}] Carregando propagandas do painel: ${panel}`,
    );

    const apiUrl = `http://localhost:3000/ads/active?panel=${encodeURIComponent(panel)}`;
    console.log(`[API] URL: ${apiUrl}`);

    const ads = await fetchAPI(apiUrl);

    console.log(`[API] ${ads.length} propagandas carregadas com sucesso`);

    // Log de cada propaganda carregada (apenas em modo dev)
    if (isDev && Array.isArray(ads)) {
      ads.forEach((ad, index) => {
        console.log(`  ${index + 1}. ${ad.title} (${ad.file_path})`);
      });
    }

    return ads;
  } catch (error) {
    console.error("[API] Erro ao carregar propagandas:", error.message);

    // Retorna array vazio em caso de erro para não quebrar a aplicação
    return [];
  }
});
