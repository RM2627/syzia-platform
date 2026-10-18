export const pageTemplates = [
  ["current", "Atual", "Apresentação original da página SYZIA."],
  ["modern", "Moderno", "Capa e apresentação com destaque para a identidade visual."],
  ["minimal", "Minimalista", "Leitura objetiva, com foco nos serviços e nas informações."],
  ["catalog", "Catálogo", "Serviços organizados em uma lista de fácil comparação."],
] as const;
export function TemplatePicker({value,disabled,onSelect}:{value:string;disabled?:boolean;onSelect:(value:string)=>void|Promise<void>}){
 return <section className="card template-picker" aria-labelledby="template-title"><h2 id="template-title">Template da página pública</h2><p>O template altera a apresentação. Serviços, preços e regras de atendimento continuam os mesmos. A mudança será aplicada após a prévia e a publicação.</p><div role="group" aria-label="Templates">{pageTemplates.map(([id,name,description])=><button type="button" key={id} aria-pressed={value===id} disabled={disabled||value===id} onClick={()=>void onSelect(id)}><strong>{name}</strong><span>{description}</span></button>)}</div></section>;
}
