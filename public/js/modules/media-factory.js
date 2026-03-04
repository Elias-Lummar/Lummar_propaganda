/**
 * ============================================================================
 * Módulo de Criação de Mídia
 * ============================================================================
 * Factory para criação de elementos de vídeo e imagem
 * com configuração automática baseada no perfil da TV.
 * Escrito em ES5 para compatibilidade máxima.
 *
 * Depende de: TVCompat (global)
 */

// eslint-disable-next-line no-unused-vars
var MediaFactory = (function () {
  "use strict";

  var LOG_PREFIX = "[MediaFactory]";

  // Extensões conhecidas de vídeo
  var VIDEO_EXTENSIONS = [
    "mp4",
    "webm",
    "avi",
    "mov",
    "mkv",
    "ogv",
    "ogg",
    "flv",
    "wmv",
    "m4v",
  ];

  /**
   * Detecta se um arquivo é vídeo baseado na extensão
   */
  function isVideoFile(filePath) {
    if (!filePath) return false;
    var ext = filePath.split(".").pop().toLowerCase().split("?")[0];
    for (var i = 0; i < VIDEO_EXTENSIONS.length; i++) {
      if (ext === VIDEO_EXTENSIONS[i]) return true;
    }
    return false;
  }

  /**
   * Constrói a URL completa da mídia
   */
  function buildMediaUrl(filePath, apiHost) {
    if (!filePath) return "";

    // Já é URL completa
    if (
      filePath.indexOf("http://") === 0 ||
      filePath.indexOf("https://") === 0
    ) {
      return filePath;
    }

    // Normaliza o caminho
    var normalized = filePath.charAt(0) === "/" ? filePath : "/" + filePath;
    return apiHost + normalized;
  }

  /**
   * Cria elemento de vídeo compatível
   */
  function createVideo(ad, apiHost, callbacks) {
    var video = document.createElement("video");
    var url = buildMediaUrl(ad.file_path, apiHost);

    // Atributos base
    video.className = "media-item";
    video.title = ad.title || "";
    video.src = url;

    // Aplica configuração da TV
    if (typeof TVCompat !== "undefined") {
      TVCompat.configureVideo(video);
    } else {
      // Configuração manual fallback
      video.muted = true;
      video.autoplay = true;
      video.loop = false;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.style.objectFit = "contain";
    }

    console.log(LOG_PREFIX + " Video criado: " + ad.title + " | URL: " + url);

    // Event: carregou
    video.addEventListener(
      "loadeddata",
      function () {
        var duration = video.duration ? video.duration.toFixed(1) : "?";
        var w = video.videoWidth || "?";
        var h = video.videoHeight || "?";
        console.log(
          LOG_PREFIX + " ✓ Video carregado: " + duration + "s - " + w + "x" + h,
        );

        if (callbacks && typeof callbacks.onLoaded === "function") {
          callbacks.onLoaded(video, ad);
        }
      },
      false,
    );

    // Event: terminou
    video.addEventListener(
      "ended",
      function () {
        console.log(LOG_PREFIX + " ⏭️ Video finalizado: " + ad.title);
        if (callbacks && typeof callbacks.onEnded === "function") {
          callbacks.onEnded(ad);
        }
      },
      false,
    );

    // Event: erro
    video.addEventListener(
      "error",
      function () {
        var errorCode = video.error ? video.error.code : "unknown";
        var errorMap = {
          1: "ABORTED",
          2: "NETWORK",
          3: "DECODE",
          4: "NOT_SUPPORTED",
        };
        var errorMsg = errorMap[errorCode] || "UNKNOWN (" + errorCode + ")";

        console.error(LOG_PREFIX + " ❌ Video erro [" + errorMsg + "]: " + url);

        if (callbacks && typeof callbacks.onError === "function") {
          callbacks.onError(ad, errorMsg);
        }
      },
      false,
    );

    // Event: pode reproduzir (para TVs que bloqueiam autoplay)
    video.addEventListener(
      "canplay",
      function () {
        // Tenta forçar play para TVs que bloqueiam autoplay
        if (video.paused) {
          var playResult = video.play();
          if (playResult && typeof playResult.catch === "function") {
            playResult.catch(function (e) {
              console.warn(LOG_PREFIX + " Autoplay bloqueado: " + e.message);
            });
          }
        }
      },
      false,
    );

    // Event: stall/waiting (para TVs com rede lenta)
    video.addEventListener(
      "waiting",
      function () {
        console.log(LOG_PREFIX + " ⏳ Buffering: " + ad.title);
      },
      false,
    );

    video.addEventListener(
      "stalled",
      function () {
        console.warn(LOG_PREFIX + " ⚠️ Stall: " + ad.title);
      },
      false,
    );

    return video;
  }

  /**
   * Cria elemento de imagem compatível
   */
  function createImage(ad, apiHost, callbacks) {
    var img = document.createElement("img");
    var url = buildMediaUrl(ad.file_path, apiHost);

    img.className = "media-item";
    img.title = ad.title || "";
    img.alt = ad.title || "Propaganda";
    img.src = url;

    // Aplica configuração da TV
    if (typeof TVCompat !== "undefined") {
      TVCompat.configureImage(img);
    } else {
      img.style.objectFit = "contain";
    }

    console.log(LOG_PREFIX + " Imagem criada: " + ad.title + " | URL: " + url);

    // Event: carregou
    img.addEventListener(
      "load",
      function () {
        var w = img.naturalWidth || "?";
        var h = img.naturalHeight || "?";
        var duration = ad.transition_duration || 10;
        console.log(
          LOG_PREFIX +
            " ✓ Imagem carregada: " +
            w +
            "x" +
            h +
            " (" +
            duration +
            "s)",
        );

        if (callbacks && typeof callbacks.onLoaded === "function") {
          callbacks.onLoaded(img, ad);
        }
      },
      false,
    );

    // Event: erro
    img.addEventListener(
      "error",
      function () {
        console.error(LOG_PREFIX + " ❌ Imagem erro: " + url);

        if (callbacks && typeof callbacks.onError === "function") {
          callbacks.onError(ad, "LOAD_FAILED");
        }
      },
      false,
    );

    return img;
  }

  /**
   * Cria o elemento de mídia correto baseado no tipo
   */
  function create(ad, apiHost, callbacks) {
    if (!ad || !ad.file_path) {
      console.error(LOG_PREFIX + " Ad inválido ou sem file_path");
      return null;
    }

    if (isVideoFile(ad.file_path)) {
      return createVideo(ad, apiHost, callbacks);
    }

    return createImage(ad, apiHost, callbacks);
  }

  /**
   * Limpa/destrói um elemento de mídia liberando recursos
   */
  function destroy(element) {
    if (!element) return;

    try {
      if (element.tagName === "VIDEO") {
        element.pause();
        element.removeAttribute("src");
        element.load(); // Libera buffer do vídeo

        // Remove event listeners (melhor prática)
        var clone = element.cloneNode(false);
        if (element.parentNode) {
          element.parentNode.replaceChild(clone, element);
          if (clone.parentNode) {
            clone.parentNode.removeChild(clone);
          }
        }
      } else {
        // Imagem: remove do DOM
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      }
    } catch (e) {
      console.warn(LOG_PREFIX + " Erro ao destruir mídia:", e.message);
      // Fallback: força remoção
      try {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      } catch (e2) {
        // Silencioso
      }
    }
  }

  // ========================================================================
  // API Pública
  // ========================================================================
  return {
    /** Cria elemento de mídia (auto-detecta tipo) */
    create: create,

    /** Cria vídeo */
    createVideo: createVideo,

    /** Cria imagem */
    createImage: createImage,

    /** Destrói elemento liberando recursos */
    destroy: destroy,

    /** Verifica se é vídeo */
    isVideo: isVideoFile,

    /** Constrói URL da mídia */
    buildUrl: buildMediaUrl,
  };
})();
