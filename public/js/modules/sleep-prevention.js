/**
 * ============================================================================
 * Módulo de Prevenção de Hibernação/Sleep
 * ============================================================================
 * Usa NoSleep.js como engine principal com múltiplos fallbacks
 * para garantir que a tela nunca hiberne em qualquer dispositivo.
 *
 * ★ Otimizado para TVs antigas (WebOS, Tizen, Roku, HbbTV, NetCast, etc.)
 *   - Integra com TVCompat para detectar plataforma
 *   - Intervalos agressivos em TVs sem WakeLock
 *   - Múltiplas camadas simultâneas em TVs legadas
 *
 * Camadas de proteção (em ordem de prioridade):
 *   1. NoSleep.js (vídeo invisível + WakeLock API)
 *   2. Wake Lock API nativa
 *   3. Fallback com vídeo invisível manual
 *   4. Fallback com AudioContext keepalive (TVs antigas)
 *   5. Fallback com mouse/keyboard events simulados
 *   6. Fallback com scroll e repaint periódico (TVs legadas)
 *
 * Em TVs detectadas como antigas, múltiplas camadas são ativadas
 * simultaneamente para máxima proteção.
 */

// eslint-disable-next-line no-unused-vars
var SleepPrevention = (function () {
  "use strict";

  var noSleepInstance = null;
  var wakeLockSentinel = null;
  var fallbackIntervalId = null;
  var videoFallbackEl = null;
  var audioCtx = null;
  var audioIntervalId = null;
  var scrollRepaintIntervalId = null;
  var videoRekickIntervalId = null;
  var isEnabled = false;
  var activeMethod = "none";
  var activeMethods = []; // TVs antigas usam múltiplos métodos simultâneos
  var isOldTV = false;
  var tvPlatform = "unknown";
  var LOG_PREFIX = "[SleepPrevention]";

  // Intervalo de eventos: 15s para browsers modernos, 8s para TVs antigas
  var EVENT_INTERVAL = 15000;
  var EVENT_INTERVAL_OLD_TV = 8000;
  // Intervalo para re-kick do vídeo em TVs que pausam sozinhas
  var VIDEO_REKICK_INTERVAL = 30000;

  // ========================================================================
  // Detecção de TV (integração com TVCompat se disponível)
  // ========================================================================
  function detectTVPlatform() {
    // Se TVCompat está carregado, usa ele
    if (typeof TVCompat !== "undefined" && TVCompat.getPlatformKey) {
      tvPlatform = TVCompat.getPlatformKey();
      var profile = TVCompat.getProfile ? TVCompat.getProfile() : null;
      isOldTV =
        tvPlatform === "LEGACY" ||
        tvPlatform === "TIZEN" ||
        tvPlatform === "WEBOS" ||
        tvPlatform === "FIRE_TV" ||
        tvPlatform === "ROKU";
      if (profile && profile.supportsWakeLock === false) {
        isOldTV = true;
      }
      console.log(
        LOG_PREFIX +
          " TVCompat detectou: " +
          tvPlatform +
          " (TV antiga: " +
          isOldTV +
          ")",
      );
      return;
    }

    // Fallback: detecção própria via User Agent
    var ua = (navigator.userAgent || "").toLowerCase();
    if (
      ua.indexOf("tizen") !== -1 ||
      ua.indexOf("webos") !== -1 ||
      ua.indexOf("web0s") !== -1 ||
      ua.indexOf("netcast") !== -1 ||
      ua.indexOf("smart-tv") !== -1 ||
      ua.indexOf("smarttv") !== -1 ||
      ua.indexOf("hbbtv") !== -1 ||
      ua.indexOf("nettv") !== -1 ||
      ua.indexOf("opera tv") !== -1 ||
      ua.indexOf("philipstv") !== -1 ||
      ua.indexOf("espial") !== -1 ||
      ua.indexOf("roku") !== -1 ||
      ua.indexOf("aftb") !== -1 ||
      ua.indexOf("aftt") !== -1 ||
      ua.indexOf("silk") !== -1 ||
      ua.indexOf("viera") !== -1 ||
      ua.indexOf("bravia") !== -1 ||
      ua.indexOf("sraf") !== -1 ||
      ua.indexOf("maplejsp") !== -1
    ) {
      isOldTV = true;
      tvPlatform = "tv-detected-ua";
    }

    // Detecção por features ausentes (TV muito antiga)
    if (!isOldTV) {
      try {
        new Function("let a = 1;");
      } catch (e) {
        isOldTV = true;
        tvPlatform = "legacy-no-es6";
      }
    }

    console.log(
      LOG_PREFIX +
        " Plataforma: " +
        tvPlatform +
        " (TV antiga: " +
        isOldTV +
        ")",
    );
  }

  /**
   * Retorna o intervalo ideal para a plataforma.
   * TVs antigas usam intervalos menores para evitar timeout de inatividade.
   */
  function getEventInterval() {
    return isOldTV ? EVENT_INTERVAL_OLD_TV : EVENT_INTERVAL;
  }

  // ========================================================================
  // Método 1: NoSleep.js
  // ========================================================================
  function tryNoSleepMethod() {
    if (typeof NoSleep === "undefined") {
      console.warn(LOG_PREFIX + " NoSleep.js não carregado");
      return false;
    }

    try {
      noSleepInstance = new NoSleep();
      noSleepInstance.enable();
      activeMethod = "nosleep.js";
      console.log(LOG_PREFIX + " ✓ Método ativo: NoSleep.js");
      return true;
    } catch (e) {
      console.warn(LOG_PREFIX + " NoSleep.js falhou:", e.message);
      return false;
    }
  }

  // ========================================================================
  // Método 3: Wake Lock API nativa
  // ========================================================================
  function tryWakeLockAPI() {
    if (!("wakeLock" in navigator)) {
      return false;
    }

    // Precisa de Promise para funcionar
    if (typeof Promise === "undefined") {
      console.warn(
        LOG_PREFIX + " Wake Lock API requer Promise (não disponível)",
      );
      return false;
    }

    try {
      navigator.wakeLock
        .request("screen")
        .then(function (sentinel) {
          wakeLockSentinel = sentinel;
          activeMethod = "wakelock-api";
          console.log(LOG_PREFIX + " ✓ Método ativo: Wake Lock API");

          sentinel.addEventListener("release", function () {
            console.log(
              LOG_PREFIX + " WakeLock liberado - tentando reativar...",
            );
            wakeLockSentinel = null;
            if (isEnabled) {
              setTimeout(function () {
                tryWakeLockAPI();
              }, 1000);
            }
          });
        })
        .catch(function (err) {
          console.warn(LOG_PREFIX + " Wake Lock API falhou:", err.message);
        });
    } catch (e) {
      console.warn(LOG_PREFIX + " Wake Lock API erro:", e.message);
      return false;
    }

    return true;
  }

  // ========================================================================
  // Método 4: Vídeo invisível (fallback universal)
  // ========================================================================
  function tryVideoFallback() {
    try {
      // Cria um vídeo pequeno em loop que engana o sistema
      // para achar que há mídia ativa (impede standby)
      videoFallbackEl = document.createElement("video");
      videoFallbackEl.setAttribute("playsinline", "");
      videoFallbackEl.setAttribute("webkit-playsinline", "");
      videoFallbackEl.muted = true;
      videoFallbackEl.loop = true;
      videoFallbackEl.volume = 0;

      // Atributos extras para TVs antigas
      videoFallbackEl.setAttribute("x-webkit-airplay", "deny");
      videoFallbackEl.setAttribute("disableRemotePlayback", "");

      // TVs antigas (Tizen, WebOS) precisam de preload agressivo
      if (isOldTV) {
        videoFallbackEl.preload = "auto";
        videoFallbackEl.setAttribute("autoplay", "");
      } else {
        videoFallbackEl.preload = "metadata";
      }

      // Estilo invisível (não removemos do DOM)
      // Nota: em algumas TVs LG WebOS, display:none impede o play,
      //       por isso usamos posição fora da tela + opacidade mínima
      videoFallbackEl.style.cssText =
        "position:fixed;top:-9999px;left:-9999px;" +
        "width:1px;height:1px;opacity:0.01;" +
        "pointer-events:none;z-index:-1;";

      // Vídeo mínimo em base64 (1x1px, 1 frame, H.264 Baseline)
      // H.264 Baseline Level 1.0 = codec universal para TVs antigas
      videoFallbackEl.src =
        "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAhtZGF0AAAA" +
        "MW1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAA" +
        "AAAAAAAAAAAAAAAAAAAAAAAAABAAAAGGAAAAEAABAAAAATAAAAFkbWRpYQAAACRtZGhkAAAAAMO+n5zDvp+c" +
        "AAAADAAAAAAAACIAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

      document.body.appendChild(videoFallbackEl);

      try {
        var playPromise = videoFallbackEl.play();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise
            .then(function () {
              addActiveMethod("video-fallback");
              console.log(
                LOG_PREFIX + " ✓ Método ativo: Vídeo invisible (fallback)",
              );
            })
            .catch(function () {
              console.warn(
                LOG_PREFIX + " Vídeo fallback bloqueado (autoplay policy)",
              );
              // Em TVs antigas, não desistimos - tentamos próximo método
              if (!isOldTV) {
                tryMouseFallback();
              }
            });
        } else {
          addActiveMethod("video-fallback");
          console.log(
            LOG_PREFIX + " ✓ Método ativo: Vídeo invisible (fallback)",
          );
        }
      } catch (playErr) {
        addActiveMethod("video-fallback");
        console.log(
          LOG_PREFIX +
            " ✓ Método ativo: Vídeo invisible (fallback - play sync)",
        );
      }

      // Em TVs antigas, re-kicka o vídeo periodicamente
      // pois algumas TVs pausam o vídeo após um tempo sem interação
      if (isOldTV) {
        setupVideoRekick();
      }

      return true;
    } catch (e) {
      console.warn(LOG_PREFIX + " Vídeo fallback falhou:", e.message);
      return false;
    }
  }

  /**
   * Re-inicia o vídeo periodicamente em TVs antigas.
   * Algumas TVs (Tizen 2.x, WebOS 1.x) pausam vídeos hidden após ~60s.
   */
  function setupVideoRekick() {
    videoRekickIntervalId = setInterval(function () {
      if (videoFallbackEl && isEnabled) {
        try {
          if (videoFallbackEl.paused || videoFallbackEl.ended) {
            videoFallbackEl.currentTime = 0;
            videoFallbackEl.play();
            console.log(
              LOG_PREFIX + " ↻ Vídeo fallback re-iniciado (TV antiga)",
            );
          }
        } catch (e) {
          // silencioso
        }
      }
    }, VIDEO_REKICK_INTERVAL);
  }

  // ========================================================================
  // Método 5: Mouse events (último recurso)
  // ========================================================================
  function tryMouseFallback() {
    var interval = getEventInterval();

    fallbackIntervalId = setInterval(function () {
      if (
        document.visibilityState === "visible" ||
        typeof document.visibilityState === "undefined"
      ) {
        try {
          // Simula movimentos de mouse para manter atividade
          var event = document.createEvent("MouseEvents");
          event.initMouseEvent(
            "mousemove",
            true,
            true,
            window,
            0,
            0,
            0,
            Math.random() * 10,
            Math.random() * 10,
            false,
            false,
            false,
            false,
            0,
            null,
          );
          document.dispatchEvent(event);

          // Também dispara um keypress fantasma
          var kEvent = document.createEvent("KeyboardEvent");
          if (typeof kEvent.initKeyboardEvent === "function") {
            kEvent.initKeyboardEvent(
              "keydown",
              true,
              true,
              window,
              "",
              0,
              "",
              false,
              "",
            );
          }

          // Scroll simulado (importante para TVs antigas que
          // detectam inatividade pela ausência de scroll)
          try {
            window.scrollBy(0, 1);
            window.scrollBy(0, -1);
          } catch (scrollErr) {
            // silencioso
          }

          // Focus trick para TVs legadas (Tizen, WebOS antigo)
          if (isOldTV) {
            try {
              var activeEl = document.activeElement;
              if (activeEl && typeof activeEl.blur === "function") {
                activeEl.blur();
                activeEl.focus();
              }
            } catch (focusErr) {
              // silencioso
            }
          }
        } catch (e) {
          // Silencioso
        }
      }
    }, interval);

    addActiveMethod("mouse-fallback");
    console.log(
      LOG_PREFIX +
        " ✓ Método ativo: Simulação de eventos (intervalo: " +
        interval +
        "ms)",
    );
  }

  // ========================================================================
  // Método 5b: AudioContext keepalive (TVs sem WakeLock)
  // ========================================================================
  /**
   * Cria um AudioContext com oscilador silencioso.
   * Muitas TVs antigas (WebOS 2.x, Tizen 2.x) consideram áudio ativo
   * como sinal de que o app está em uso e não entram em standby.
   */
  function tryAudioContextKeepAlive() {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      console.warn(LOG_PREFIX + " AudioContext não suportado");
      return false;
    }

    try {
      audioCtx = new AudioCtx();

      // Cria oscilador inaudível (frequência ultrasônica, volume mínimo)
      var oscillator = audioCtx.createOscillator();
      var gainNode = audioCtx.createGain();

      oscillator.frequency.value = 1; // 1Hz - inaudível
      oscillator.type = "sine";
      gainNode.gain.value = 0.001; // Volume praticamente zero

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start(0);

      // Algumas TVs suspendem o AudioContext após um tempo.
      // Re-ativa periodicamente.
      audioIntervalId = setInterval(function () {
        if (audioCtx && audioCtx.state === "suspended" && isEnabled) {
          try {
            if (typeof audioCtx.resume === "function") {
              audioCtx.resume();
            }
          } catch (e) {
            // silencioso
          }
        }
      }, 10000);

      addActiveMethod("audio-context");
      console.log(LOG_PREFIX + " ✓ Método ativo: AudioContext keepalive");
      return true;
    } catch (e) {
      console.warn(LOG_PREFIX + " AudioContext falhou:", e.message);
      return false;
    }
  }

  // ========================================================================
  // Método 7: Scroll + Repaint periódico (TVs legadas)
  // ========================================================================
  /**
   * Força repaint do DOM periodicamente.
   * TVs com browsers antigos (Opera TV Store, NetCast, HbbTV)
   * podem entrar em modo de economia quando não detectam mudanças no DOM.
   */
  function tryScrollRepaintFallback() {
    var repaintEl = document.createElement("div");
    repaintEl.id = "sleep-prevention-repaint";
    repaintEl.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;" +
      "width:1px;height:1px;opacity:0;" +
      "pointer-events:none;z-index:-1;";
    repaintEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(repaintEl);

    var counter = 0;
    scrollRepaintIntervalId = setInterval(function () {
      if (!isEnabled) return;

      try {
        // Muda conteúdo do DOM para forçar repaint
        counter = (counter + 1) % 1000;
        repaintEl.textContent = "" + counter;

        // Força reflow lendo offsetHeight
        void repaintEl.offsetHeight;

        // Toca no título para simular atividade
        // (algumas TVs monitoram mudanças no title)
        var originalTitle = document.title;
        document.title = originalTitle + " ";
        document.title = originalTitle;

        // requestAnimationFrame para manter o render loop ativo
        var raf =
          window.requestAnimationFrame ||
          window.webkitRequestAnimationFrame ||
          window.mozRequestAnimationFrame;
        if (raf) {
          raf(function () {
            /* noop - mantém render loop */
          });
        }
      } catch (e) {
        // silencioso
      }
    }, getEventInterval());

    addActiveMethod("scroll-repaint");
    console.log(
      LOG_PREFIX + " ✓ Método ativo: Scroll + Repaint periódico (TV legada)",
    );
  }

  // ========================================================================
  // Helper: registra método ativo
  // ========================================================================
  function addActiveMethod(method) {
    activeMethod = method;
    if (activeMethods.indexOf(method) === -1) {
      activeMethods.push(method);
    }
  }

  // ========================================================================
  // Listener de visibilidade (re-ativa ao voltar ao foco)
  // ========================================================================
  function setupVisibilityListener() {
    var visibilityEvent = "visibilitychange";

    // Fallback para browsers antigos
    if (typeof document.msHidden !== "undefined") {
      visibilityEvent = "msvisibilitychange";
    } else if (typeof document.webkitHidden !== "undefined") {
      visibilityEvent = "webkitvisibilitychange";
    }

    document.addEventListener(
      visibilityEvent,
      function () {
        var hidden =
          document.hidden || document.msHidden || document.webkitHidden;

        if (!hidden && isEnabled) {
          console.log(
            LOG_PREFIX + " Tela visível novamente - reativando proteção...",
          );
          reactivate();
        }
      },
      false,
    );

    // Fallback: focus/blur para TVs sem visibilitychange
    window.addEventListener(
      "focus",
      function () {
        if (isEnabled) {
          console.log(LOG_PREFIX + " Janela focada - verificando proteção...");
          reactivate();
        }
      },
      false,
    );
  }

  // ========================================================================
  // Reativação após perda de foco
  // ========================================================================
  function reactivate() {
    // NoSleep.js
    if (noSleepInstance) {
      try {
        noSleepInstance.enable();
      } catch (e) {
        // silencioso
      }
    }

    // Wake Lock API
    if ("wakeLock" in navigator && !wakeLockSentinel) {
      tryWakeLockAPI();
    }

    // Vídeo fallback
    if (videoFallbackEl && videoFallbackEl.paused) {
      try {
        videoFallbackEl.currentTime = 0;
        videoFallbackEl.play();
      } catch (e) {
        // silencioso
      }
    }

    // AudioContext (TVs antigas)
    if (audioCtx && audioCtx.state === "suspended") {
      try {
        if (typeof audioCtx.resume === "function") {
          audioCtx.resume();
        }
      } catch (e) {
        // silencioso
      }
    }
  }

  // ========================================================================
  // API Pública
  // ========================================================================
  return {
    /**
     * Ativa a prevenção de hibernação.
     * Tenta os métodos em cascata até um funcionar.
     */
    enable: function () {
      if (isEnabled) {
        console.log(LOG_PREFIX + " Já está ativo (" + activeMethod + ")");
        return;
      }

      isEnabled = true;
      activeMethods = [];

      // Detecta plataforma para ajustar estratégia
      detectTVPlatform();

      console.log(LOG_PREFIX + " Iniciando prevenção de hibernação...");
      if (isOldTV) {
        console.log(
          LOG_PREFIX +
            " ★ Modo TV antiga ativado - múltiplas camadas simultâneas",
        );
      }

      // === TV ANTIGA: ativa MÚLTIPLAS camadas simultaneamente ===
      if (isOldTV) {
        console.log(
          LOG_PREFIX + " Ativando camadas múltiplas para TV antiga...",
        );

        // Camada 1: NoSleep.js (se disponível)
        tryNoSleepMethod();

        // Camada 2: Vídeo invisible
        tryVideoFallback();

        // Camada 3: AudioContext keepalive
        tryAudioContextKeepAlive();

        // Camada 4: Mouse/keyboard/scroll events
        tryMouseFallback();

        // Camada 5: DOM repaint periódico
        tryScrollRepaintFallback();

        // Camada 6: Wake Lock API (se suportado)
        tryWakeLockAPI();

        console.log(
          LOG_PREFIX + " ★ Camadas ativas: [" + activeMethods.join(", ") + "]",
        );

        setupVisibilityListener();
        return;
      }

      // === BROWSER MODERNO: cascata normal (para quando um funcionar) ===
      if (tryNoSleepMethod()) {
        setupVisibilityListener();
        return;
      }

      if (tryWakeLockAPI()) {
        setupVisibilityListener();
        return;
      }

      if (tryVideoFallback()) {
        setupVisibilityListener();
        return;
      }

      // Último recurso
      tryMouseFallback();
      setupVisibilityListener();
    },

    /**
     * Desativa a prevenção de hibernação.
     */
    disable: function () {
      isEnabled = false;

      // NoSleep.js
      if (noSleepInstance) {
        try {
          noSleepInstance.disable();
        } catch (e) {
          /* */
        }
      }

      // Wake Lock API
      if (wakeLockSentinel) {
        try {
          wakeLockSentinel.release();
        } catch (e) {
          /* */
        }
        wakeLockSentinel = null;
      }

      // Vídeo fallback
      if (videoFallbackEl) {
        try {
          videoFallbackEl.pause();
          videoFallbackEl.remove();
        } catch (e) {
          /* */
        }
        videoFallbackEl = null;
      }

      // Video rekick interval
      if (videoRekickIntervalId) {
        clearInterval(videoRekickIntervalId);
        videoRekickIntervalId = null;
      }

      // AudioContext keepalive
      if (audioCtx) {
        try {
          audioCtx.close();
        } catch (e) {
          /* */
        }
        audioCtx = null;
      }
      if (audioIntervalId) {
        clearInterval(audioIntervalId);
        audioIntervalId = null;
      }

      // Scroll/repaint fallback
      if (scrollRepaintIntervalId) {
        clearInterval(scrollRepaintIntervalId);
        scrollRepaintIntervalId = null;
      }

      // Remove repaint element
      try {
        var repaintEl = document.getElementById("sleep-prevention-repaint");
        if (repaintEl) {
          repaintEl.remove();
        }
      } catch (e) {
        /* */
      }

      // Mouse fallback
      if (fallbackIntervalId) {
        clearInterval(fallbackIntervalId);
        fallbackIntervalId = null;
      }

      activeMethod = "none";
      activeMethods = [];
      console.log(LOG_PREFIX + " Prevenção de hibernação desativada");
    },

    /** Retorna se está ativo */
    isEnabled: function () {
      return isEnabled;
    },

    /** Retorna o método ativo */
    getActiveMethod: function () {
      return activeMethod;
    },

    /** Retorna se é uma TV antiga */
    isOldTV: function () {
      return isOldTV;
    },

    /** Retorna a plataforma detectada */
    getTVPlatform: function () {
      return tvPlatform;
    },

    /** Retorna todos os métodos ativos (TVs antigas podem ter múltiplos) */
    getActiveMethods: function () {
      return activeMethods.slice();
    },

    /** Retorna diagnóstico completo */
    getDiagnostics: function () {
      return {
        enabled: isEnabled,
        method: activeMethod,
        allMethods: activeMethods.slice(),
        isOldTV: isOldTV,
        tvPlatform: tvPlatform,
        eventInterval: getEventInterval(),
        hasNoSleep: typeof NoSleep !== "undefined",
        hasWakeLockAPI: "wakeLock" in navigator,
        hasAudioContext: !!(window.AudioContext || window.webkitAudioContext),
        wakeLockActive: !!wakeLockSentinel,
        noSleepActive: !!(noSleepInstance && noSleepInstance._wakeLock),
        videoFallbackPlaying: !!(videoFallbackEl && !videoFallbackEl.paused),
        audioContextActive: !!(audioCtx && audioCtx.state === "running"),
        mouseFallbackActive: !!fallbackIntervalId,
        scrollRepaintActive: !!scrollRepaintIntervalId,
        videoRekickActive: !!videoRekickIntervalId,
      };
    },
  };
})();
