from pathlib import Path
def edit(p,fn):
 f=Path(p);f.write_text(fn(f.read_text()))
def home(s):
 a=s.index('function Daily(');b=s.index('function Agenda(',a)
 return s[:a]+'''function HomeBlock({s,children}:{s:ReturnType<typeof useData>;children:React.ReactNode}){return s.data ? <>{children}</> : <Loading s={s}/>;}
function Daily({ org }: { org: string }) {
 const {can,data:permissionData}=usePermissions();
 const edit=(action:string)=>can(action)&&!["own_attendant","shared_attendant"].includes(permissionData?.role||"");
 const header=useData("operations_home_section",{p_org:org,p_section:"header"}),agenda=useData("operations_home_section",{p_org:org,p_section:"agenda"}),attention=useData("operations_home_section",{p_org:org,p_section:"attention"}),updates=useData("operations_home_section",{p_org:org,p_section:"updates"});
 const base="/painel/"+org,d=agenda.data,appointments:Data[]=d?.appointments||[],aToday=appointments.filter(a=>occurs(a,d.today)&&a.state!=="cancelled"),tomorrow=appointments.filter(a=>dayOf(a.starts_at)===add(d.today,1)&&a.state!=="cancelled");
 return <><header className="op-head"><div><span className="eyebrow">{header.data?.company||"Sua empresa"}</span><h1>O que fazer hoje?</h1><HomeBlock s={header}><p>{header.data&&date(header.data.today+"T12:00Z",{dateStyle:"full"})}</p></HomeBlock></div></header>
 <div className="op-quick">{edit("agenda.manage")&&<Link className="primary" to={base+"/novo-agendamento"}>+ Novo agendamento</Link>}{edit("clients.manage")&&<Link className="button" to={base+"/clientes?novo=1"}>+ Novo cliente</Link>}{edit("quotes.manage")&&can("quotes.values")&&<Link className="button" to={base+"/novo-orcamento"}>+ Novo orçamento</Link>}</div>
 <div className="op-grid"><div><section className="card" aria-label="Agenda de hoje"><h2>Agenda de hoje</h2><HomeBlock s={agenda}>
 {d?.available===false?<p>Agenda não disponível para este acesso.</p>:<>
 <p>{aToday.filter(a=>a.kind==="booking").length} agendamentos · {aToday.filter(a=>a.execution_state==="in_progress").length} em execução</p>
 {d?.next&&<section className="op-next"><span>PRÓXIMO ATENDIMENTO</span><h3>{date(d.next.starts_at)} · {d.next.customer}</h3><p>{d.next.service}</p><Link to={base+"/agenda?ficha="+d.next.id}>Abrir ficha do serviço →</Link></section>}
 <div className="op-day-list">{aToday.map(a=><Appointment key={a.id} a={a} base={base}/>)}{!aToday.length&&<p className="op-empty">Nenhum atendimento agendado para hoje.</p>}</div><Link to={base+"/agenda"}>Abrir Agenda completa →</Link>
 <h2>Amanhã</h2>{tomorrow.map(a=><Appointment key={a.id} a={a} base={base}/>)}{!tomorrow.length&&<p className="op-empty">Nenhum compromisso para amanhã.</p>}</>}
 </HomeBlock></section></div><div><section className="card" aria-label="Precisa da sua atenção"><h2>Precisa da sua atenção</h2><HomeBlock s={attention}>{attention.data?.items.map((x:Data)=><Link key={x.id} className="op-attention" to={x.href}><strong>{x.customer} · {x.reason}</strong><p>{x.detail}</p><span>{x.action} →</span></Link>)}{attention.data?.items.length===0&&<p className="op-empty">Nenhuma tarefa aguardando sua ação neste momento.</p>}</HomeBlock></section>
 <section className="card op-notifications" aria-label="Últimas atualizações"><h2>Últimas atualizações</h2><HomeBlock s={updates}>{updates.data?.notifications.map((n:Data)=><Link className="op-attention" to={n.href} key={n.id}><strong>{n.title}{!n.read?" •":""}</strong><p>{date(n.created_at)}</p></Link>)}{updates.data?.notifications.length===0&&<p>Novos horários e decisões aparecerão aqui.</p>}</HomeBlock></section></div></div></>;
}
'''+s[b:]
edit('src/operations/Operations.tsx',home)
edit('src/operations/Operations.tsx',lambda s:'import { duration, Periods } from "../scheduling/ExecutionSchedule";\n'+s.replace('setError(errorMessage(e));','setError(name === "operations_home_section" ? homeError(e) : errorMessage(e));',1).replace('function useData(name:', '''function homeError(e:any){
 if(e?.code==="42501"||/denied|permission/.test(e?.message||"")) return "Seu acesso a este bloco não está autorizado. Revise as permissões desta empresa.";
 if(e instanceof TypeError||/fetch|network|offline/i.test(e?.message||""))return "Não foi possível conectar. Confira a conexão e tente novamente.";
 return "Este bloco não pôde ser carregado. Tente novamente; se persistir, informe o responsável pela plataforma.";
}
function useData(name:''').replace('Até {date(a.ends_at,', 'Até {date(a.service_minutes ? new Date(Date.parse(a.starts_at)+a.service_minutes*60000).toISOString() : a.ends_at,').replace('        </small>\n      </div>\n      <span className={"op-status', '''          {a.service_minutes ? ` · ${duration(a.service_minutes)}` : ""}
          {a.execution_group ? ` · Parte ${a.part_number} do atendimento` : ""}
        </small>
      </div>
      <span className={"op-status''',1))
