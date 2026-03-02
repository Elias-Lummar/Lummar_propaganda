// Admin Panel JavaScript compatível ES5
(function () {
  var currentEditId = null;
  var currentPanel = "presenter"; // Painel atualmente selecionado
  var allAds = []; // Cache de todas as propagandas
  var orderChanged = false; // Flag para indicar mudança na ordem

  // Variáveis de paginação
  var currentPage = 1;
  var itemsPerPage = 50;
  var filteredAdsCache = [];

  function bindEvents() {
    document.getElementById("adForm").addEventListener("submit", function (e) {
      e.preventDefault();
      handleFormSubmit();
    });
    document
      .getElementById("cancelEdit")
      .addEventListener("click", function () {
        resetForm();
      });
    document.getElementById("file").addEventListener("change", function (e) {
      handleFileSelect(e);
    });
  }

  function handleFormSubmit() {
    var fileInput = document.getElementById("file");
    var title = document.getElementById("title").value.trim();
    var startTime = document.getElementById("startTime").value;
    var endTime = document.getElementById("endTime").value;
    var transitionType = document.getElementById("transitionType").value;
    var transitionDuration =
      document.getElementById("transitionDuration").value;
    var panel = document.getElementById("panel");

    // Função para obter as marcações dos checkboxes
    function obterMarcacoes() {
      var checkboxes = panel.querySelectorAll('input[type="checkbox"]');
      var marcacoes = [];

      checkboxes.forEach(function (checkbox) {
        if (checkbox.checked) {
          marcacoes.push(checkbox.value);
        }
      });

      return marcacoes;
    }

    var paineisSelecionados = obterMarcacoes();

    // Validação: verificar se pelo menos um painel foi selecionado
    if (paineisSelecionados.length === 0) {
      showAlert("Por favor, selecione pelo menos um painel!", "danger");
      return;
    }

    // Validação: verificar se o título não está vazio
    if (!title) {
      showAlert("Por favor, preencha o título da propaganda!", "danger");
      return;
    }

    if (new Date(startTime) >= new Date(endTime)) {
      showAlert("A data de início deve ser anterior à data de fim!", "danger");
      return;
    }

    // Validação: verificar se já existe uma propaganda com o mesmo título
    checkTitleUniqueness(title, currentEditId)
      .then(function (isUnique) {
        if (!isUnique) {
          showAlert(
            "Já existe uma propaganda com este título! Por favor, escolha outro título.",
            "danger",
          );
          return;
        }

        // Continuar com o processo de salvamento
        processSaveAd(
          fileInput,
          title,
          startTime,
          endTime,
          transitionType,
          transitionDuration,
          paineisSelecionados,
        );
      })
      .catch(function (error) {
        showAlert("Erro ao verificar título: " + error.message, "danger");
      });
  }

  function checkTitleUniqueness(title, editingId) {
    return fetch("/api/ads")
      .then(function (response) {
        if (!response.ok) throw new Error("Erro ao verificar títulos");
        return response.json();
      })
      .then(function (ads) {
        // Verifica se existe alguma propaganda com o mesmo título
        for (var i = 0; i < ads.length; i++) {
          var ad = ads[i];
          // Se o título for igual E não for a propaganda que está sendo editada
          if (
            ad.title.trim().toLowerCase() === title.toLowerCase() &&
            (!editingId || ad.id != editingId)
          ) {
            return false; // Título já existe
          }
        }
        return true; // Título é único
      });
  }

  function processSaveAd(
    fileInput,
    title,
    startTime,
    endTime,
    transitionType,
    transitionDuration,
    paineisSelecionados,
  ) {
    var filePath = "";
    var uploadPromise;
    if (fileInput.files[0]) {
      var uploadData = new FormData();
      uploadData.append("file", fileInput.files[0]);
      uploadPromise = fetch("/api/upload", {
        method: "POST",
        body: uploadData,
      })
        .then(function (uploadResponse) {
          if (!uploadResponse.ok) throw new Error("Erro no upload do arquivo");
          return uploadResponse.json();
        })
        .then(function (uploadResult) {
          filePath = uploadResult.file_path;
        });
    } else if (currentEditId) {
      uploadPromise = getAdById(currentEditId).then(function (existingAd) {
        filePath = existingAd.file_path;
      });
    } else {
      showAlert("Por favor, selecione um arquivo!", "danger");
      return;
    }

    Promise.resolve(uploadPromise)
      .then(function () {
        var adData = {
          title: title,
          file_path: filePath,
          start_time: startTime,
          end_time: endTime,
          transition_type: transitionType,
          transition_duration: parseInt(transitionDuration, 10),
          screens: paineisSelecionados,
        };

        var url = currentEditId ? "/api/ads/" + currentEditId : "/api/ads";
        var method = currentEditId ? "PUT" : "POST";

        fetch(url, {
          method: method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(adData),
        })
          .then(function (response) {
            if (!response.ok) throw new Error("Erro ao salvar propaganda");
            return response.json();
          })
          .then(function (result) {
            showAlert(
              currentEditId
                ? "Propaganda atualizada com sucesso!"
                : "Propaganda criada com sucesso!",
              "success",
            );
            resetForm();
            loadAds();
          })
          .catch(function (error) {
            showAlert("Erro: " + error.message, "danger");
          });
      })
      .catch(function (error) {
        showAlert("Erro: " + error.message, "danger");
      });
  }

  function getAdById(id) {
    return fetch("/api/ads")
      .then(function (response) {
        return response.json();
      })
      .then(function (ads) {
        for (var i = 0; i < ads.length; i++) {
          if (ads[i].id == id) return ads[i];
        }
        return null;
      });
  }

  function handleFileSelect(event) {
    var file = event.target.files[0];
    if (file) {
      if (!file.type.match(/^image\//) && !file.type.match(/^video\//)) {
        showAlert(
          "Por favor, selecione apenas arquivos de imagem ou vídeo!",
          "danger",
        );
        event.target.value = "";
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        showAlert("O arquivo é muito grande! Tamanho máximo: 100MB", "danger");
        event.target.value = "";
        return;
      }
    }
  }

  function loadAds() {
    fetch("/api/ads")
      .then(function (response) {
        if (!response.ok) throw new Error("Erro ao carregar propagandas");
        return response.json();
      })
      .then(function (ads) {
        allAds = ads;
        createPanelTabs();
        renderAdsTable(currentPanel);
      })
      .catch(function (error) {
        console.log("Erro ao carregar propagandas: " + error.message);
        var tbody = document.getElementById("adsTableBody");
        if (tbody) {
          tbody.innerHTML =
            '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar propagandas</td></tr>';
        }
      });
  }

  function createPanelTabs() {
    var tabsContainer = document.getElementById("panelTabs");
    if (!tabsContainer) return;

    var panels = {
      presenter: "Principal",
      presenter1: "Painel 1",
      presenter2: "Painel 2",
      presenter3: "Painel 3",
      presenter4: "Painel 4",
    };

    var tabsHtml = "";
    Object.keys(panels).forEach(function (panelKey) {
      var isActive = panelKey === currentPanel ? "active" : "";
      tabsHtml +=
        '<button class="tab-button ' +
        isActive +
        '" data-panel="' +
        panelKey +
        '">' +
        panels[panelKey] +
        "</button>";
    });

    tabsContainer.innerHTML = tabsHtml;

    // Adicionar eventos de clique nas abas
    tabsContainer.querySelectorAll(".tab-button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        currentPanel = this.getAttribute("data-panel");

        // Atualizar classes ativas
        tabsContainer.querySelectorAll(".tab-button").forEach(function (b) {
          b.classList.remove("active");
        });
        this.classList.add("active");

        // Renderizar propagandas do painel
        renderAdsTable(currentPanel);
      });
    });
  }

  function renderAdsTable(panelFilter) {
    var tbody = document.getElementById("adsTableBody");
    if (!tbody) return;

    // Filtrar propagandas pelo painel selecionado e ordenar por display_order
    filteredAdsCache = allAds.filter(function (ad) {
      return ad.screens && ad.screens.indexOf(panelFilter) !== -1;
    });
    filteredAdsCache.sort(function (a, b) {
      return (a.display_order || 0) - (b.display_order || 0);
    });

    if (filteredAdsCache.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="text-center text-muted"><i class="fas fa-inbox me-2"></i>Nenhuma propaganda cadastrada para este painel</td></tr>';
      updatePagination();
      return;
    }

    // Calcular paginação
    var totalPages = Math.ceil(filteredAdsCache.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    var startIdx = (currentPage - 1) * itemsPerPage;
    var endIdx = Math.min(startIdx + itemsPerPage, filteredAdsCache.length);
    var paginatedAds = filteredAdsCache.slice(startIdx, endIdx);

    var rows = "";
    for (var i = 0; i < paginatedAds.length; i++) {
      var ad = paginatedAds[i];
      var globalIndex = filteredAdsCache.indexOf(ad);
      var isFirst = globalIndex === 0;
      var isLast = globalIndex === filteredAdsCache.length - 1;
      var status = getAdStatus(ad);
      var isImage =
        ad.file_path && ad.file_path.match(/\.(jpg|jpeg|png|gif)$/i);
      var isVideo =
        ad.file_path && ad.file_path.match(/\.(mp4|avi|mov|webm)$/i);

      rows +=
        '<tr data-ad-id="' +
        ad.id +
        '">' +
        "<td>" +
        ad.id +
        "</td>" +
        "<td><strong>" +
        ad.title +
        "</strong></td>" +
        "<td>" +
        (ad.file_path
          ? '<div class="d-flex align-items-center">' +
            (isImage
              ? '<img src="' +
                ad.file_path +
                '" class="file-preview me-2" alt="Preview">'
              : "") +
            (isVideo ? '<i class="fas fa-video me-2"></i>' : "") +
            '<small class="text-muted">' +
            ad.file_path.split("/").pop() +
            "</small></div>"
          : '<span class="text-muted">Sem arquivo</span>') +
        "</td>" +
        "<td><small><strong>Início:</strong> " +
        formatDateTime(ad.start_time) +
        "<br><strong>Fim:</strong> " +
        formatDateTime(ad.end_time) +
        "</small></td>" +
        '<td><div class="d-flex align-items-center"><span>' +
        getTransitionLabel(ad.transition_type) +
        '</span><small class="text-muted ms-1">(' +
        ad.transition_duration +
        "s)</small></div></td>" +
        '<td><span class="badge ' +
        status.class +
        '">' +
        status.text +
        "</span></td>" +
        '<td><div class="btn-group btn-group-sm" role="group">' +
        '<button class="btn btn-outline-secondary' +
        (isFirst ? " disabled" : "") +
        '" onclick="moveAdUp(' +
        ad.id +
        ')" title="Mover para cima"' +
        (isFirst ? " disabled" : "") +
        '><i class="fas fa-arrow-up"></i></button>' +
        '<button class="btn btn-outline-secondary' +
        (isLast ? " disabled" : "") +
        '" onclick="moveAdDown(' +
        ad.id +
        ')" title="Mover para baixo"' +
        (isLast ? " disabled" : "") +
        '><i class="fas fa-arrow-down"></i></button>' +
        '<button class="btn btn-outline-primary" onclick="editAd(' +
        ad.id +
        ')" title="Editar"><i class="fas fa-edit"></i></button>' +
        '<button class="btn btn-outline-danger" onclick="deleteAd(' +
        ad.id +
        ')" title="Excluir"><i class="fas fa-trash"></i></button>' +
        "</div></td>" +
        "</tr>";
    }
    tbody.innerHTML = rows;

    // Atualizar paginação
    updatePagination();
  }

  // ========================================================================
  // Funções de Paginação
  // ========================================================================
  function updatePagination() {
    var totalPages = Math.ceil(filteredAdsCache.length / itemsPerPage);
    var pageInfo = document.getElementById("pageInfo");
    var controls = document.getElementById("paginationControls");

    if (!pageInfo || !controls) return;

    // Atualizar informação de página
    if (filteredAdsCache.length === 0) {
      pageInfo.textContent = "";
      controls.innerHTML = "";
      return;
    }

    var startIdx = (currentPage - 1) * itemsPerPage + 1;
    var endIdx = Math.min(currentPage * itemsPerPage, filteredAdsCache.length);
    pageInfo.textContent =
      "Mostrando " + startIdx + "-" + endIdx + " de " + filteredAdsCache.length;

    // Renderizar controles de paginação
    if (totalPages <= 1) {
      controls.innerHTML = "";
      return;
    }

    var html = "";

    // Botão Anterior
    html +=
      '<li class="page-item' + (currentPage === 1 ? " disabled" : "") + '">';
    html +=
      '<a class="page-link" href="#" onclick="goToPage(' +
      (currentPage - 1) +
      '); return false;">Anterior</a>';
    html += "</li>";

    // Páginas numeradas
    for (var i = 1; i <= totalPages; i++) {
      html +=
        '<li class="page-item' + (i === currentPage ? " active" : "") + '">';
      html +=
        '<a class="page-link" href="#" onclick="goToPage(' +
        i +
        '); return false;">' +
        i +
        "</a>";
      html += "</li>";
    }

    // Botão Próximo
    html +=
      '<li class="page-item' +
      (currentPage === totalPages ? " disabled" : "") +
      '">';
    html +=
      '<a class="page-link" href="#" onclick="goToPage(' +
      (currentPage + 1) +
      '); return false;">Próximo</a>';
    html += "</li>";

    controls.innerHTML = html;
  }

  window.goToPage = function (page) {
    var totalPages = Math.ceil(filteredAdsCache.length / itemsPerPage);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderAdsTable(currentPanel);
  };

  window.changeItemsPerPage = function () {
    var select = document.getElementById("itemsPerPage");
    itemsPerPage = parseInt(select.value, 10);
    currentPage = 1;
    renderAdsTable(currentPanel);
  };

  // ========================================================================
  // Movimentação de Itens (Ordem)
  // ========================================================================
  window.moveAdUp = function (adId) {
    // Encontrar no filteredAdsCache para saber vizinho
    var filtIdx = -1;
    for (var i = 0; i < filteredAdsCache.length; i++) {
      if (filteredAdsCache[i].id === adId) {
        filtIdx = i;
        break;
      }
    }
    if (filtIdx <= 0) return; // Já é o primeiro

    var movingAd = filteredAdsCache[filtIdx];
    var targetAd = filteredAdsCache[filtIdx - 1];

    // Trocar display_order entre os dois
    var tempOrder = movingAd.display_order;
    movingAd.display_order = targetAd.display_order;
    targetAd.display_order = tempOrder;

    // Atualizar no allAds também
    for (var j = 0; j < allAds.length; j++) {
      if (allAds[j].id === movingAd.id)
        allAds[j].display_order = movingAd.display_order;
      if (allAds[j].id === targetAd.id)
        allAds[j].display_order = targetAd.display_order;
    }

    // Ordenar allAds por display_order para que o filtro preserve a ordem
    allAds.sort(function (a, b) {
      return a.display_order - b.display_order;
    });

    // Re-renderizar e mostrar botão salvar
    renderAdsTable(currentPanel);
    markOrderChanged();
  };

  window.moveAdDown = function (adId) {
    // Encontrar no filteredAdsCache para saber vizinho
    var filtIdx = -1;
    for (var i = 0; i < filteredAdsCache.length; i++) {
      if (filteredAdsCache[i].id === adId) {
        filtIdx = i;
        break;
      }
    }
    if (filtIdx < 0 || filtIdx >= filteredAdsCache.length - 1) return; // Já é o último

    var movingAd = filteredAdsCache[filtIdx];
    var targetAd = filteredAdsCache[filtIdx + 1];

    // Trocar display_order entre os dois
    var tempOrder = movingAd.display_order;
    movingAd.display_order = targetAd.display_order;
    targetAd.display_order = tempOrder;

    // Atualizar no allAds também
    for (var j = 0; j < allAds.length; j++) {
      if (allAds[j].id === movingAd.id)
        allAds[j].display_order = movingAd.display_order;
      if (allAds[j].id === targetAd.id)
        allAds[j].display_order = targetAd.display_order;
    }

    // Ordenar allAds por display_order para que o filtro preserve a ordem
    allAds.sort(function (a, b) {
      return a.display_order - b.display_order;
    });

    // Re-renderizar e mostrar botão salvar
    renderAdsTable(currentPanel);
    markOrderChanged();
  };

  function markOrderChanged() {
    orderChanged = true;
    var btn = document.getElementById("saveOrderBtn");
    if (btn) {
      btn.style.display = "inline-block";
      btn.classList.add("btn-pulse");
    }
  }

  function saveOrderToServer() {
    // Envia TODAS as ordens do filteredAdsCache atual
    var orders = [];
    for (var i = 0; i < filteredAdsCache.length; i++) {
      orders.push({
        id: filteredAdsCache[i].id,
        order: filteredAdsCache[i].display_order,
      });
    }

    fetch("/api/ads/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orders: orders }),
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Erro ao salvar ordem");
        return response.json();
      })
      .then(function () {
        // Sucesso silencioso
      })
      .catch(function (error) {
        showAlert("Erro ao salvar ordem: " + error.message, "danger");
      });
  }

  // Salvar ordem no servidor (botão manual)
  window.saveOrder = function () {
    var orders = [];
    for (var i = 0; i < filteredAdsCache.length; i++) {
      orders.push({
        id: filteredAdsCache[i].id,
        order: filteredAdsCache[i].display_order,
      });
    }

    var btn = document.getElementById("saveOrderBtn");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Salvando...';
    }

    fetch("/api/ads/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orders: orders }),
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Erro ao salvar ordem");
        return response.json();
      })
      .then(function () {
        showAlert(
          "Ordem de exibição salva com sucesso! As TVs serão atualizadas automaticamente.",
          "success",
        );
        orderChanged = false;
        if (btn) {
          btn.classList.remove("btn-pulse");
          btn.style.display = "none";
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-save me-1"></i>Salvar Ordem';
        }
        // Recarrega para sincronizar com o servidor
        loadAds();
      })
      .catch(function (error) {
        showAlert("Erro ao salvar ordem: " + error.message, "danger");
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-save me-1"></i>Salvar Ordem';
        }
      });
  };

  function getAdStatus(ad) {
    var now = new Date();
    var start = new Date(ad.start_time);
    var end = new Date(ad.end_time);
    if (now >= start && now <= end) {
      return { class: "status-active", text: "Ativa" };
    } else if (now < start) {
      return { class: "status-scheduled", text: "Agendada" };
    } else {
      return { class: "status-expired", text: "Expirada" };
    }
  }

  function getTransitionLabel(type) {
    var labels = {
      fade: "Fade",
      slide: "Slide",
      smoke: "Smoke",
      blink: "Blink",
    };
    return labels[type] || type;
  }

  function formatDateTime(dateString) {
    var date = new Date(dateString);
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  window.editAd = function (id) {
    getAdById(id).then(function (ad) {
      if (!ad) {
        showAlert("Propaganda não encontrada!", "danger");
        return;
      }
      document.getElementById("title").value = ad.title;
      document.getElementById("startTime").value = formatDateTimeForInput(
        ad.start_time,
      );
      document.getElementById("endTime").value = formatDateTimeForInput(
        ad.end_time,
      );
      document.getElementById("transitionType").value = ad.transition_type;
      document.getElementById("transitionDuration").value =
        ad.transition_duration;

      // Marcar os checkboxes correspondentes aos painéis salvos
      var panel = document.getElementById("panel");
      var checkboxes = panel.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(function (checkbox) {
        checkbox.checked =
          ad.screens && ad.screens.indexOf(checkbox.value) !== -1;
      });

      currentEditId = id;
      document.getElementById("editId").value = id;
      document.getElementById("submitText").textContent =
        "Atualizar Propaganda";
      document.getElementById("cancelEdit").style.display = "inline-block";
      document.querySelector(".card").scrollIntoView({ behavior: "smooth" });
    });
  };

  window.deleteAd = function (id) {
    if (!confirm("Tem certeza que deseja excluir esta propaganda?")) return;
    fetch("/api/ads/" + id, { method: "DELETE" })
      .then(function (response) {
        if (!response.ok) throw new Error("Erro ao excluir propaganda");
        showAlert("Propaganda excluída com sucesso!", "success");
        loadAds();
      })
      .catch(function (error) {
        showAlert("Erro ao excluir propaganda: " + error.message, "danger");
      });
  };

  function resetForm() {
    document.getElementById("adForm").reset();
    currentEditId = null;
    document.getElementById("editId").value = "";
    document.getElementById("submitText").textContent = "Salvar Propaganda";
    document.getElementById("cancelEdit").style.display = "none";

    // Resetar checkboxes para o padrão (Painel 1 marcado)
    var panel = document.getElementById("panel");
    var checkboxes = panel.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(function (checkbox) {
      checkbox.checked = checkbox.id === "presenter";
    });
  }

  function formatDateTimeForInput(dateString) {
    var date = new Date(dateString);
    return date.toISOString().slice(0, 16);
  }

  function showAlert(message, type) {
    var alertContainer = document.getElementById("alertContainer");
    var alertId = "alert-" + Date.now();
    var alertHtml =
      '<div id="' +
      alertId +
      '" class="alert alert-' +
      (type || "info") +
      ' alert-dismissible fade show" role="alert">' +
      message +
      '<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>';
    alertContainer.insertAdjacentHTML("beforeend", alertHtml);
    setTimeout(function () {
      var alertElement = document.getElementById(alertId);
      if (alertElement) {
        alertElement.parentNode.removeChild(alertElement);
      }
    }, 5000);
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindEvents();
    loadAds();
  });

  window.loadAds = loadAds;
})();
