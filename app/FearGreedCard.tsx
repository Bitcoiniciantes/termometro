"use client";

export default function FearGreedCard() {
  return <article className="card fearGreedCard" id="fng-root" aria-label="Fear & Greed Index">
    <div className="fngHeader">
      <div className="fngLogo" aria-hidden="true">₿</div>
      <div><b>FEAR &amp; GREED INDEX</b><span>Sentimento do mercado cripto</span></div>
    </div>
    <div className="fngDivider" />
    <div className="fngNow"><span>AGORA:</span><strong id="fng-now-sent">—</strong></div>
    <div className="fngGaugeWrap">
      <svg className="fngSvg" viewBox="0 0 280 165" width="100%" height="auto" role="img" aria-label="Medidor de medo e ganância">
        <defs>
          <linearGradient id="fng-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#C62828" />
            <stop offset="25%" stopColor="#E65100" />
            <stop offset="50%" stopColor="#F9A825" />
            <stop offset="75%" stopColor="#7CB342" />
            <stop offset="100%" stopColor="#2E7D32" />
          </linearGradient>
        </defs>
        <path d="M 30 140 A 110 110 0 0 1 250 140" fill="none" stroke="url(#fng-gradient)" strokeWidth="15" strokeLinecap="round" />
        <g className="fngScale" aria-hidden="true">
          <circle cx="48" cy="110" r="2" /><circle cx="65" cy="79" r="2" /><circle cx="94" cy="54" r="2" />
          <circle cx="140" cy="30" r="2" /><circle cx="186" cy="54" r="2" /><circle cx="215" cy="79" r="2" /><circle cx="232" cy="110" r="2" />
        </g>
        <path id="fng-needle-shadow" d="" fill="rgba(198,40,40,0.28)" />
        <line id="fng-needle" x1="140" y1="140" stroke="#d8e0dc" strokeWidth="2" strokeLinecap="round" />
        <circle id="fng-needle-tip" r="7" fill="#fff" stroke="#b8c3bd" strokeWidth="1.5" />
        <circle id="fng-needle-dot" r="3" fill="#C62828" />
        <text id="fng-arc-score" x="140" y="100" textAnchor="middle" fontSize="40" fontWeight="800" fill="#C62828">—</text>
        <text id="fng-arc-label" x="140" y="122" textAnchor="middle" fontSize="14" fontWeight="600" fill="#C62828">—</text>
      </svg>
    </div>
    <div className="fngHistory" aria-label="Histórico compacto">
      <div className="fngHistoryItem"><span>AGORA</span><b className="fngBadge" id="fng-h-now-badge">—</b><em id="fng-h-now-sent">—</em></div>
      <div className="fngHistoryItem"><span>ONTEM</span><b className="fngBadge" id="fng-h-prev-badge">—</b><em id="fng-h-prev-sent">—</em></div>
      <div className="fngHistoryItem"><span>SEM. PASSADA</span><b className="fngBadge" id="fng-h-week-badge">—</b><em id="fng-h-week-sent">—</em></div>
      <div className="fngHistoryItem"><span>MÊS PASSADO</span><b className="fngBadge" id="fng-h-month-badge">—</b><em id="fng-h-month-sent">—</em></div>
    </div>
    <div className="fngTips" aria-label="Dicas de leitura do índice">
      <div className="fngTip"><i className="fngTipBullet fngTipFear" aria-hidden="true" /><p><strong>Medo extremo:</strong><span>Comprar e realizar DCA continuamente</span></p></div>
      <div className="fngTip"><i className="fngTipBullet fngTipGreed" aria-hidden="true" /><p><strong>Extrema ganância:</strong><span>Realizar o lucro e fazer caixa</span></p></div>
    </div>
    <div className="fngFooter"><span className="fng-dot" id="fng-dot" /><span id="fng-updated">alternative.me · Atualizado: 08 de nov. de 2026</span></div>
  </article>;
}
