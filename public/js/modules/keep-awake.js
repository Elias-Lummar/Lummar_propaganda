/**
 * ============================================================================
 * Módulo Keep-Awake (Vídeo-âncora) — Solução de hibernação "camada dupla"
 * ============================================================================
 * Resolve o problema de TVs modernas (Tizen/WebOS com JS atualizado) que
 * entram em standby DURANTE AS IMAGENS, mas ficam acordadas durante vídeos.
 *
 * Causa-raiz: nessas TVs o NoSleep.js usa a Wake Lock API, que falha em
 * contexto inseguro (HTTP). A única coisa que mantém o painel acordado é a
 * REPRODUÇÃO REAL DE VÍDEO (o firmware detecta "mídia tocando"). Quando entra
 * uma imagem, nada toca → standby.
 *
 * Estratégia (camada dupla):
 *   1. Vídeo-âncora  → um <video> real, mudo, em loop, em tela cheia atrás do
 *                      conteúdo. Toca DURANTE AS IMAGENS, fazendo a TV enxergar
 *                      mídia ativa exatamente como num anúncio de vídeo.
 *                      Funciona em HTTP puro — não depende de certificado.
 *   2. Wake Lock API → solicitada como bônus quando há contexto seguro (HTTPS
 *                      com certificado confiável). Falha silenciosa em HTTP.
 *
 * Durante VÍDEOS o âncora é pausado (o próprio anúncio segura a tela e evita
 * decodificação dupla); durante IMAGENS o âncora é reativado.
 *
 * Escrito em ES5 para compatibilidade universal.
 */

