/**
 * ============================================================================
 * Sistema de Apresentação de Propagandas (Refatorado)
 * ============================================================================
 * Controlador principal que orquestra todos os módulos.
 * Escrito em ES5 PURO para compatibilidade com TVs antigas.
 * NÃO usa fetch, Promise, arrow functions, const/let, template literals.
 *
 * Dependências (carregadas via <script> antes deste arquivo):
 *   - TVCompat        → Compatibilidade com TVs
 *   - SleepPrevention → Prevenção de hibernação (NoSleep.js)
 *   - AdsQueue        → Fila de propagandas
 *   - MediaFactory    → Criação de elementos de mídia
 */

(function () {
  "use strict";

  var LOG_PREFIX = "[Presenter]";

  // ========================================================================
  // Configuração
  // ========================================================================
  var CONFIG = {
    // Host da API (será detectado no init())
    apiHost: null,

    // Intervalo de atualização automática (ms)
    refreshInterval: 5000,

    // Duração padrão de exibição de imagem (segundos)
    defaultImageDuration: 10,

    // Delay ao avançar após erro de mídia (ms)
    errorSkipDelay: 1000,

    // Timeout para XHR da API (ms)
    fetchTimeout: 15000,
  };

  // ========================================================================
  // XMLHttpRequest Helper (substitui fetch + Promise)
  // ========================================================================

  /**
   * Faz uma requisição GET via XMLHttpRequest com timeout.
   * Compatível com todos os browsers, incluindo TVs antigas.
   *
   * @param {string}   url        - URL da requisição
   * @param {number}   timeout    - Timeout em milissegundos
   * @param {function} onSuccess  - callback(parsedJSON)
   * @param {function} onError    - callback(errorMessage)
   */
  function xhrGet(url, timeout, onSuccess, onError) {
    var xhr;
    var timedOut = false;

    // Compatibilidade com IE/TVs antigas
    if (typeof XMLHttpRequest !== "undefined") {
      xhr = new XMLHttpRequest();
    } else if (typeof ActiveXObject !== "undefined") {
      try {
        xhr = new ActiveXObject("Msxml2.XMLHTTP.6.0");
      } catch (e1) {
        try {
          xhr = new ActiveXObject("Msxml2.XMLHTTP.3.0");
        } catch (e2) {
          if (onError) onError("XMLHttpRequest não suportado");
          return;
        }
      }
    } else {
      if (onError) onError("XMLHttpRequest não suportado");
      return;
    }

    // Timeout manual (para browsers sem xhr.timeout)
    var timer = setTimeout(function () {
      timedOut = true;
      try {
        xhr.abort();
      } catch (e) {
        // silencioso
      }
      if (onError) onError("Timeout após " + timeout / 1000 + "s");
    }, timeout);

    xhr.open("GET", url, true);

    // Tenta setar headers (pode falhar em alguns browsers antigos)
    try {
      xhr.setRequestHeader("Content-Type", "application/json");
    } catch (e) {
      // silencioso
    }

    try {
      xhr.setRequestHeader("Cache-Control", "no-cache");
    } catch (e) {
      // silencioso
    }

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (timedOut) return;

      clearTimeout(timer);

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (onSuccess) onSuccess(data);
        } catch (e) {
          if (onError) onError("Resposta inválida: " + e.message);
        }
      } else {
        if (onError) onError("API retornou status " + xhr.status);
      }
    };

    // Fallback de erro de rede
    if (typeof xhr.onerror !== "undefined") {
      xhr.onerror = function () {
        if (timedOut) return;
        clearTimeout(timer);
        if (onError) onError("Erro de rede");
      };
    }

    xhr.send(null);
  }

  /**
   * Faz uma requisição POST via XMLHttpRequest com timeout.
   * Compatível com todos os browsers, incluindo TVs antigas.
   *
   * @param {string}   url        - URL da requisição
   * @param {*}        body       - Corpo da requisição (será JSON.stringify se não for null)
   * @param {number}   timeout    - Timeout em milissegundos
   * @param {function} onSuccess  - callback(parsedJSON)
   * @param {function} onError    - callback(errorMessage)
   */
  function xhrPost(url, body, timeout, onSuccess, onError) {
    var xhr;
    var timedOut = false;

    if (typeof XMLHttpRequest !== "undefined") {
      xhr = new XMLHttpRequest();
    } else if (typeof ActiveXObject !== "undefined") {
      try {
        xhr = new ActiveXObject("Msxml2.XMLHTTP.6.0");
      } catch (e1) {
        try {
          xhr = new ActiveXObject("Msxml2.XMLHTTP.3.0");
        } catch (e2) {
          if (onError) onError("XMLHttpRequest não suportado");
          return;
        }
      }
    } else {
      if (onError) onError("XMLHttpRequest não suportado");
      return;
    }

    var timer = setTimeout(function () {
      timedOut = true;
      try {
        xhr.abort();
      } catch (e) {
        /* silencioso */
      }
      if (onError) onError("Timeout após " + timeout / 1000 + "s");
    }, timeout);

    xhr.open("POST", url, true);

    try {
      xhr.setRequestHeader("Content-Type", "application/json");
    } catch (e) {
      /* silencioso */
    }

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (timedOut) return;
      clearTimeout(timer);

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (onSuccess) onSuccess(data);
        } catch (e) {
          if (onError) onError("Resposta inválida: " + e.message);
        }
      } else {
        if (onError) onError("API retornou status " + xhr.status);
      }
    };

    if (typeof xhr.onerror !== "undefined") {
      xhr.onerror = function () {
        if (timedOut) return;
        clearTimeout(timer);
        if (onError) onError("Erro de rede");
      };
    }

    xhr.send(body ? JSON.stringify(body) : null);
  }

  /**
   * Detecta o host da API automaticamente
   */
  function detectApiHost() {
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    ) {
      return window.location.origin;
    }

    if (window.location.protocol === "file:") {
      return "http://localhost:3000";
    }

    return window.location.origin;
  }

  /**
   * Descobrir IP do servidor consultando /api/server-info
   * Usa callback em vez de Promise.
   *
   * @param {function} callback - callback(apiHost)
   */
  function discoverServerHost(callback) {
    var fallbackHost = detectApiHost();

    xhrGet(
      fallbackHost + "/api/server-info",
      5000,
      function (data) {
        if (data && data.host) {
          console.log(LOG_PREFIX + " ✓ Servidor descoberto: " + data.host);
          callback(data.host);
        } else {
          callback(fallbackHost);
        }
      },
      function () {
        console.log(LOG_PREFIX + " Usando fallback: " + fallbackHost);
        callback(fallbackHost);
      },
    );
  }

  // ========================================================================
  // Estado da Aplicação
  // ========================================================================
  var state = {
    queue: null,
    currentMediaElement: null,
    nextTimeout: null,
    panel: "",
    lastAdsSnapshot: null,
    updateIntervalId: null,
    isUpdating: false,
    isInitialized: false,
  };

  var dom = {
    container: null,
    loading: null,
    noAds: null,
    debug: null,
  };

  // ========================================================================
  // Detecção de Painel
  // ========================================================================
  function detectPanel() {
    var path = window.location.pathname || "";
    var match = path.match(/presenter(\d*)/);
    var panel = match ? match[0] : "presenter";
    console.log(LOG_PREFIX + " Painel detectado: " + panel);
    return panel;
  }

  // ========================================================================
  // Filtro de Propagandas
  // ========================================================================
  function filterAdsByPanel(ads) {
    var now = new Date();
    var panel = state.panel;
    var filtered = [];

    for (var i = 0; i < ads.length; i++) {
      var ad = ads[i];

      // Validação de start_time
      if (ad.start_time) {
        var startTime = new Date(ad.start_time);
        if (isNaN(startTime.getTime())) {
          console.warn(
            LOG_PREFIX +
              ' Ad "' +
              ad.title +
              '" (ID: ' +
              ad.id +
              ") start_time inválido",
          );
          continue;
        }
        if (startTime > now) {
          console.log(LOG_PREFIX + ' ⏳ "' + ad.title + '" ainda não iniciou');
          continue;
        }
      }

      // Validação de end_time
      if (ad.end_time) {
        var endTime = new Date(ad.end_time);
        if (isNaN(endTime.getTime())) {
          console.warn(
            LOG_PREFIX +
              ' Ad "' +
              ad.title +
              '" (ID: ' +
              ad.id +
              ") end_time inválido",
          );
          continue;
        }
        if (endTime < now) {
          console.log(LOG_PREFIX + ' ⏰ "' + ad.title + '" expirado');
          continue;
        }
      }

      // Validação de screens
      var screens = parseScreens(ad.screens);
      if (screens === null) {
        console.warn(
          LOG_PREFIX + ' Ad "' + ad.title + '" sem campo screens válido',
        );
        continue;
      }

      // Verifica se o painel está incluído
      var hasPanel = false;
      for (var j = 0; j < screens.length; j++) {
        if (screens[j] === panel) {
          hasPanel = true;
          break;
        }
      }

      if (hasPanel) {
        console.log(
          LOG_PREFIX + ' ✓ "' + ad.title + '" inclui painel ' + panel,
        );
        filtered.push(ad);
      } else {
        console.log(
          LOG_PREFIX + ' ✗ "' + ad.title + '" não inclui painel ' + panel,
        );
      }
    }

    return filtered;
  }

  /**
   * Parse do campo screens (pode ser array ou string JSON)
   */
  function parseScreens(screens) {
    if (!screens) return null;

    if (Array.isArray(screens)) return screens;

    if (typeof screens === "string") {
      try {
        var parsed = JSON.parse(screens);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        // Não é JSON válido
      }
    }

    return null;
  }

  // ========================================================================
  // Carregamento de Propagandas (via XHR com callbacks)
  // ========================================================================
  function loadActiveAds(callback) {
    showLoading(true);

    var apiUrl = CONFIG.apiHost + "/api/ads";
    console.log(LOG_PREFIX + " Buscando propagandas: " + apiUrl);

    xhrGet(
      apiUrl,
      CONFIG.fetchTimeout,
      function (ads) {
        showLoading(false);

        if (!Array.isArray(ads)) {
          showError("Resposta inválida: esperado array");
          if (callback) callback();
          return;
        }

        console.log(
          LOG_PREFIX + " " + ads.length + " propagandas recebidas da API",
        );

        // Filtra por painel e datas
        var filteredAds = filterAdsByPanel(ads);
        console.log(
          LOG_PREFIX +
            " " +
            filteredAds.length +
            ' propagandas para painel "' +
            state.panel +
            '"',
        );

        // Filtra sem file_path
        var validAds = [];
        for (var i = 0; i < filteredAds.length; i++) {
          if (filteredAds[i].file_path) {
            validAds.push(filteredAds[i]);
          } else {
            console.warn(
              LOG_PREFIX + " Propaganda sem file_path: " + filteredAds[i].title,
            );
          }
        }

        console.log(
          LOG_PREFIX + " ✓ " + validAds.length + " propagandas válidas",
        );

        // Salva snapshot
        state.lastAdsSnapshot = JSON.stringify(validAds);

        // Popula fila
        state.queue.setAds(validAds);

        if (state.queue.isEmpty()) {
          showNoAdsMessage();
        } else {
          hideNoAdsMessage();
          displayCurrentAd();
        }

        if (callback) callback();
      },
      function (errorMsg) {
        showLoading(false);
        console.error(LOG_PREFIX + " ❌ Erro: " + errorMsg);
        showError("Erro ao conectar com a API: " + errorMsg);
        if (callback) callback();
      },
    );
  }

  // ========================================================================
  // Atualização Automática
  // ========================================================================
  function startAutoRefresh() {
    if (state.updateIntervalId) {
      clearInterval(state.updateIntervalId);
    }

    state.updateIntervalId = setInterval(function () {
      refreshAds();
    }, CONFIG.refreshInterval);

    console.log(
      LOG_PREFIX +
        " ✓ Auto-refresh iniciado (" +
        CONFIG.refreshInterval / 1000 +
        "s)",
    );
  }

  function refreshAds() {
    if (state.isUpdating) return;
    state.isUpdating = true;

    var apiUrl = CONFIG.apiHost + "/api/ads";

    xhrGet(
      apiUrl,
      CONFIG.fetchTimeout,
      function (ads) {
        state.isUpdating = false;

        if (!ads || !Array.isArray(ads)) return;

        var filteredAds = filterAdsByPanel(ads);
        var validAds = [];
        for (var i = 0; i < filteredAds.length; i++) {
          if (filteredAds[i].file_path) validAds.push(filteredAds[i]);
        }

        console.log(
          LOG_PREFIX + " [Refresh] " + validAds.length + " anúncios válidos",
        );

        if (detectChanges(validAds)) {
          console.log(LOG_PREFIX + " 🔄 MUDANÇAS DETECTADAS");
          applyUpdate(validAds);
        }

        state.lastAdsSnapshot = JSON.stringify(validAds);
      },
      function (errorMsg) {
        state.isUpdating = false;
        console.error(LOG_PREFIX + " [Refresh] Erro: " + errorMsg);
      },
    );
  }

  function detectChanges(newAds) {
    var newSnapshot = JSON.stringify(newAds);
    if (state.lastAdsSnapshot === null) return false;
    return state.lastAdsSnapshot !== newSnapshot;
  }

  function applyUpdate(newAds) {
    var wasEmpty = state.queue.isEmpty();
    var isCurrentRemoved = state.queue.updateQueue(newAds);

    // Caso 1: Estava vazio, agora tem
    if (wasEmpty && !state.queue.isEmpty()) {
      console.log(LOG_PREFIX + " ▶️ Iniciando reprodução");
      hideNoAdsMessage();
      displayCurrentAd();
      return;
    }

    // Caso 2: Ficou vazio
    if (state.queue.isEmpty()) {
      console.log(LOG_PREFIX + " ⏸️ Fila vazia");
      showNoAdsMessage();
      return;
    }

    // Caso 3: Propaganda atual foi removida
    if (isCurrentRemoved) {
      console.log(LOG_PREFIX + " ⏭️ Propaganda atual removida, avançando...");
      displayCurrentAd();
      return;
    }

    // Caso 4: Sem impacto na reprodução atual
    console.log(LOG_PREFIX + " ℹ️ Atualização sem impacto na reprodução");
    updateDebugInfo();
  }

  // ========================================================================
  // Exibição de Mídia
  // ========================================================================
  function displayCurrentAd() {
    var ad = state.queue.getCurrent();
    if (!ad) {
      showNoAdsMessage();
      return;
    }

    var position =
      state.queue.getCurrentIndex() + 1 + "/" + state.queue.getSize();
    console.log(LOG_PREFIX + " 🎬 " + position + ": " + ad.title);

    clearCurrentMedia();

    // Keep-awake: decide ANTES de criar a mídia, para liberar o decodificador
    // a tempo em TVs de 1 decodificador. Vídeo segura o painel sozinho ->
    // pausa o âncora; imagem depende do âncora -> garante tocando.
    if (typeof KeepAwake !== "undefined") {
      if (MediaFactory.isVideo(ad.file_path)) {
        KeepAwake.relax();
      } else {
        KeepAwake.engage();
      }
    }

    // Callbacks para os eventos de mídia
    var callbacks = {
      onLoaded: function () {
        updateDebugInfo();

        // Se é imagem, agenda próxima
        if (!MediaFactory.isVideo(ad.file_path)) {
          var duration =
            (ad.transition_duration || CONFIG.defaultImageDuration) * 1000;
          state.nextTimeout = setTimeout(function () {
            console.log(LOG_PREFIX + " ⏭️ Tempo da imagem finalizado");
            next();
          }, duration);
        }
      },
      onEnded: function () {
        next();
      },
      onError: function (failedAd, errorMsg) {
        console.error(
          LOG_PREFIX +
            " Mídia falhou: " +
            failedAd.title +
            " [" +
            errorMsg +
            "]",
        );
        setTimeout(function () {
          next();
        }, CONFIG.errorSkipDelay);
      },
    };

    // Cria elemento via factory
    var mediaElement = MediaFactory.create(ad, CONFIG.apiHost, callbacks);
    if (!mediaElement) {
      console.error(LOG_PREFIX + " Falha ao criar mídia para: " + ad.title);
      setTimeout(function () {
        next();
      }, CONFIG.errorSkipDelay);
      return;
    }

    dom.container.appendChild(mediaElement);
    state.currentMediaElement = mediaElement;

    // Anima entrada com fallback seguro para TVs sem rAF
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(function () {
        mediaElement.className += " active";
      });
    } else {
      setTimeout(function () {
        mediaElement.className += " active";
      }, 50);
    }

    updateDebugInfo();
  }

  // ========================================================================
  // Navegação
  // ========================================================================
  function next() {
    if (state.queue.isEmpty()) {
      console.warn(LOG_PREFIX + " ⚠️ Fila vazia");
      return;
    }
    state.queue.getNext();
    displayCurrentAd();
  }

  function previous() {
    if (state.queue.isEmpty()) {
      console.warn(LOG_PREFIX + " ⚠️ Fila vazia");
      return;
    }
    state.queue.getPrevious();
    displayCurrentAd();
  }

  // ========================================================================
  // Limpeza de Mídia
  // ========================================================================
  function clearCurrentMedia() {
    if (state.nextTimeout) {
      clearTimeout(state.nextTimeout);
      state.nextTimeout = null;
    }

    var items = dom.container.querySelectorAll(".media-item");
    for (var i = 0; i < items.length; i++) {
      MediaFactory.destroy(items[i]);
    }

    state.currentMediaElement = null;
  }

  // ========================================================================
  // UI Helpers
  // ========================================================================
  function showLoading(show) {
    if (dom.loading) {
      dom.loading.style.display = show ? "flex" : "none";

      if (typeof TVCompat !== "undefined" && TVCompat.hasQuirk("no-flexbox")) {
        dom.loading.style.display = show ? "block" : "none";
      }
    }
  }

  function showNoAdsMessage() {
    if (dom.noAds) {
      dom.noAds.style.display = "flex";
      if (typeof TVCompat !== "undefined" && TVCompat.hasQuirk("no-flexbox")) {
        dom.noAds.style.display = "block";
      }
    }
    clearCurrentMedia();

    // Sem propaganda também não pode hibernar: garante o âncora tocando
    if (typeof KeepAwake !== "undefined") {
      KeepAwake.engage();
    }

    console.log(LOG_PREFIX + " 🔭 Nenhuma propaganda disponível");
  }

  function hideNoAdsMessage() {
    if (dom.noAds) {
      dom.noAds.style.display = "none";
    }
  }

  function showError(message) {
    console.error(LOG_PREFIX + " ❌ " + message);
    dom.container.innerHTML =
      '<div class="error-message">' +
      "  <h3>⚠️ Erro</h3>" +
      "  <p>" +
      message +
      "</p>" +
      '  <p style="font-size:0.9rem;opacity:0.7;margin-top:10px;">' +
      "    API: " +
      CONFIG.apiHost +
      "  </p>" +
      '  <button onclick="location.reload()" style="margin-top:20px;padding:10px 20px;' +
      '    background:#007bff;color:#fff;border:none;border-radius:5px;cursor:pointer;">' +
      "    Tentar Novamente" +
      "  </button>" +
      "</div>";
  }

  // ========================================================================
  // Debug Info
  // ========================================================================
  function updateDebugInfo() {
    if (!dom.debug) return;

    var ad = state.queue.getCurrent();
    var panelEl = document.getElementById("panel-name");
    var queueSizeEl = document.getElementById("queue-size");
    var currentIndexEl = document.getElementById("current-index");
    var playbackStatusEl = document.getElementById("playback-status");
    var mediaTypeEl = document.getElementById("media-type");
    var sleepMethodEl = document.getElementById("sleep-method");
    var tvPlatformEl = document.getElementById("tv-platform");

    if (panelEl) panelEl.textContent = state.panel;
    if (queueSizeEl) queueSizeEl.textContent = state.queue.getSize();
    if (currentIndexEl) {
      currentIndexEl.textContent =
        state.queue.getSize() > 0
          ? state.queue.getCurrentIndex() + 1 + " de " + state.queue.getSize()
          : "0 de 0";
    }
    if (playbackStatusEl) {
      playbackStatusEl.textContent = state.currentMediaElement
        ? "REPRODUZINDO"
        : "PARADO";
    }
    if (mediaTypeEl && ad) {
      var type =
        state.currentMediaElement &&
        state.currentMediaElement.tagName === "VIDEO"
          ? "Vídeo"
          : "Imagem";
      var dur =
        type === "Imagem"
          ? " (" +
            (ad.transition_duration || CONFIG.defaultImageDuration) +
            "s)"
          : "";
      mediaTypeEl.textContent = type + ": " + ad.title + dur;
    } else if (mediaTypeEl) {
      mediaTypeEl.textContent = "-";
    }
    if (sleepMethodEl && typeof SleepPrevention !== "undefined") {
      sleepMethodEl.textContent = SleepPrevention.getActiveMethod();
    }
    if (tvPlatformEl && typeof TVCompat !== "undefined") {
      tvPlatformEl.textContent = TVCompat.getPlatformName();
    }
  }

  // ========================================================================
  // Overlay de Inicialização (Tela Cheia via clique do mouse)
  // ========================================================================

  /**
   * Entra em tela cheia usando a Fullscreen API (com prefixos)
   */
  function requestFullscreen() {
    var el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (el.mozRequestFullScreen) {
      el.mozRequestFullScreen();
    } else if (el.msRequestFullscreen) {
      el.msRequestFullscreen();
    } else {
      console.warn(LOG_PREFIX + " Fullscreen API não suportada");
    }
  }

  /**
   * Entra em tela cheia automaticamente ao carregar a página.
   */
  function setupFullscreen() {
    // Tenta entrar em fullscreen imediatamente
    requestFullscreen();

    // Ativa prevenção de hibernação
    if (typeof SleepPrevention !== "undefined") {
      SleepPrevention.enable();
      console.log(LOG_PREFIX + " ✓ SleepPrevention ativado");
    }

    // Esconde cursor após inatividade
    setupCursorAutoHide();

    console.log(LOG_PREFIX + " ▶️ Tela cheia iniciada automaticamente");
  }

  /**
   * Esconde o cursor do mouse após 3 segundos de inatividade
   */
  function setupCursorAutoHide() {
    var cursorTimer = null;
    function hideCursor() {
      document.body.className += " hide-cursor";
    }
    function showCursor() {
      document.body.className = document.body.className.replace(
        /\bhide-cursor\b/g,
        "",
      );
      if (cursorTimer) clearTimeout(cursorTimer);
      cursorTimer = setTimeout(hideCursor, 3000);
    }
    document.addEventListener("mousemove", showCursor, false);
    cursorTimer = setTimeout(hideCursor, 3000);
  }

  // ========================================================================
  // Atalhos de Teclado
  // ========================================================================
  function setupKeyboardShortcuts() {
    document.addEventListener(
      "keydown",
      function (e) {
        var key = e.key || e.keyCode;

        if (key === "ArrowRight" || key === 39) {
          e.preventDefault();
          next();
          return;
        }

        if (key === "ArrowLeft" || key === 37) {
          e.preventDefault();
          previous();
          return;
        }

        if ((key === "d" || key === "D" || key === 68) && e.altKey) {
          e.preventDefault();
          if (dom.debug) {
            var isVisible = dom.debug.style.display !== "none";
            dom.debug.style.display = isVisible ? "none" : "block";
            if (!isVisible) updateDebugInfo();
            console.log(LOG_PREFIX + " Debug: " + (isVisible ? "OFF" : "ON"));
          }
          return;
        }

        if ((key === "u" || key === "U" || key === 85) && e.altKey) {
          e.preventDefault();
          console.log(LOG_PREFIX + " 🔄 Atualização forçada");
          refreshAds();
          return;
        }

        if ((key === "r" || key === "R" || key === 82) && e.ctrlKey) {
          e.preventDefault();
          console.log(LOG_PREFIX + " Recarregando...");
          location.reload();
          return;
        }

        if ((key === "i" || key === "I" || key === 73) && e.altKey) {
          e.preventDefault();
          printDiagnostics();
          return;
        }
      },
      false,
    );

    console.log(
      LOG_PREFIX +
        " ⌨️ Atalhos: ←→ Navegar | Alt+D Debug | Alt+U Atualizar | Alt+I Info | Ctrl+R Reload",
    );
  }

  // ========================================================================
  // Diagnóstico
  // ========================================================================
  function printDiagnostics() {
    var separator = "══════════════════════════════════════════════════";
    console.log(separator);
    console.log("DIAGNÓSTICO DO SISTEMA");
    console.log(separator);
    console.log("Painel: " + state.panel);
    console.log("API Host: " + CONFIG.apiHost);
    console.log("Fila: " + state.queue.getSize() + " propagandas");

    if (typeof TVCompat !== "undefined") {
      var features = TVCompat.getFeatures();
      console.log("TV: " + features.name + " (" + features.platform + ")");
      console.log("ES6: " + features.es6 + " | Flexbox: " + features.flexbox);
      console.log("H264: " + features.h264 + " | VP9: " + features.vp9);
      console.log(
        "WakeLock: " +
          features.wakeLock +
          " | Fullscreen: " +
          features.fullscreen,
      );
    }

    if (typeof SleepPrevention !== "undefined") {
      var diag = SleepPrevention.getDiagnostics();
      console.log(
        "Sleep Prevention: " + diag.method + " (ativo: " + diag.enabled + ")",
      );
    }

    console.log(separator);
  }

  // ========================================================================
  // Inicialização (sem Promise — usa callbacks puros)
  // ========================================================================
  function init() {
    var separator =
      "════════════════════════════════════════════════════════════";
    console.log(separator);
    console.log("  Sistema de Apresentação de Propagandas v2.0");
    console.log(separator);

    // 1. Inicializa TVCompat (polyfills, detecção)
    if (typeof TVCompat !== "undefined") {
      TVCompat.init();
    } else {
      console.warn(LOG_PREFIX + " TVCompat não carregado");
    }

    // 2. Captura referências DOM
    dom.container = document.getElementById("media-container");
    dom.loading = document.getElementById("loading-indicator");
    dom.noAds = document.getElementById("no-ads-message");
    dom.debug = document.getElementById("debug-info");

    if (!dom.container) {
      console.error(LOG_PREFIX + " ❌ #media-container não encontrado!");
      return;
    }

    // 3. Detecta painel
    state.panel = detectPanel();

    // 3.5. Entra em tela cheia automaticamente
    setupFullscreen();

    // 4. Cria fila
    state.queue = AdsQueue.create();

    // 5. Ativa prevenção de hibernação
    if (typeof SleepPrevention !== "undefined") {
      SleepPrevention.enable();
    } else {
      console.warn(LOG_PREFIX + " SleepPrevention não carregado");
    }

    // 5.1. Ativa keep-awake (vídeo-âncora + Wake Lock) — corrige o standby
    //      durante as imagens em TVs modernas. Camada dupla.
    if (typeof KeepAwake !== "undefined") {
      KeepAwake.init();
    } else {
      console.warn(LOG_PREFIX + " KeepAwake não carregado");
    }

    // 6. Atalhos de teclado
    setupKeyboardShortcuts();

    // 7. Descobre IP do servidor e configura apiHost (via callback)
    showLoading(true);
    discoverServerHost(function (apiHost) {
      CONFIG.apiHost = apiHost;

      console.log(LOG_PREFIX + " Painel: " + state.panel);
      console.log(LOG_PREFIX + " API: " + CONFIG.apiHost);
      console.log(
        LOG_PREFIX + " Refresh: " + CONFIG.refreshInterval / 1000 + "s",
      );

      // 8. Carrega propagandas (via callback)
      loadActiveAds(function () {
        // 9. Inicia auto-refresh
        startAutoRefresh();

        state.isInitialized = true;
        console.log(LOG_PREFIX + " ✓ Sistema iniciado com sucesso");
      });
    });
  }

  // ========================================================================
  // Bootstrap
  // ========================================================================

  // Prevenir menu de contexto
  document.addEventListener(
    "contextmenu",
    function (e) {
      e.preventDefault();
    },
    false,
  );

  // Inicia quando o DOM estiver pronto
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, false);
  } else {
    init();
  }

  // Expõe API pública para debug externo
  window.AdsPresenterAPI = {
    next: next,
    previous: previous,
    refresh: refreshAds,
    diagnostics: printDiagnostics,
    getConfig: function () {
      return CONFIG;
    },
    getState: function () {
      return {
        panel: state.panel,
        queueSize: state.queue ? state.queue.getSize() : 0,
        initialized: state.isInitialized,
        isUpdating: state.isUpdating,
      };
    },
  };
})();
