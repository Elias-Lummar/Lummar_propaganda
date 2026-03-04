// JS compatível para navegadores antigos
window.onload = function () {

    // --- PREVENIR HIBERNAÇÃO DA TELA ---
    var isPreventingSleep = false;
    var sleepInterval = null;
    var lastX = -1;
    var lastY = -1;

    function preventSleep() {
        if (document.hidden || document.msHidden || document.webkitHidden || document.mozHidden) {
            return;
        }

        var maxX = window.innerWidth - 1;
        var maxY = window.innerHeight - 1;

        var randomX = Math.floor(Math.random() * maxX);
        var randomY = Math.floor(Math.random() * maxY);

        if (randomX === lastX && randomY === lastY) {
            randomX = (randomX + 1) % maxX;
            randomY = (randomY + 1) % maxY;
        }

        lastX = randomX;
        lastY = randomY;

        var mouseEvent = new MouseEvent('mousemove', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: randomX,
            clientY: randomY
        });

        document.dispatchEvent(mouseEvent);
    }

    function startSleepPrevention() {
        if (!isPreventingSleep) {
            sleepInterval = setInterval(preventSleep, 20000);
            isPreventingSleep = true;
        }
    }

    function stopSleepPrevention() {
        if (sleepInterval) {
            clearInterval(sleepInterval);
            sleepInterval = null;
            isPreventingSleep = false;
        }
    }

    startSleepPrevention();

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            stopSleepPrevention();
        } else {
            startSleepPrevention();
        }
    });

    // --- PLAYER ---
    var ads = [];
    var currentIndex = 0;
    var isPlaying = true;
    var currentMediaElement = null;
    var nextTimeout = null;
    var displayDuration = 10000;

    // Detecta painel
    var panel = 'presenter';
    var match = window.location.pathname.match(/presenter(\d*)/);
    if (match) {
        panel = match[0];
    }

    function loadActiveAds() {
        showLoading(true);

        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/api/ads/active?panel=' + encodeURIComponent(panel), true);

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                showLoading(false);

                if (xhr.status === 200) {
                    try {
                        ads = JSON.parse(xhr.responseText);

                        var now = new Date();

                        // 🔥 FILTRO COMPLETO (start_time + end_time)
                        ads = ads.filter(function (ad) {

                            if (!ad.file_path) return false;

                            // start_time
                            if (ad.start_time) {
                                var startTime = new Date(ad.start_time);

                                if (isNaN(startTime.getTime())) {
                                    console.warn(
                                        '[Filter] Ad "' + ad.title + '" (ID: ' + ad.id + ') com start_time inválido'
                                    );
                                    return false;
                                }

                                if (startTime > now) {
                                    console.log(
                                        '[Filter] ⏳ Ad "' + ad.title + '" (ID: ' + ad.id +
                                        ') ainda não iniciou. Início em ' + ad.start_time
                                    );
                                    return false;
                                }
                            }

                            // end_time
                            if (ad.end_time) {
                                var endTime = new Date(ad.end_time);

                                if (isNaN(endTime.getTime())) {
                                    console.warn(
                                        '[Filter] Ad "' + ad.title + '" (ID: ' + ad.id + ') com end_time inválido'
                                    );
                                    return false;
                                }

                                if (endTime < now) {
                                    console.log(
                                        '[Filter] ⏰ Ad "' + ad.title + '" (ID: ' + ad.id +
                                        ') expirado em ' + ad.end_time
                                    );
                                    return false;
                                }
                            }

                            return true;
                        });

                        if (ads.length === 0) {
                            showNoAdsMessage();
                        } else {
                            hideNoAdsMessage();
                            currentIndex = 0;
                            displayCurrentAd();
                        }

                    } catch (e) {
                        showError('Erro ao carregar propagandas: ' + e.message);
                    }
                } else {
                    showError('Erro ao carregar propagandas: ' + xhr.status);
                }
            }
        };

        xhr.send();
    }

    function displayCurrentAd() {
        if (ads.length === 0) {
            showNoAdsMessage();
            return;
        }

        var ad = ads[currentIndex];
        createMediaElement(ad);
        scheduleNextAd();
        updateProgress();
    }

    function createMediaElement(ad) {
        clearCurrentMedia();

        var container = document.getElementById('media-container');
        var isVideo = /\.(mp4)$/i.test(ad.file_path);
        var mediaElement;

        if (isVideo) {
            mediaElement = document.createElement('video');
            mediaElement.src = ad.file_path;
            mediaElement.autoplay = true;
            mediaElement.muted = true;
            mediaElement.loop = false;
            mediaElement.className = 'media-item';
            mediaElement.onended = nextAd;
            mediaElement.onerror = nextAd;
        } else {
            mediaElement = document.createElement('img');
            mediaElement.src = ad.file_path;
            mediaElement.className = 'media-item';
            mediaElement.onerror = nextAd;
        }

        container.appendChild(mediaElement);
        currentMediaElement = mediaElement;

        setTimeout(function () {
            mediaElement.className += ' active';
        }, 50);
    }

    function scheduleNextAd() {
        if (!isPlaying || ads.length === 0) return;

        var duration = displayDuration;

        if (currentMediaElement && currentMediaElement.tagName === 'VIDEO') {
            currentMediaElement.onloadedmetadata = function () {
                if (!isNaN(currentMediaElement.duration)) {
                    duration = Math.max(currentMediaElement.duration * 1000, 3000);
                }
                nextTimeout = setTimeout(nextAd, duration);
            };
        } else {
            nextTimeout = setTimeout(nextAd, duration);
        }
    }

    function nextAd() {
        currentIndex = (currentIndex + 1) % ads.length;
        displayCurrentAd();
    }

    function clearCurrentMedia() {
        var container = document.getElementById('media-container');
        while (container.firstChild) {
            if (container.firstChild.tagName === 'VIDEO') {
                container.firstChild.pause();
                container.firstChild.src = '';
            }
            container.removeChild(container.firstChild);
        }
        if (nextTimeout) clearTimeout(nextTimeout);
        currentMediaElement = null;
    }

    function updateProgress() {
        var progress = document.getElementById('progress');
        if (progress) {
            progress.style.width = ((currentIndex + 1) / ads.length) * 100 + '%';
        }
    }

    function showLoading(show) {
        var el = document.getElementById('loading-indicator');
        if (el) el.style.display = show ? 'block' : 'none';
    }

    function showNoAdsMessage() {
        var msg = document.getElementById('no-ads-message');
        var controls = document.getElementById('controls');
        if (msg) msg.style.display = 'flex';
        if (controls) controls.style.display = 'none';
        clearCurrentMedia();
    }

    function hideNoAdsMessage() {
        var msg = document.getElementById('no-ads-message');
        var controls = document.getElementById('controls');
        if (msg) msg.style.display = 'none';
        if (controls) controls.style.display = 'flex';
    }

    function showError(message) {
        var container = document.getElementById('media-container');
        container.innerHTML =
            '<div class="error-message"><h3>Erro</h3><p>' +
            message +
            '</p><button onclick="location.reload()">Recarregar</button></div>';
    }

    loadActiveAds();
    setInterval(loadActiveAds, 5 * 60 * 1000);
};
