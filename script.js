// Main JavaScript file
document.addEventListener('DOMContentLoaded', function() {
    console.log('Document ready!');
});

const controls = document.getElementById('controls');
let hideTimeout;

// Função para mostrar os controles
function showControls() {
  controls.style.opacity = '1';
  controls.style.pointerEvents = 'auto';
  resetHideTimeout();
}

// Função para ocultar os controles
function hideControls() {
  controls.style.opacity = '0';
  controls.style.pointerEvents = 'none';
}

// Reinicia o timer para ocultar os controles
function resetHideTimeout() {
  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(hideControls, 3000); // 3 segundos
}

// Mostra controles ao clicar na tela
document.addEventListener('click', showControls);

// Oculta controles quando o mouse sai da tela
document.addEventListener('mouseleave', hideControls);

// Mostra controles e reinicia timer ao mover o mouse
document.addEventListener('mousemove', showControls);

// Inicialmente, inicia o timer para ocultar
resetHideTimeout();