import { Termometro } from "../page";

export const metadata = {
  title: "Radar Compra × Venda | Termômetro",
  description: "Widget compacto do radar técnico do Termômetro.",
};

export default function WidgetPage(){
  return <div className="widgetEmbed"><Termometro/></div>;
}