// eslint-disable-next-line no-unused-vars
var KeepAwake = (function () {
  "use strict";

  var LOG_PREFIX = "[KeepAwake]";
  var ANCHOR_SRC = "assets/keepawake.mp4";
  var HEAL_INTERVAL = 15000; // re-checa o âncora a cada 15s

  var anchorEl = null;
  var wakeLockSentinel = null;
  var healIntervalId = null;
  var enabled = false;
  var engaged = false; // true = deve estar tocando (imagem na tela)
  var hasWakeLock = false;

  // ========================================================================
  // Vídeo-âncora
  // ========================================================================
  function createAnchor() {
    if (anchorEl) return anchorEl;

    anchorEl = document.createElement("video");
    anchorEl.id = "keep-awake-anchor";

    // Mudo é obrigatório para autoplay sem gesto do usuário
    anchorEl.muted = true;
    anchorEl.defaultMuted = true;
    anchorEl.volume = 0;
    anchorEl.loop = true;
    anchorEl.autoplay = true;

    // Atributos (alguns firmwares só respeitam o atributo, não a propriedade)
    anchorEl.setAttribute("muted", "");
    anchorEl.setAttribute("loop", "");
    anchorEl.setAttribute("autoplay", "");
    anchorEl.setAttribute("playsinline", "");
    anchorEl.setAttribute("webkit-playsinline", "");
    anchorEl.setAttribute("x-webkit-airplay", "deny");
    anchorEl.setAttribute("disableRemotePlayback", "");
    anchorEl.setAttribute("aria-hidden", "true");

    // Tela cheia, ATRÁS do conteúdo (z-index baixo) e fundo preto.
    // Importante: NÃO usar display:none / 1px / opacity:0 — muitos firmwares
    // tratam vídeo "invisível" como mídia inativa e ignoram para o standby.
    // Como é preto e fica atrás, é visualmente imperceptível.
    anchorEl.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;" +
      "object-fit:cover;background:#000;z-index:0;" +
      "pointer-events:none;border:0;margin:0;";

    anchorEl.src = ANCHOR_SRC;

    // Auto-cura: se a TV pausar/terminar sozinha, reinicia
    anchorEl.addEventListener("pause", onUnexpectedPause, false);
    anchorEl.addEventListener("ended", rekick, false);

    document.body.appendChild(anchorEl);
    return anchorEl;
  }

  function play() {
    if (!anchorEl) return;
    try {
      anchorEl.currentTime = anchorEl.currentTime || 0;
      var p = anchorEl.play();
      if (p && typeof p.catch === "function") {
        p.catch(function (e) {
          console.warn(LOG_PREFIX + " play() do âncora bloqueado: " + e.message);
        });
      }
    } catch (e) {
      // silencioso
    }
  }

  function onUnexpectedPause() {
    // Se deveria estar tocando (imagem na tela) e a TV pausou, reinicia
    if (enabled && engaged && anchorEl && anchorEl.paused) {
      console.log(LOG_PREFIX + " ↻ âncora pausado inesperadamente — reativando");
      play();
    }
  }

  function rekick() {
    if (enabled && engaged && anchorEl) {
      try {
        anchorEl.currentTime = 0;
      } catch (e) {
        // silencioso
      }
      play();
    }
  }

  // ========================================================================
  // Wake Lock API (bônus — só funciona em contexto seguro / HTTPS confiável)
  // ========================================================================
  function acquireWakeLock() {
    if (!("wakeLock" in navigator) || typeof Promise === "undefined") {
      return;
    }
    if (wakeLockSentinel) return;

    try {
      navigator.wakeLock
        .request("screen")
        .then(function (sentinel) {
          wakeLockSentinel = sentinel;
          hasWakeLock = true;
          console.log(LOG_PREFIX + " 🔒 Wake Lock nativa ativa (contexto seguro)");
          sentinel.addEventListener("release", function () {
            wakeLockSentinel = null;
            if (enabled) {
              // tenta readquirir ao voltar o foco
              setTimeout(acquireWakeLock, 1000);
            }
          });
        })
        .catch(function (err) {
          // Esperado em HTTP: contexto inseguro. O vídeo-âncora cobre o caso.
          hasWakeLock = false;
          console.log(
            LOG_PREFIX +
              " Wake Lock indisponível (" +
              err.message +
              ") — usando vídeo-âncora",
          );
        });
    } catch (e) {
      hasWakeLock = false;
    }
  }

  // ========================================================================
  // Reativação ao voltar o foco / visibilidade
  // ========================================================================
  function setupVisibilityListener() {
    function onVisible() {
      var hidden = document.hidden || document.msHidden || document.webkitHidden;
      if (!hidden && enabled) {
        if (engaged) play();
        acquireWakeLock();
      }
    }

    var evt = "visibilitychange";
    if (typeof document.msHidden !== "undefined") evt = "msvisibilitychange";
    else if (typeof document.webkitHidden !== "undefined")
      evt = "webkitvisibilitychange";

    document.addEventListener(evt, onVisible, false);
    window.addEventListener("focus", onVisible, false);
  }

  function startHealLoop() {
    if (healIntervalId) clearInterval(healIntervalId);
    healIntervalId = setInterval(function () {
      if (enabled && engaged && anchorEl && anchorEl.paused) {
        play();
      }
    }, HEAL_INTERVAL);
  }

  // ========================================================================
  // API Pública
  // ========================================================================
  return {
    /** Inicializa: cria o âncora, adquire wake lock e começa engajado. */
    init: function () {
      if (enabled) return;
      enabled = true;

      createAnchor();
      this.engage();
      acquireWakeLock();
      setupVisibilityListener();
      startHealLoop();

      console.log(LOG_PREFIX + " ✓ Keep-awake iniciado (vídeo-âncora + wake lock)");
    },

    /** Imagem na tela → garante o âncora tocando para segurar o painel. */
    engage: function () {
      engaged = true;
      if (!anchorEl) createAnchor();
      play();
    },

    /** Vídeo na tela → o próprio anúncio segura a tela; pausa o âncora. */
    relax: function () {
      engaged = false;
      if (anchorEl && !anchorEl.paused) {
        try {
          anchorEl.pause();
        } catch (e) {
          // silencioso
        }
      }
    },

    /** Desliga tudo e libera recursos. */
    disable: function () {
      enabled = false;
      engaged = false;

      if (healIntervalId) {
        clearInterval(healIntervalId);
        healIntervalId = null;
      }
      if (wakeLockSentinel) {
        try {
          wakeLockSentinel.release();
        } catch (e) {
          // silencioso
        }
        wakeLockSentinel = null;
      }
      if (anchorEl) {
        try {
          anchorEl.pause();
          anchorEl.removeAttribute("src");
          anchorEl.load();
          if (anchorEl.parentNode) anchorEl.parentNode.removeChild(anchorEl);
        } catch (e) {
          // silencioso
        }
        anchorEl = null;
      }
    },

    /** Diagnóstico para o painel de debug. */
    getStatus: function () {
      return {
        enabled: enabled,
        engaged: engaged,
        anchorPlaying: !!(anchorEl && !anchorEl.paused),
        hasWakeLockAPI: "wakeLock" in navigator,
        wakeLockActive: !!wakeLockSentinel,
        secureContext:
          typeof window.isSecureContext !== "undefined"
            ? window.isSecureContext
            : "?",
      };
    },
  };
})();
