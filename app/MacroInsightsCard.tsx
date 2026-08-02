"use client";

import { useEffect, useMemo, useState } from "react";

type MacroData = { dominance:number; marketChange:number; marketCap:number; fear:number; fearLabel:string; updatedAt:string };
const money = new Intl.NumberFormat("pt-BR",{notation:"compact",maximumFractionDigits:2});

function sentimentTone(fear:number) {
  return fear <= 24 || fear >= 75 ? "risk" : fear <= 44 ? "warning" : "positive";
}

export default function MacroInsightsCard({asset,score,confidence,change}:{asset:string;score:number;confidence:number;change:number}) {
  const [data,setData] = useState<MacroData|null>(null);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    const controller=new AbortController();
    Promise.allSettled([
      fetch("https://api.coingecko.com/api/v3/global",{signal:controller.signal}).then(response=>response.json()),
      fetch("https://api.alternative.me/fng/?limit=1&format=json",{signal:controller.signal}).then(response=>response.json()),
    ]).then(results=>{
      if(controller.signal.aborted)return;
      const global=results[0].status==="fulfilled"?results[0].value?.data:null;
      const sentiment=results[1].status==="fulfilled"?results[1].value?.data?.[0]:null;
      if(!global&&!sentiment)return;
      setData({dominance:Number(global?.market_cap_percentage?.btc??0),marketChange:Number(global?.market_cap_change_percentage_24h_usd??0),marketCap:Number(global?.total_market_cap?.usd??0),fear:Number(sentiment?.value??50),fearLabel:String(sentiment?.value_classification??"Neutro"),updatedAt:new Date().toISOString()});
    }).catch(()=>{}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[]);
  const view=useMemo(()=>{
    const technical=score>=20?"viés técnico positivo":score<=-20?"pressão técnica negativa":"sinais técnicos divididos";
    const market=data?(data.marketChange>=0?"o mercado global avança":"o mercado global recua"):"o contexto global está sendo consultado";
    return {headline:asset+": "+technical+"; "+market+".",tone:sentimentTone(data?.fear??50),factors:[
      {title:"Termômetro técnico",value:(score>0?"+":"")+score+" · "+confidence+"%",detail:"Leitura calculada com preço, volume e tendência.",tone:score>=20?"positive":score<=-20?"risk":"warning"},
      {title:"Mercado cripto em 24h",value:data?(data.marketChange>=0?"+":"")+data.marketChange.toFixed(2)+"%":"Consultando",detail:data?"Capitalização global: US$ "+money.format(data.marketCap)+".":"Fonte pública de capitalização global.",tone:data&&data.marketChange<0?"risk":"positive"},
      {title:"Dominância do Bitcoin",value:data?.dominance?data.dominance.toFixed(1)+"%":"Consultando",detail:"Maior dominância costuma concentrar liquidez no BTC e reduzir o apetite por altcoins.",tone:data&&data.dominance>=55?"warning":"positive"},
      {title:"Sentimento do mercado",value:data?data.fear+"/100 · "+data.fearLabel:"Consultando",detail:"Indicador de humor amplo; não é sinal isolado de compra ou venda.",tone:sentimentTone(data?.fear??50)},
    ]};
  },[asset,confidence,data,score]);
  return <article className="card macroInsights" aria-busy={loading}>
    <div className="macroHead"><div><span>INSIGHTS DE MERCADO</span><b>Contexto macro de {asset}</b></div><small>{loading?"ATUALIZANDO":"DADOS PÚBLICOS"}</small></div>
    <div className={"macroTldr "+view.tone}><div><span>✦ TL;DR</span><small>{data?"Atualizado "+new Date(data.updatedAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}):"Conectando fontes"}</small></div><p>{view.headline}</p><em>Leitura educacional baseada em dados públicos e regras transparentes. Não é recomendação financeira.</em></div>
    <div className="macroFactors"><h3>↗ Principais fatores</h3>{view.factors.map(factor=><div className={"macroFactor "+factor.tone} key={factor.title}><span/><div><b>{factor.title}</b><strong>{factor.value}</strong><p>{factor.detail}</p></div></div>)}</div>
    <div className="macroFoot"><span>FONTES: CoinGecko · Alternative.me · Binance</span><span>Variação do ativo: {change>=0?"+":""}{change.toFixed(2)}%</span></div>
  </article>;
}
