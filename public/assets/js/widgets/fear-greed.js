/* =====================================================================
   Widget: Fear & Greed Index (alternative.me)
   ===================================================================== */
window.BIWidgets = window.BIWidgets || {};
window.BIWidgets.fearGreed = function initFearGreed() {
  'use strict';
  var CFG = window.BI_CONFIG;

  function getLabel(v) {
    if (v <= 20) return 'Medo Extremo';
    if (v <= 40) return 'Medo';
    if (v <= 60) return 'Neutro';
    if (v <= 80) return 'Ganância';
    return 'Ganância Extrema';
  }
  function getColor(v) {
    if (v <= 20) return '#C62828';
    if (v <= 40) return '#E65100';
    if (v <= 60) return '#F9A825';
    if (v <= 80) return '#7CB342';
    return '#2E7D32';
  }
  function rotateNeedle(v) {
    // Gauge semicircular: valor 0 = esquerda (180°), valor 100 = direita (0°)
    var angleDeg = 180 - (v / 100) * 180;
    var angleRad = angleDeg * Math.PI / 180;
    var startAngleRad = Math.PI; // 180° = posição do valor 0 (extremo esquerdo)
    var cx = 140, cy = 140;
    var tipR = 110; // raio da bolinha (encostando no arco)

    // Posição da bolinha (ponteiro atual)
    var tipX = cx + tipR * Math.cos(angleRad);
    var tipY = cy - tipR * Math.sin(angleRad);

    // Linha da agulha
    var needle = document.getElementById('fng-needle');
    if (needle) {
      needle.setAttribute('x1', cx);
      needle.setAttribute('y1', cy);
      needle.setAttribute('x2', tipX);
      needle.setAttribute('y2', tipY);
    }

    // Bolinha na ponta
    var tip = document.getElementById('fng-needle-tip');
    if (tip) { tip.setAttribute('cx', tipX); tip.setAttribute('cy', tipY); }
    var dot = document.getElementById('fng-needle-dot');
    if (dot) { dot.setAttribute('cx', tipX); dot.setAttribute('cy', tipY); dot.setAttribute('fill', getColor(v)); }

    // Sombra: SETOR (fatia de pizza) do valor 0 até o valor atual
    // Pontos: centro → posição do 0 → arco até a posição atual → volta ao centro
    var sR = tipR * 0.95;
    var startX = cx + sR * Math.cos(startAngleRad);
    var startY = cy - sR * Math.sin(startAngleRad);
    var endX = cx + sR * Math.cos(angleRad);
    var endY = cy - sR * Math.sin(angleRad);

    // Path: M centro L pos_zero A arco endX endY L centro Z
    // Arc flag: largeArc=0 (sempre menor que 180°), sweep=0 (sentido anti-horário no SVG)
    var pathD = 'M ' + cx + ' ' + cy +
                ' L ' + startX + ' ' + startY +
                ' A ' + sR + ' ' + sR + ' 0 0 1 ' + endX + ' ' + endY +
                ' Z';

    var shadow = document.getElementById('fng-needle-shadow');
    if (shadow) {
      shadow.setAttribute('d', pathD);
      shadow.setAttribute('fill', 'rgba(' + hexToRgb(getColor(v)) + ',0.28)');
    }
  }

  function hexToRgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return r + ',' + g + ',' + b;
  }
  function setBadge(badgeId, sentId, val) {
    if (val === null) return;
    var lbl = getLabel(val), col = getColor(val);
    var b = document.getElementById(badgeId);
    var s = document.getElementById(sentId);
    if (b) { b.textContent = val; b.style.background = col; }
    if (s) { s.textContent = lbl; s.style.color = col; }
  }

  function load() {
    BI.fetchJSON(CFG.api.fearGreed, { timeout: 8000, retries: 1 })
      .then(function (d) {
        var data = d.data;
        var now = parseInt(data[0].value, 10);
        var prev = data[1] ? parseInt(data[1].value, 10) : null;
        var week = data[7] ? parseInt(data[7].value, 10) : null;
        var month = data[30] ? parseInt(data[30].value, 10) : null;
        var col = getColor(now);

        var nowSent = document.getElementById('fng-now-sent');
        if (nowSent) { nowSent.textContent = getLabel(now); nowSent.style.color = col; }

        rotateNeedle(now);

        var arcScore = document.getElementById('fng-arc-score');
        if (arcScore) { arcScore.textContent = now; arcScore.setAttribute('fill', col); }

        var arcLabel = document.getElementById('fng-arc-label');
        if (arcLabel) { arcLabel.textContent = getLabel(now); arcLabel.setAttribute('fill', col); }

        var dot = document.getElementById('fng-dot');
        if (dot) dot.className = 'fng-dot live';

        var upd = document.getElementById('fng-updated');
        if (upd) {
          var ts = new Date(parseInt(data[0].timestamp, 10) * 1000);
          upd.textContent = 'alternative.me · Atualizado: ' +
            ts.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
        }

        setBadge('fng-h-now-badge', 'fng-h-now-sent', now);
        setBadge('fng-h-prev-badge', 'fng-h-prev-sent', prev);
        setBadge('fng-h-week-badge', 'fng-h-week-sent', week);
        setBadge('fng-h-month-badge', 'fng-h-month-sent', month);
      })
      .catch(function () {
        var el = document.getElementById('fng-now-sent');
        if (el) el.textContent = 'Erro ao carregar';
      });
  }

  load();
  setInterval(load, 60000);
};
