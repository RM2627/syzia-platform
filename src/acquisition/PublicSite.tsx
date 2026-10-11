import { memberLimitLabel } from "../billing/plan-copy";
import { supportBenefit, supportDescription, supportPlanDescription } from "../availability/support-copy";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { rpc } from "../api";
import { Brand } from "../brand/Brand";
import { accessApi, accessMessage } from "../access/EnterpriseAccess";
import "./acquisition.css";
export const brl = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    c / 100,
  );
export function usePlans() {
  const [plans, setPlans] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    rpc<any[]>("acquisition_plans")
      .then(setPlans)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);
  return { plans, loading, failed };
}
export function SiteFrame({
  children,
  title = "SYZIA — Onde tudo se alinha.",
  description = "Presença digital, atendimento, orçamento, agenda e gestão conectados para prestadores de serviços e pequenos negócios.",
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  const location = useLocation();
  useEffect(() => {
    document.title = title;
    for (const [key, value] of [
      ["description", description],
      ["og:title", title],
      ["og:description", description],
      ["og:type", "website"],
    ]) {
      const attr = key.startsWith("og:") ? "property" : "name";
      let el = document.head.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    }
    const base = import.meta.env.VITE_PUBLIC_SITE_URL;
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (base) {
      try {
        const u = new URL(base);
        if (u.protocol === "https:") {
          if (!canonical) {
            canonical = document.createElement("link");
            canonical.setAttribute("rel", "canonical");
            document.head.appendChild(canonical);
          }
          canonical.setAttribute(
            "href",
            new URL(location.pathname, u.origin).href,
          );
        }
      } catch {}
    } else canonical?.remove();
  }, [title, description, location.pathname]);
  return (
    <div className="sy-site">
      <a href="#site-main" className="sy-skip">
        Ir para o conteúdo
      </a>
      <header className="sy-header">
        <Link to="/" aria-label="SYZIA — início">
          <Brand />
        </Link>
        <nav aria-label="Site SYZIA">
          <a href="/#recursos">Recursos</a>
          <Link to="/planos">Planos</Link>
          <Link to="/contato">Contato</Link>
          <Link to="/entrar">Entrar</Link>
          <Link className="sy-button sy-primary" to="/cadastrar">
            Começar
          </Link>
        </nav>
      </header>
      <main id="site-main">{children}</main>
      <footer className="sy-footer">
        <Brand />
        <p>Onde tudo se alinha.</p>
        <nav aria-label="Informações">
          <Link to="/planos">Planos</Link>
          <Link to="/contato">Falar com a SYZIA</Link>
          <Link to="/termos">Termos de Uso</Link>
          <Link to="/privacidade">Privacidade</Link>
          <Link to="/app">Meu ambiente</Link>
        </nav>
        <small>SYZIA · UseSyzia</small>
      </footer>
    </div>
  );
}
const journey = [
  [
    "01",
    "Seu cliente encontra",
    "Uma página com sua identidade, serviços e portfólio.",
  ],
  ["02", "A conversa continua", "Solicitações e atendimento com contexto."],
  [
    "03",
    "O trabalho acontece",
    "Orçamento, agenda e acompanhamento conectados.",
  ],
  [
    "04",
    "Você enxerga a operação",
    "Pendências, retornos e gestão para decidir o próximo passo.",
  ],
];
const features = [
  [
    "Atendimento e clientes",
    "Central de Atendimento e histórico para continuar de onde a conversa parou.",
  ],
  [
    "Orçamentos e agenda",
    "Da proposta à aprovação e ao horário marcado, com regras da sua empresa.",
  ],
  [
    "Pendências e follow-up",
    "Organize tarefas e retornos quando uma decisão ainda está em aberto.",
  ],
  [
    "Financeiro e métricas",
    "A receber, recebimentos, despesas pagas e previstas com indicadores da operação.",
  ],
  [
    "Página pública e portfólio",
    "Apresente seus serviços, sua identidade e o trabalho que você realiza.",
  ],
  [
    "Equipe e permissões",
    "Trabalhe sozinho ou com equipe. Apoio compartilhado conforme disponibilidade, plano e autorizações.",
  ],
];
export function PublicSite() {
  const offer = usePlans();
  return (
    <SiteFrame>
      <section className="sy-hero">
        <div>
          <p className="sy-kicker">
            PARA PEQUENOS NEGÓCIOS E PRESTADORES DE SERVIÇOS
          </p>
          <p className="sy-brand-line">SYZIA — Onde tudo se alinha.</p>
          <h1>
            Sua empresa pode crescer.
            <br />
            <span>Sua operação precisa acompanhar.</span>
          </h1>
          <p className="sy-lead">
            O cliente chama por um lugar. O orçamento fica em outro. A agenda
            está separada. E os retornos dependem de você lembrar. A SYZIA
            conecta esses caminhos em uma única operação.
          </p>
          <div className="sy-actions">
            <Link className="sy-button sy-primary" to="/cadastrar">
              Criar minha empresa <span aria-hidden="true">↗</span>
            </Link>
            <a className="sy-button" href="#como-funciona">
              Conhecer a experiência
            </a>
          </div>
          <p className="sy-subtle">
            Da presença digital à gestão do dia a dia.
          </p>
        </div>
        <div className="sy-journey" aria-label="Jornada conectada">
          {journey.map(([n, t, d]) => (
            <article key={n}>
              <span>{n}</span>
              <div>
                <h2>{t}</h2>
                <p>{d}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="sy-section sy-surface sy-problem">
        <p className="sy-kicker">MENOS COISAS SOLTAS NO SEU DIA</p>
        <h2>Seu negócio não deveria depender da sua memória.</h2>
        <p className="sy-lead">
          Um orçamento sem retorno. Um horário combinado na conversa. Um
          pagamento pendente. Informações espalhadas tornam mais difícil saber o
          próximo passo.
        </p>
        <div className="sy-value-grid">
          <article>
            <h3>Menos ferramentas soltas</h3>
            <p>
              Cliente, atendimento, orçamento e agenda participam da mesma
              jornada.
            </p>
          </article>
          <article>
            <h3>Menos coisas para lembrar</h3>
            <p>
              Pendências e retornos ajudam a mostrar quem atender e o que
              precisa ser feito.
            </p>
          </article>
          <article>
            <h3>Mais controle</h3>
            <p>
              Regras, autonomia e permissões acompanham a forma de trabalhar da
              sua empresa.
            </p>
          </article>
        </div>
      </section>
      <section id="como-funciona" className="sy-section">
        <p className="sy-kicker">UMA EXPERIÊNCIA CONTÍNUA</p>
        <h2>Um dia de trabalho dentro da SYZIA.</h2>
        <p className="sy-lead">
          Exemplo ilustrativo: cada etapa deixa contexto para a próxima. Você e
          sua equipe conduzem o atendimento e registram o que acontece.
        </p>
        <ol className="sy-workday">
          {[
            [
              "08:30",
              "A solicitação chega",
              "O cliente conhece um serviço na página pública e envia seu pedido.",
            ],
            [
              "08:35",
              "A conversa tem contexto",
              "A empresa responde na Central, com a solicitação e o cliente à vista.",
            ],
            [
              "08:50",
              "O orçamento ganha forma",
              "Serviços e condições são organizados em uma proposta para o cliente.",
            ],
            [
              "09:10",
              "O próximo passo é combinado",
              "Após a aprovação, a empresa organiza o agendamento. Aprovar não é pagar.",
            ],
            [
              "14:00",
              "Um retorno pede atenção",
              "Uma decisão ainda está em aberto. A pendência ajuda a retomar a conversa.",
            ],
            [
              "17:30",
              "A gestão acompanha",
              "Um recebimento é registrado quando confirmado. A visão do dia reúne o andamento da operação.",
            ],
          ].map(([time, title, text]) => (
            <li key={time}>
              <time>{time}</time>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section id="recursos" className="sy-section sy-surface">
        <p className="sy-kicker">RECURSOS QUE SE CONECTAM</p>
        <h2>
          O que sua empresa precisa,
          <br />
          ao longo da jornada.
        </h2>
        <div className="sy-feature-grid">
          {features.map(([t, d], i) => (
            <article key={t}>
              <span className="sy-number">0{i + 1}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="sy-section">
        <p className="sy-kicker">DO SEU TAMANHO, NA SUA ROTINA</p>
        <h2>Comece do seu jeito.</h2>
        <div className="sy-value-grid sy-team-grid">
          <article>
            <span className="sy-number">01 · TRABALHO SOZINHO</span>
            <h3>Você conduz a operação.</h3>
            <p>
              Como administrador, acompanhe solicitações, converse com clientes,
              prepare orçamentos e organize a agenda sem precisar cadastrar uma
              equipe.
            </p>
          </article>
          <article>
            <span className="sy-number">02 · TENHO UMA EQUIPE</span>
            <h3>Responsabilidades claras.</h3>
            <p>
              Distribua tarefas e defina o que cada colaborador ou atendente
              pode consultar e fazer.
            </p>
          </article>
          <article>
            <span className="sy-number">03 · PRECISO DE APOIO</span>
            <h3>Atendimento com permissão.</h3>
            <p>
              Quando disponível no plano e nas condições contratadas, o
              atendimento compartilhado pode apoiar sua empresa dentro das
              autorizações definidas.
            </p>
          </article>
        </div>
      </section>
      <section className="sy-section sy-surface sy-public-page">
        <div>
          <p className="sy-kicker">
            PRESENÇA DIGITAL QUE CONTINUA EM ATENDIMENTO
          </p>
          <h2>Sua empresa também ganha um lugar para ser encontrada.</h2>
          <p className="sy-lead">
            Uma página com sua identidade, serviços, preços ou modalidades de
            orçamento, horários e portfólio. O cliente conhece seu trabalho e
            pode iniciar uma solicitação.
          </p>
          <p>
            A partir daí, a experiência continua no atendimento e no
            acompanhamento do pedido.
          </p>
          <Link className="sy-button" to="/cadastrar">
            Criar a presença da minha empresa
          </Link>
        </div>
        <figure>
          <img
            src="/marketing/pagina-demonstracao.webp"
            alt="Exemplo de página do Estúdio Horizonte na SYZIA, com identidade, apresentação e serviços."
            width="960"
            height="900"
            loading="lazy"
            decoding="async"
          />
        </figure>
      </section>
      <section className="sy-section sy-finance-story">
        <div>
          <p className="sy-kicker">FINANCEIRO COM CONTEXTO</p>
          <h2>Não basta saber que trabalhou. Saiba o que aconteceu.</h2>
          <p className="sy-lead">
            Acompanhe o que está a receber, os recebimentos registrados e as
            despesas pagas ou previstas. Os indicadores ajudam a enxergar a
            operação com acesso conforme as permissões.
          </p>
        </div>
        <div className="sy-finance-grid">
          <article>
            <h3>A receber</h3>
            <p>Valores ainda pendentes, separados do que já foi recebido.</p>
          </article>
          <article>
            <h3>Recebimentos</h3>
            <p>
              Registros confirmados pela empresa. A aprovação do orçamento é
              outra etapa.
            </p>
          </article>
          <article>
            <h3>Despesas</h3>
            <p>
              Pagas e previstas, incluindo os compromissos recorrentes
              cadastrados.
            </p>
          </article>
          <article>
            <h3>Visão da operação</h3>
            <p>
              Indicadores para acompanhar o trabalho. Previsões não representam
              lucro realizado.
            </p>
          </article>
        </div>
      </section>
      <section className="sy-section">
        <p className="sy-kicker">VÁRIOS SEGMENTOS. SUA FORMA DE TRABALHAR.</p>
        <h2>A identidade é da sua empresa.</h2>
        <p className="sy-lead">
          Para profissionais independentes, manutenção e assistência, limpeza e
          conservação, beleza e bem-estar, consultoria, serviços criativos e
          outros pequenos negócios.
        </p>
        <div className="sy-segments">
          {[
            "Serviços para o lar",
            "Beleza e bem-estar",
            "Manutenção",
            "Consultoria",
            "Serviços criativos",
            "Cuidados automotivos",
          ].map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </section>
      <section className="sy-section sy-surface">
        <p className="sy-kicker">PLANOS</p>
        <h2>Escolha como começar.</h2>
        <PlanList offer={offer} />
      </section>
      <section className="sy-section sy-control-faq">
        <div>
          <p className="sy-kicker">ACESSO COM RESPONSABILIDADE</p>
          <h2>Sua empresa continua no controle.</h2>
          <p className="sy-lead">
            O administrador define os acessos e as permissões. As informações
            das empresas permanecem separadas, e ações sensíveis seguem regras e
            deixam histórico para consulta.
          </p>
        </div>
        <FAQ offer={offer} />
      </section>
      <section className="sy-final">
        <h2>SYZIA</h2>
        <p>Onde tudo se alinha.</p>
        <Link className="sy-button sy-primary" to="/cadastrar">
          Criar minha empresa
        </Link>
        <Link to="/contato">Falar com a SYZIA</Link>
      </section>
    </SiteFrame>
  );
}
function FAQ({ offer }: { offer: ReturnType<typeof usePlans> }) {
  const trial = offer.plans.filter(
    (p) => p.trial_eligible && p.version.trial_days > 0,
  );
  return (
    <div className="sy-faq">
      <h3>Dúvidas frequentes</h3>
      {[
        [
          "Preciso ter funcionários para usar?",
          "Não. O administrador pode conduzir a operação sozinho e incluir outras pessoas quando precisar.",
        ],
        [
          "Posso usar minha identidade visual?",
          "Sim. A página empresarial permite configurar logo, capa, cor e tema, além de apresentar serviços e portfólio.",
        ],
        [
          "Meus funcionários veem todo o financeiro?",
          "O acesso depende das permissões definidas pelo administrador. É possível separar a consulta e a gestão dos recursos financeiros.",
        ],
        [
          "A SYZIA serve apenas para um segmento?",
          "Não. A plataforma atende prestadores de serviços e pequenos negócios de diferentes segmentos.",
        ],
      ].map(([q, a]) => (
        <details key={q}>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      ))}
      <details>
        <summary>Posso testar antes de contratar?</summary>
        <p>
          {offer.loading
            ? "Consultando as condições publicadas…"
            : offer.failed
              ? "Não foi possível consultar as ofertas agora. Fale com a SYZIA para conferir as condições disponíveis."
              : trial.length
                ? "Há avaliação nas ofertas publicadas: " +
                  trial
                    .map((p) => `${p.name} (${p.version.trial_days} dias)`)
                    .join(", ") +
                  ". A concessão depende da elegibilidade verificada no cadastro. As condições são apresentadas antes da confirmação."
                : "Não há oferta de avaliação publicada no momento. Consulte os planos ou fale com a SYZIA para conhecer as condições disponíveis."}
        </p>
        <Link to="/planos">Consultar planos e condições</Link>
      </details>
    </div>
  );
}
export function PlanCards() {
  return <PlanList offer={usePlans()} />;
}
function PlanList({ offer }: { offer: ReturnType<typeof usePlans> }) {
  const { plans, loading, failed } = offer;
  return (
    <>
      {loading ? (
        <p role="status">Carregando planos…</p>
      ) : !plans.length ? (
        <div className="sy-empty">
          <p>
            {failed
              ? "Não foi possível consultar os planos agora."
              : "Os planos comerciais ainda estão sendo preparados."}
          </p>
          <Link to="/contato">Fale com a SYZIA para saber mais</Link>
        </div>
      ) : (
        <div className="sy-plan-grid">
          {plans.map((p) => (
            <article
              key={p.id}
              className={p.featured ? "sy-featured" : undefined}
            >
              {p.featured && (
                <span className="sy-featured-badge">{p.featured_label}</span>
              )}
              <h3>{p.name}</h3>
              <p>{p.description}</p>
              {p.version.human_support && <p>{supportPlanDescription}</p>}
              {p.trial_eligible && p.version.trial_days > 0 && <div className="sy-trial-offer"><strong>{p.version.trial_days} dias grátis</strong><small>{p.billing047 ? `Depois, ${brl(p.version.price_cents)}/mês. Para empresas elegíveis, com meio de pagamento vinculado.` : "Para empresas elegíveis, após confirmação dos dados."}</small></div>}
              <strong className="sy-price">{brl(p.version.price_cents)}</strong>
              <span>
                {p.version.interval_months === 1
                  ? "/mês"
                  : `a cada ${p.version.interval_months} meses`}
              </span>
              <ul>
                <li>Página pública, serviços e portfólio</li>
                <li>Atendimento, orçamento e agenda</li>
                {p.version.capabilities?.finance !== false && (
                  <li>Financeiro conforme permissões</li>
                )}
                {p.version.capabilities?.analytics !== false && (
                  <li>Métricas conforme permissões</li>
                )}
                {p.version.commercial_followups && (
                  <li>Follow-up e recuperação</li>
                )}
                <li>
                  {memberLimitLabel(p.version.member_limit)}
                </li>
                {p.version.human_support && <li>{supportBenefit}. {supportDescription}</li>}
              </ul>
              <Link
                className="sy-button sy-primary"
                to={p.self_service ? "/cadastrar?plano=" + p.id : "/contato"}
              >
                {p.self_service ? "Escolher plano" : "Consultar este plano"}
              </Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
export function PublicPlans() {
  return (
    <SiteFrame title="Planos — SYZIA">
      <section className="sy-section sy-page-head">
        <p className="sy-kicker">SUA PRÓXIMA ETAPA</p>
        <h1>Planos para organizar a operação.</h1>
        <p>Condições e recursos das versões comercialmente publicadas.</p>
        <PlanCards />
      </section>
    </SiteFrame>
  );
}
export function Contact() {
  const [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState(""),
    key = useRef(crypto.randomUUID());
  return (
    <SiteFrame title="Falar com a SYZIA">
      <section className="sy-section sy-contact">
        <div>
          <p className="sy-kicker">VAMOS CONVERSAR</p>
          <h1>Conte sobre sua empresa.</h1>
          <p>
            Deixe seu contato e o que você gostaria de organizar. Esta mensagem
            não cria conta nem inicia uma assinatura.
          </p>
        </div>
        <div className="sy-form-card">
          {sent ? (
            <div role="status">
              <h2>Mensagem recebida.</h2>
              <p>
                Seu interesse foi registrado para atendimento pela equipe SYZIA.
              </p>
              <Link to="/">Voltar ao início</Link>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const f = new FormData(e.currentTarget);
                try {
                  await accessApi("/access/contact", {
                    name: f.get("name"),
                    company: f.get("company"),
                    phone: f.get("phone"),
                    email: f.get("email"),
                    interest: f.get("interest"),
                    request_key: key.current,
                  });
                  setSent(true);
                } catch (e) {
                  setError(accessMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Nome
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                />
              </label>
              <label>
                Empresa
                <input
                  name="company"
                  required
                  minLength={2}
                  maxLength={160}
                  autoComplete="organization"
                />
              </label>
              <label>
                Telefone / WhatsApp
                <input
                  name="phone"
                  type="tel"
                  required
                  minLength={8}
                  maxLength={40}
                  autoComplete="tel"
                />
              </label>
              <label>
                E-mail
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                />
              </label>
              <label>
                Interesse
                <textarea
                  name="interest"
                  required
                  minLength={2}
                  maxLength={1000}
                />
              </label>
              <p>
                Usaremos estas informações para responder ao seu contato.{" "}
                <Link to="/privacidade">Política de Privacidade</Link>.
              </p>
              {error && <p role="alert">{error}</p>}
              <button className="sy-button sy-primary" disabled={busy}>
                {busy ? "Enviando…" : "Enviar mensagem"}
              </button>
            </form>
          )}
        </div>
      </section>
    </SiteFrame>
  );
}
