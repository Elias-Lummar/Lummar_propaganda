/**
 * ============================================================================
 * Módulo de Compatibilidade com TVs
 * ============================================================================
 * Detecta modelo/capacidade da TV e aplica ajustes automáticos.
 * Suporta TVs antigas (WebOS, Tizen, browsers antigos) e modernas.
 */

// eslint-disable-next-line no-unused-vars
var TVCompat = (function () {
  "use strict";

  // ========================================================================
  // Perfis de TV conhecidos
  // ========================================================================
  var TV_PROFILES = {
    // Samsung Tizen (Smart TVs 2015+)
    TIZEN: {
      name: "Samsung Tizen",
      videoCodecs: ["h264", "h265", "vp8", "vp9"],
      maxResolution: { w: 3840, h: 2160 },
      supportsWakeLock: false,
      supportsFullscreen: true,
      needsVideoPreload: true,
      objectFit: "contain",
      quirks: ["no-wakelock", "needs-user-gesture-video"],
    },
    // LG WebOS (Smart TVs 2014+)
    WEBOS: {
      name: "LG WebOS",
      videoCodecs: ["h264", "vp8"],
      maxResolution: { w: 3840, h: 2160 },
      supportsWakeLock: false,
      supportsFullscreen: true,
      needsVideoPreload: true,
      objectFit: "contain",
      quirks: ["no-wakelock", "webos-visibility"],
    },
    // Android TV / Chromecast
    ANDROID_TV: {
      name: "Android TV",
      videoCodecs: ["h264", "h265", "vp8", "vp9"],
      maxResolution: { w: 3840, h: 2160 },
      supportsWakeLock: true,
      supportsFullscreen: true,
      needsVideoPreload: false,
      objectFit: "contain",
      quirks: [],
    },
    // Fire TV (Amazon)
    FIRE_TV: {
      name: "Amazon Fire TV",
      videoCodecs: ["h264", "h265"],
      maxResolution: { w: 1920, h: 1080 },
      supportsWakeLock: false,
      supportsFullscreen: true,
      needsVideoPreload: true,
      objectFit: "contain",
      quirks: ["no-wakelock", "limited-memory"],
    },
    // Roku TV
    ROKU: {
      name: "Roku TV",
      videoCodecs: ["h264"],
      maxResolution: { w: 1920, h: 1080 },
      supportsWakeLock: false,
      supportsFullscreen: false,
      needsVideoPreload: true,
      objectFit: "contain",
      quirks: ["no-wakelock", "no-fullscreen", "limited-css"],
    },
    // TVs antigas com browsers embutidos (Opera TV, NetCast, etc.)
    LEGACY: {
      name: "TV Legada",
      videoCodecs: ["h264"],
      maxResolution: { w: 1920, h: 1080 },
      supportsWakeLock: false,
      supportsFullscreen: false,
      needsVideoPreload: true,
      objectFit: "fill",
      quirks: [
        "no-wakelock",
        "no-fullscreen",
        "limited-css",
        "no-flexbox",
        "limited-memory",
        "no-es6",
      ],
    },
    // Browser moderno desktop/mobile (Chrome, Firefox, Edge)
    MODERN: {
      name: "Browser Moderno",
      videoCodecs: ["h264", "h265", "vp8", "vp9", "av1"],
      maxResolution: { w: 7680, h: 4320 },
      supportsWakeLock: true,
      supportsFullscreen: true,
      needsVideoPreload: false,
      objectFit: "contain",
      quirks: [],
    },
  };

  // ========================================================================
  // Detecção de Plataforma
  // ========================================================================
  function detectPlatform() {
    var ua = navigator.userAgent || "";
    var uaLower = ua.toLowerCase();

    // Samsung Tizen
    if (
      uaLower.indexOf("tizen") !== -1 ||
      typeof window.tizen !== "undefined"
    ) {
      return "TIZEN";
    }

    // LG WebOS
    if (
      uaLower.indexOf("webos") !== -1 ||
      uaLower.indexOf("web0s") !== -1 ||
      typeof window.webOS !== "undefined"
    ) {
      return "WEBOS";
    }

    // Amazon Fire TV
    if (
      uaLower.indexOf("silk") !== -1 ||
      uaLower.indexOf("aftb") !== -1 ||
      uaLower.indexOf("aftt") !== -1
    ) {
      return "FIRE_TV";
    }

    // Roku
    if (uaLower.indexOf("roku") !== -1) {
      return "ROKU";
    }

    // Android TV
    if (
      uaLower.indexOf("android") !== -1 &&
      (uaLower.indexOf("tv") !== -1 ||
        uaLower.indexOf("nexusplayer") !== -1 ||
        uaLower.indexOf("adt-") !== -1)
    ) {
      return "ANDROID_TV";
    }

    // Detecção de TV genérica / browsers antigos
    if (
      uaLower.indexOf("smart-tv") !== -1 ||
      uaLower.indexOf("smarttv") !== -1 ||
      uaLower.indexOf("nettv") !== -1 ||
      uaLower.indexOf("hbbtv") !== -1 ||
      uaLower.indexOf("opera tv") !== -1 ||
      uaLower.indexOf("netcast") !== -1 ||
      uaLower.indexOf("philipstv") !== -1 ||
      uaLower.indexOf("espial") !== -1
    ) {
      return "LEGACY";
    }

    // Detecção por features (browsers muito antigos)
    if (!supportsES6() || !supportsFlexbox()) {
      return "LEGACY";
    }

    return "MODERN";
  }

  // ========================================================================
  // Feature Detection
  // ========================================================================
  function supportsES6() {
    try {
      // testa arrow function + template literal + let/const
      new Function("let a = 1; const b = `${a}`; var c = () => a;");
      return true;
    } catch (e) {
      return false;
    }
  }

  function supportsFlexbox() {
    var el = document.createElement("div");
    return (
      typeof el.style.flexBasis !== "undefined" ||
      typeof el.style.webkitFlexBasis !== "undefined" ||
      typeof el.style.msFlexPositive !== "undefined"
    );
  }

  function supportsRequestAnimationFrame() {
    return (
      typeof window.requestAnimationFrame === "function" ||
      typeof window.webkitRequestAnimationFrame === "function" ||
      typeof window.mozRequestAnimationFrame === "function"
    );
  }

  function supportsObjectFit() {
    return typeof document.createElement("div").style.objectFit !== "undefined";
  }

  function supportsVideoFormat(format) {
    var video = document.createElement("video");
    var formats = {
      h264: 'video/mp4; codecs="avc1.42E01E"',
      h265: 'video/mp4; codecs="hev1.1.6.L93.B0"',
      vp8: 'video/webm; codecs="vp8"',
      vp9: 'video/webm; codecs="vp9"',
      av1: 'video/mp4; codecs="av01.0.01M.08"',
    };

    if (!formats[format]) return false;

    var support = video.canPlayType(formats[format]);
    return support === "probably" || support === "maybe";
  }

  function supportsWakeLockAPI() {
    return "wakeLock" in navigator;
  }

  function supportsFullscreenAPI() {
    return !!(
      document.fullscreenEnabled ||
      document.webkitFullscreenEnabled ||
      document.mozFullScreenEnabled ||
      document.msFullscreenEnabled
    );
  }

  // ========================================================================
  // Polyfills para TVs Antigas
  // ========================================================================
  function applyPolyfills(profile) {
    // requestAnimationFrame polyfill
    if (!supportsRequestAnimationFrame()) {
      window.requestAnimationFrame =
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        function (callback) {
          return window.setTimeout(callback, 1000 / 60);
        };
      window.cancelAnimationFrame =
        window.webkitCancelAnimationFrame ||
        window.mozCancelAnimationFrame ||
        function (id) {
          clearTimeout(id);
        };
      console.log("[TVCompat] ✓ Polyfill: requestAnimationFrame");
    }

    // console.log polyfill
    if (typeof console === "undefined") {
      window.console = {
        log: function () {},
        warn: function () {},
        error: function () {},
        info: function () {},
      };
    }

    // Array.isArray polyfill
    if (!Array.isArray) {
      Array.isArray = function (arg) {
        return Object.prototype.toString.call(arg) === "[object Array]";
      };
      console.log("[TVCompat] ✓ Polyfill: Array.isArray");
    }

    // Array.prototype.filter polyfill
    if (!Array.prototype.filter) {
      Array.prototype.filter = function (fn, thisArg) {
        var result = [];
        for (var i = 0; i < this.length; i++) {
          if (fn.call(thisArg, this[i], i, this)) {
            result.push(this[i]);
          }
        }
        return result;
      };
      console.log("[TVCompat] ✓ Polyfill: Array.filter");
    }

    // Array.prototype.map polyfill
    if (!Array.prototype.map) {
      Array.prototype.map = function (fn, thisArg) {
        var result = [];
        for (var i = 0; i < this.length; i++) {
          result.push(fn.call(thisArg, this[i], i, this));
        }
        return result;
      };
      console.log("[TVCompat] ✓ Polyfill: Array.map");
    }

    // Array.prototype.findIndex polyfill
    if (!Array.prototype.findIndex) {
      Array.prototype.findIndex = function (fn, thisArg) {
        for (var i = 0; i < this.length; i++) {
          if (fn.call(thisArg, this[i], i, this)) return i;
        }
        return -1;
      };
      console.log("[TVCompat] ✓ Polyfill: Array.findIndex");
    }

    // Array.prototype.includes polyfill
    if (!Array.prototype.includes) {
      Array.prototype.includes = function (val) {
        for (var i = 0; i < this.length; i++) {
          if (this[i] === val) return true;
        }
        return false;
      };
      console.log("[TVCompat] ✓ Polyfill: Array.includes");
    }

    // String.prototype.startsWith polyfill
    if (!String.prototype.startsWith) {
      String.prototype.startsWith = function (search, pos) {
        pos = pos || 0;
        return this.substr(pos, search.length) === search;
      };
      console.log("[TVCompat] ✓ Polyfill: String.startsWith");
    }

    // String.prototype.includes polyfill
    if (!String.prototype.includes) {
      String.prototype.includes = function (search) {
        return this.indexOf(search) !== -1;
      };
      console.log("[TVCompat] ✓ Polyfill: String.includes");
    }

    // String.prototype.repeat polyfill
    if (!String.prototype.repeat) {
      String.prototype.repeat = function (count) {
        var str = "";
        for (var i = 0; i < count; i++) str += this;
        return str;
      };
      console.log("[TVCompat] ✓ Polyfill: String.repeat");
    }

    // Promise polyfill check
    if (typeof Promise === "undefined") {
      console.warn(
        "[TVCompat] ⚠️ Promise não suportado - funcionalidade async limitada",
      );
    }

    // JSON.parse/stringify check
    if (typeof JSON === "undefined") {
      console.error("[TVCompat] ❌ JSON não suportado - TV muito antiga");
    }

    // object-fit polyfill via CSS
    if (!supportsObjectFit()) {
      applyObjectFitFallback(profile);
      console.log("[TVCompat] ✓ Polyfill: object-fit (CSS fallback)");
    }

    console.log("[TVCompat] ✓ Polyfills aplicados para: " + profile.name);
  }

  // ========================================================================
  // CSS Fallback para object-fit em TVs sem suporte
  // ========================================================================
  function applyObjectFitFallback(profile) {
    var style = document.createElement("style");
    style.textContent =
      ".media-item {" +
      "  position: absolute !important;" +
      "  top: 0 !important;" +
      "  left: 0 !important;" +
      "  width: 100% !important;" +
      "  height: 100% !important;" +
      "}" +
      "video.media-item {" +
      "  background: #000;" +
      "}" +
      "img.media-item {" +
      "  max-width: 100%;" +
      "  max-height: 100%;" +
      "  margin: auto;" +
      "  display: block;" +
      "}";
    document.head.appendChild(style);
  }

  // ========================================================================
  // Ajustes de layout para TVs sem Flexbox
  // ========================================================================
  function applyFlexboxFallback() {
    if (supportsFlexbox()) return;

    var style = document.createElement("style");
    style.textContent =
      "#presenter-container {" +
      "  display: block !important;" +
      "  position: fixed !important;" +
      "  top: 0; left: 0;" +
      "  width: 100%; height: 100%;" +
      "}" +
      "#media-container {" +
      "  display: block !important;" +
      "  position: relative !important;" +
      "  width: 100%; height: 100%;" +
      "  text-align: center;" +
      "}" +
      "#no-ads-message, #loading-indicator {" +
      "  display: block !important;" +
      "  position: absolute !important;" +
      "  top: 50%; left: 50%;" +
      "  margin-top: -100px;" +
      "  margin-left: -200px;" +
      "  width: 400px;" +
      "}";
    document.head.appendChild(style);
    console.log("[TVCompat] ✓ Flexbox fallback aplicado");
  }

  // ========================================================================
  // Configuração de vídeo compatível
  // ========================================================================
  function configureVideo(videoElement, profile) {
    // Atributos básicos universais
    videoElement.setAttribute("playsinline", "");
    videoElement.setAttribute("webkit-playsinline", "");
    videoElement.muted = true;
    videoElement.autoplay = true;
    videoElement.loop = false;

    // Preload para TVs que precisam
    if (profile.needsVideoPreload) {
      videoElement.preload = "auto";
    } else {
      videoElement.preload = "metadata";
    }

    // object-fit
    if (supportsObjectFit()) {
      videoElement.style.objectFit = profile.objectFit || "contain";
    }

    // Quirks específicas
    if (profile.quirks.indexOf("needs-user-gesture-video") !== -1) {
      // Tizen requer gesto do usuário, tenta bypass
      videoElement.muted = true;
      videoElement.volume = 0;
    }

    if (profile.quirks.indexOf("limited-memory") !== -1) {
      // TVs com pouca memória: desabilitar buffering agressivo
      videoElement.preload = "none";
    }

    return videoElement;
  }

  // ========================================================================
  // Configuração de imagem compatível
  // ========================================================================
  function configureImage(imgElement, profile) {
    if (supportsObjectFit()) {
      imgElement.style.objectFit = profile.objectFit || "contain";
    } else {
      // Fallback: centralizar via margin
      imgElement.style.maxWidth = "100%";
      imgElement.style.maxHeight = "100%";
      imgElement.style.margin = "auto";
      imgElement.style.display = "block";
      imgElement.style.position = "absolute";
      imgElement.style.top = "50%";
      imgElement.style.left = "50%";
      imgElement.style.transform = "translate(-50%, -50%)";

      // TVs sem transform
      if (typeof imgElement.style.transform === "undefined") {
        imgElement.style.top = "0";
        imgElement.style.left = "0";
        imgElement.style.margin = "0";
      }
    }

    return imgElement;
  }

  // ========================================================================
  // API Pública
  // ========================================================================
  var platformKey = detectPlatform();
  var profile = TV_PROFILES[platformKey];

  return {
    /** Inicializa compatibilidade */
    init: function () {
      // Aplica polyfills PRIMEIRO (antes de usar .repeat etc)
      applyPolyfills(profile);
      applyFlexboxFallback();

      var sep = "==================================================";
      console.log(sep);
      console.log("[TVCompat] Plataforma detectada: " + profile.name);
      console.log("[TVCompat] Chave: " + platformKey);
      console.log("[TVCompat] User Agent: " + navigator.userAgent);
      console.log(
        "[TVCompat] Quirks: " +
          (profile.quirks.length ? profile.quirks.join(", ") : "nenhum"),
      );
      console.log(sep);

      return this;
    },

    /** Retorna o perfil atual */
    getProfile: function () {
      return profile;
    },

    /** Retorna o nome da plataforma */
    getPlatformName: function () {
      return profile.name;
    },

    /** Retorna a chave da plataforma */
    getPlatformKey: function () {
      return platformKey;
    },

    /** Verifica se tem uma quirk específica */
    hasQuirk: function (quirk) {
      return profile.quirks.indexOf(quirk) !== -1;
    },

    /** Verifica se suporta WakeLock */
    supportsWakeLock: function () {
      return profile.supportsWakeLock && supportsWakeLockAPI();
    },

    /** Verifica se suporta fullscreen */
    supportsFullscreen: function () {
      return profile.supportsFullscreen && supportsFullscreenAPI();
    },

    /** Configura vídeo para a TV */
    configureVideo: function (videoEl) {
      return configureVideo(videoEl, profile);
    },

    /** Configura imagem para a TV */
    configureImage: function (imgEl) {
      return configureImage(imgEl, profile);
    },

    /** Verifica suporte a codec de vídeo */
    supportsCodec: function (codec) {
      return supportsVideoFormat(codec);
    },

    /** Retorna features suportadas */
    getFeatures: function () {
      return {
        es6: supportsES6(),
        flexbox: supportsFlexbox(),
        objectFit: supportsObjectFit(),
        wakeLock: supportsWakeLockAPI(),
        fullscreen: supportsFullscreenAPI(),
        raf: supportsRequestAnimationFrame(),
        h264: supportsVideoFormat("h264"),
        vp9: supportsVideoFormat("vp9"),
        platform: platformKey,
        name: profile.name,
      };
    },
  };
})();
