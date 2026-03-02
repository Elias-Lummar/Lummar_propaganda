/**
 * ============================================================================
 * Módulo de Fila de Propagandas
 * ============================================================================
 * Gerencia a fila circular de anúncios com atualização dinâmica.
 * Escrito em ES5 para compatibilidade com TVs antigas.
 */

// eslint-disable-next-line no-unused-vars
var AdsQueue = (function () {
  "use strict";

  var LOG_PREFIX = "[AdsQueue]";

  /**
   * Construtor da fila
   */
  function Queue() {
    this.queue = [];
    this.currentIndex = 0;
  }

  /**
   * Define a lista de propagandas (reset completo)
   */
  Queue.prototype.setAds = function (ads) {
    this.queue = [];
    for (var i = 0; i < ads.length; i++) {
      if (ads[i] && ads[i].file_path) {
        this.queue.push(ads[i]);
      }
    }
    this.currentIndex = 0;
    console.log(
      LOG_PREFIX + " Inicializada com " + this.queue.length + " propagandas",
    );
  };

  /**
   * Retorna propaganda atual
   */
  Queue.prototype.getCurrent = function () {
    if (this.queue.length === 0) return null;
    return this.queue[this.currentIndex] || null;
  };

  /**
   * Avança para a próxima (circular)
   */
  Queue.prototype.getNext = function () {
    if (this.queue.length === 0) return null;
    this.currentIndex = (this.currentIndex + 1) % this.queue.length;
    return this.getCurrent();
  };

  /**
   * Volta para a anterior (circular)
   */
  Queue.prototype.getPrevious = function () {
    if (this.queue.length === 0) return null;
    this.currentIndex =
      this.currentIndex === 0 ? this.queue.length - 1 : this.currentIndex - 1;
    return this.getCurrent();
  };

  /**
   * Retorna tamanho da fila
   */
  Queue.prototype.getSize = function () {
    return this.queue.length;
  };

  /**
   * Retorna índice atual
   */
  Queue.prototype.getCurrentIndex = function () {
    return this.currentIndex;
  };

  /**
   * Atualiza a fila mantendo a posição atual quando possível.
   * @param {Array} newAds - Novas propagandas
   * @returns {boolean} true se a propaganda atual foi removida
   */
  Queue.prototype.updateQueue = function (newAds) {
    var currentAd = this.getCurrent();
    var currentAdId = currentAd ? currentAd.id : null;

    // Reconstrói a fila apenas com ads válidos
    this.queue = [];
    for (var i = 0; i < newAds.length; i++) {
      if (newAds[i] && newAds[i].file_path) {
        this.queue.push(newAds[i]);
      }
    }

    var wasRemoved = false;

    // Tenta manter na mesma propaganda
    if (currentAdId !== null) {
      var newIndex = -1;
      for (var j = 0; j < this.queue.length; j++) {
        if (this.queue[j].id === currentAdId) {
          newIndex = j;
          break;
        }
      }

      if (newIndex !== -1) {
        this.currentIndex = newIndex;
      } else {
        // Propaganda removida, ajusta índice
        wasRemoved = true;
        this.currentIndex = Math.min(
          this.currentIndex,
          Math.max(0, this.queue.length - 1),
        );
      }
    } else {
      this.currentIndex = 0;
    }

    console.log(
      LOG_PREFIX +
        " Atualizada: " +
        this.queue.length +
        " propagandas" +
        (wasRemoved ? " (atual removida)" : ""),
    );

    return wasRemoved;
  };

  /**
   * Verifica se a fila está vazia
   */
  Queue.prototype.isEmpty = function () {
    return this.queue.length === 0;
  };

  /**
   * Retorna info para debug
   */
  Queue.prototype.getDebugInfo = function () {
    var current = this.getCurrent();
    return {
      size: this.queue.length,
      currentIndex: this.currentIndex,
      currentTitle: current ? current.title : "N/A",
      currentId: current ? current.id : null,
    };
  };

  // Retorna construtor como factory
  return {
    create: function () {
      return new Queue();
    },
  };
})();
