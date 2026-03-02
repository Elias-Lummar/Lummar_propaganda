const { contextBridge, ipcRenderer } = require("electron");

// Exponha APIs seguras para o renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  // Buscar propagandas ativas da API
  getActiveAds: (panel) => ipcRenderer.invoke("get-active-ads", panel),

  // Seleção de tela
  getDisplays: () => ipcRenderer.invoke("get-displays"),
  selectDisplay: (displayId, presenterFile) =>
    ipcRenderer.send("select-display", displayId, presenterFile),
  closeSelector: () => ipcRenderer.send("close-selector"),
});
