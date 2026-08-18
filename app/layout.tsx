import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans=Geist({variable:"--font-geist-sans",subsets:["latin"]});
const geistMono=Geist_Mono({variable:"--font-geist-mono",subsets:["latin"]});

export const metadata:Metadata={
 title:"Term\u00f4metro | Mercado em leitura",
 description:"Term\u00f4metro t\u00e9cnico transparente para ativos, sem IA e sem caixa-preta.",
 icons:{icon:"./icon.svg"}
};

export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="pt-BR"><body className={`${geistSans.variable} ${geistMono.variable}`}>
  {children}
  <Script id="worker-counter" strategy="afterInteractive">{`
   (() => {
    var WORKER_URL = 'https://floral-truth-af64.bitcoiniciantes.workers.dev';
    var SITE_NAME = 'termometro';
    var el = document.querySelector('[data-goatcounter-total]');
    var today = new Date().toISOString().slice(0, 10);
    var lastVisit = localStorage.getItem('btc_last_visit_' + SITE_NAME);
    
    if (lastVisit === today) {
     fetch(WORKER_URL + '/total?site=' + SITE_NAME)
      .then(r => r.json())
      .then(data => {
       if (el && data.count !== undefined) el.textContent = ' · ' + data.count.toLocaleString('pt-BR') + (data.count === 1 ? ' acesso' : ' acessos');
      })
      .catch(() => {});
    } else {
     localStorage.setItem('btc_last_visit_' + SITE_NAME, today);
     fetch(WORKER_URL + '/count?site=' + SITE_NAME)
      .then(r => r.json())
      .then(data => {
       if (el && data.count !== undefined) el.textContent = ' · ' + data.count.toLocaleString('pt-BR') + (data.count === 1 ? ' acesso' : ' acessos');
      })
      .catch(() => {
       fetch(WORKER_URL + '/total?site=' + SITE_NAME)
        .then(r => r.json())
        .then(data => {
         if (el && data.count !== undefined) el.textContent = ' · ' + data.count.toLocaleString('pt-BR') + (data.count === 1 ? ' acesso' : ' acessos');
        })
        .catch(() => {});
      });
    }
   })();
  `}</Script>
  <script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "023b8944136f45f7852b6de1b1e2c662"}'></script>
 </body></html>;
}