def journey(s):
 a=s.index('export function JourneySchedule(');b=s.index('export function ServiceHelp(',a)
 return 'import { ExecutionSchedule, type Period } from "../scheduling/ExecutionSchedule";\n'+s[:a]+'''export function JourneySchedule({company,items,value,onChange,captcha,disabled=false,periods=[]}:{company:Company;items:RequestItem[];value:string;onChange:(v:string,p:Period[])=>void;captcha:string;disabled?:boolean;periods?:Period[]}){
 return <ExecutionSchedule key={JSON.stringify(items)} value={value} onChange={onChange} periods={periods} disabled={disabled} label="Dia desejado" load={async(day,next)=>{await ensureConsumer(captcha);return crpc("consumer_journey_options",{p_slug:company.slug,p_revision:company.revision,p_items:items,p_day:day,p_next:next})}}/>;
}
'''+s[b:]
edit('src/consumer/Journey.tsx',journey)
def consumer(s):
 s='import { ExecutionSchedule, Periods, type Period } from "../scheduling/ExecutionSchedule";\n'+s
 s=s.replace('[desired, setDesired] = useState(""),','[desired, setDesired] = useState(""),\n    [desiredPeriods,setDesiredPeriods] = useState<Period[]>([]),')
 s=s.replace('setDesired(d.desired_start || "");','setDesired(d.desired_start || "");setDesiredPeriods(d.desired_periods||[]);')
 s=s.replace('crpc("consumer_complete_journey", {','crpc("consumer_complete_execution", {\n        p_periods: desiredPeriods,')
 s=s.replace('onChange={setDesired}','periods={desiredPeriods} onChange={(v,p)=>{setDesired(v);setDesiredPeriods(p);}}')
 s=s.replace('[selected, setSelected] = useState(""),','[selected, setSelected] = useState(""),\n    [selectedPeriods,setSelectedPeriods] = useState<Period[]>([]),')
 s=s.replace('<h2>Seu horário</h2>','<h2>Seu atendimento</h2>')
 s=s.replace('<strong>{date(appointment.starts_at)}</strong>', '''<strong>{date(appointment.starts_at)}</strong>
                        {data.appointments.filter((a:any)=>a.state==="confirmed").length>1&&<Periods periods={data.appointments.filter((a:any)=>a.state==="confirmed").sort((a:any,b:any)=>a.part_number-b.part_number).map((a:any)=>({start:a.starts_at,end:a.work_end||a.ends_at,minutes:a.service_minutes,reserved_until:a.ends_at}))}/>}''')
 s=s.replace('Cancelar este horário','Cancelar atendimento completo')
 s=s.replace('Consulte os horários disponíveis para este pedido.\n                      Serviços sob avaliação precisam de proposta aprovada.', '{data.accepted_version ? "Proposta aprovada. Escolha seu horário." : data.booking?.ready ? "Escolha seu horário para confirmar o atendimento." : "Consulte o andamento da avaliação abaixo."}')
 a=s.index('                      <label>\n                        {appointment\n');b=s.index('                      {selected && (',a)
 s=s[:a]+'''                      <ExecutionSchedule key={code+":"+(appointment?.code||"")} value={selected} periods={selectedPeriods} onChange={(v,p)=>{setSelected(v);setSelectedPeriods(p);}} disabled={busy} minutes={final?.duration_minutes} label={appointment ? "Replanejar atendimento completo" : "Escolha um dia"} load={(day,next)=>crpc("consumer_execution_options",{p_code:code,p_day:day,p_next:next})}/>
'''+s[b:]
 s=s.replace('crpc("consumer_book", {','crpc("consumer_book_execution", {\n                                p_periods: selectedPeriods,')
 s=s.replace('? "Confirmar remarcação"','? "Confirmar replanejamento completo"')
 return s
edit('src/consumer/Consumer.tsx',consumer)
def calc(s):
 s='import {duration} from "../scheduling/ExecutionSchedule";\n'+s
 marker='  async function validate() {'
 i=s.index(marker)
 s=s[:i]+'''  const totalMinutes=items.reduce((n,i)=>n+i.quantity*i.duration_minutes,0);
  const explanationRequired=items.length!==(original?.items.length||0)||new Set(items.map(i=>i.position)).size!==items.length||globalDiscount>0||items.some(i=>{const o=original?.items[i.position??-1];return i.kind!=="original"||!o||i.unit_cents!==o.unit_cents||i.quantity!==o.quantity||i.duration_minutes!==(o.duration_minutes??0)||i.discount_cents>0||Boolean(i.note.trim());});
  const blockedReason=!pricesReady ? "Preencha os valores e quantidades de todos os itens." : total<0 ? "O total não pode ser negativo." : explanationRequired&&explanation.trim().length<2 ? "Explique as alterações na proposta antes de enviar." : !expires ? "Informe a validade da proposta." : "";
'''+s[i:]
 s=s.replace('if (!explanation.trim()) throw Error("quote_explanation_required");','if (explanationRequired && explanation.trim().length<2) throw Error("quote_explanation_required");')
 s=s.replace('{items.reduce((n, i) => n + i.quantity * i.duration_minutes, 0)} min','{duration(totalMinutes)}')
 s=s.replace('          Explicação da proposta para o cliente\n','          Explicação da proposta para o cliente {explanationRequired ? "*" : "(opcional)"}\n')
 s=s.replace('            maxLength={2000}\n            value={explanation}', '            maxLength={2000}\n            required={explanationRequired} aria-describedby="quote-explanation-help" aria-invalid={explanationRequired && explanation.trim().length<2}\n            value={explanation}')
 s=s.replace('        <label>\n          Válida até','''        <p id="quote-explanation-help" role={explanationRequired&&!explanation.trim()?"status":undefined}>{explanationRequired ? "Uma alteração de valores, itens, duração, desconto ou condição exige uma explicação para o cliente." : "Sem alterações relevantes: você pode enviar sem explicação adicional."}</p>
        {totalMinutes>(catalog?.max_daily_minutes||1440)&&<p className="notice">A duração excede o maior expediente diário. A divisão só estará disponível se todos os serviços permitirem vários períodos; confira a prévia antes de enviar.</p>}
        <label>
          Válida até''')
 a=s.index('            disabled={\n              !items.length ||');b=s.index('            onClick={() => void send()}',a);s=s[:a]+'            disabled={Boolean(blockedReason)} aria-describedby="quote-send-reason"\n'+s[b:]
 s=s.replace('        <div className="quote-actions">','        <p id="quote-send-reason" role="status">{blockedReason}</p>\n        <div className="quote-actions">')
 s=s.replace('<QuoteSummary quote={preview} />','<QuoteSummary quote={preview} /><p>{preview.execution?.mode === "split" ? "Execução permite múltiplos períodos, conforme disponibilidade." : "Execução contínua: precisa de uma única janela compatível."}</p>')
 return s
edit('src/operations/QuoteCalculator.tsx',calc)
