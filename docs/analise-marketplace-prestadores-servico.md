# Estudo de Viabilidade — Comunidade de Prestadores de Serviço (Marketplace de Manutenção) para hóspede.ai

**Status:** Rascunho para discussão (Rodada 1 de análise)
**Data:** 2026-08-29
**Autor:** Claude Code (a pedido de Renan)
**Objetivo deste documento:** consolidar a ideia descrita, avaliar viabilidade, e especificar requisitos funcionais, não funcionais, modelo de dados, fluxos e pontos de integração — para servir de base à próxima rodada de análise e à decisão de implementação.

> **Nota sobre o contexto técnico.** Este repositório (`renanrba/amsa`) contém hoje apenas o *Airbnb Message Scraper & Analyzer* (Express + Vite/React + Playwright + Gemini), uma ferramenta pontual do ecossistema hóspede.ai — não o produto principal de gestão de imóveis (autenticação de gestores, cadastro de propriedades, calendário, etc.). Não tenho visibilidade do código do sistema "principal" citado na solicitação. Por isso, as seções de arquitetura e integração abaixo são feitas com premissas explícitas (marcadas como **[PREMISSA]**), que precisam ser validadas por você antes de virar plano de implementação. Onde a decisão é de negócio/produto, deixei perguntas na seção 15.

---

## 1. Contexto e problema a resolver

Gestores de imóveis de curta temporada (Airbnb e similares) têm uma janela de tempo curta e inflexível entre check-out e check-in (turnover) para resolver qualquer problema estrutural — elétrica, hidráulica, ar-condicionado, fechaduras, etc. Hoje essa dor é resolvida de forma informal: grupos de WhatsApp, indicação boca a boca, ou busca genérica em marketplaces não especializados (GetNinjas, 99Jobs, grupos de Facebook). Isso gera:

- Tempo de resposta lento e imprevisível;
- Nenhuma garantia de qualidade/reputação do prestador;
- Risco direto de cancelamento/reembolso da próxima hospedagem por falha não resolvida a tempo.

A proposta é criar, dentro do hóspede.ai, uma **comunidade/marketplace de prestadores de serviço** segmentada por localidade e categoria, para que gestores encontrem rapidamente mão de obra qualificada e avaliada por outros gestores da própria rede.

## 2. Modelo de negócio

- **Gestor (cliente do hóspede.ai):** usa a busca/contratação **gratuitamente** — é um benefício agregado ao produto principal (aumenta retenção e valor percebido da assinatura do gestor).
- **Prestador de serviço:** paga uma **taxa de assinatura (mensal ou anual com desconto)** para ficar **ativo e visível** no marketplace. Prestador inadimplente/inativo desaparece das buscas.
- **Pagamento do serviço em si** (o conserto do ar-condicionado, a diária de limpeza, etc.) é **combinado e pago diretamente entre gestor e prestador, fora da plataforma**. O hóspede.ai não intermedeia esse pagamento, não retém comissão sobre ele e **não deve ser confundido com um marketplace transacional** (tipo iFood) — é um **diretório/vitrine pago para o lado da oferta**, no modelo de GetNinjas/Houzz Pro, mas fechado à rede de gestores hóspede.ai.

Essa escolha de monetização (assinatura da oferta, não comissão sobre transação) tem implicações diretas no desenho do produto:
- Não precisamos de wallet, split de pagamento, escrow ou gateway de pagamento *entre usuários* — reduz muito a complexidade e a responsabilidade regulatória (não somos intermediário financeiro da transação de serviço).
- Precisamos apenas de **cobrança recorrente B2B2C** (hóspede.ai → prestador), que é um problema já bem resolvido por gateways brasileiros.
- O maior risco de negócio não é técnico, é de **cold start de marketplace** (ver seção 12): sem prestadores não há gestores interessados, sem gestores buscando não há prestadores dispostos a pagar. A estratégia de lançamento importa tanto quanto a especificação técnica.

## 3. Personas

| Persona | Descrição | Objetivo no módulo |
|---|---|---|
| **Gestor** | Usuário atual do hóspede.ai, administra um ou mais imóveis de temporada | Encontrar rapidamente, por bairro/cidade e categoria, um prestador confiável; contatar; avaliar depois |
| **Prestador de serviço** | Autônomo (MEI) ou pequena empresa (eletricista, encanador, técnico de ar-condicionado, diarista/faxina, chaveiro, dedetizadora, piscineiro, jardineiro, marido de aluguel, pintor etc.) | Ser encontrado por gestores da região, construir reputação, gerar leads recorrentes |
| **Admin hóspede.ai** | Equipe interna | Moderar cadastros, gerenciar categorias/planos, tratar denúncias, acompanhar métricas do módulo |

## 4. Escopo por fase

| Fase | Conteúdo | Racional |
|---|---|---|
| **Fase 0 — Discovery** | Validar categorias, faixa de preço da assinatura, cidades piloto, entrevistar 10-15 prestadores e gestores | Reduz risco antes de construir |
| **Fase 1 — MVP** | Cadastro de prestador, categorias fixas, cobertura por cidade/bairro (texto), busca + filtro, contato via WhatsApp/telefone (link direto, sem chat interno), avaliação pós-contato, assinatura mensal (1 gateway), painel admin básico de aprovação | Menor conjunto que já entrega valor e testa a monetização |
| **Fase 2** | Plano anual com desconto, geolocalização por raio (mapa), destaque pago/ordenação por prioridade, notificações automáticas ("avalie seu prestador"), painel do prestador com métricas de visualizações/contatos | Aumenta conversão e ARPU |
| **Fase 3 (futuro)** | Chat interno, orçamento/proposta estruturada dentro da plataforma, agenda de disponibilidade do prestador, aplicativo/PWA do prestador, split opcional de pagamento para quem quiser | Só depois de validar tração no MVP |

Este documento cobre principalmente **Fase 1 e 2** em detalhe, e lista a Fase 3 apenas como visão de longo prazo.

---

## 5. Requisitos Funcionais (RF)

### 5.1 Cadastro e perfil do prestador

- **RF-01** O prestador deve poder se cadastrar de forma independente do fluxo de gestor (landing page própria "Seja um prestador parceiro"), informando: nome/razão social, CPF ou CNPJ, telefone (WhatsApp), e-mail, foto/logo, descrição livre (bio), anos de experiência (opcional).
- **RF-02** O prestador deve selecionar **uma ou mais categorias de serviço** (ver 5.2) dentre um catálogo controlado pelo hóspede.ai (não texto livre, para permitir busca estruturada).
- **RF-03** Para cada categoria, o prestador informa um **preço base** e a unidade (visita/hora/m²/orçamento sob consulta) — apenas referencial, não vinculante.
- **RF-04** O prestador define sua **área de cobertura**: cidade(s) + bairro(s), ou raio de atuação a partir de um endereço-base (Fase 2, com geolocalização).
- **RF-05** O prestador pode anexar até N fotos de trabalhos anteriores (portfólio) — opcional no MVP.
- **RF-06** Cadastro entra como `pending_approval` até ser revisado pelo Admin (RF-30) **ou** aprovação automática com moderação reativa — decisão de produto a validar (ver seção 15).
- **RF-07** O prestador pode editar seus dados, categorias, preços e cobertura a qualquer momento; edições sensíveis (documento, categorias) podem re-disparar revisão.
- **RF-08** O prestador pode pausar voluntariamente sua visibilidade (ex.: período de férias) sem cancelar a assinatura.

### 5.2 Catálogo de categorias de serviço

- **RF-09** Catálogo inicial sugerido (editável pelo Admin): Elétrica, Hidráulica/Encanador, Ar-condicionado/Refrigeração, Limpeza/Faxina, Chaveiro, Marido de aluguel/Manutenção geral, Pintura, Jardinagem/Piscina, Dedetização/Controle de pragas, Gás (botijão/instalação), Montagem de móveis, Internet/Wi-Fi/TV.
- **RF-10** Cada categoria tem ícone, nome e descrição curta usada na busca ("Estou com problema no ar-condicionado" → mapeia para a categoria).
- **RF-11** Admin pode criar, renomear, arquivar (nunca excluir, para não quebrar histórico) categorias.

### 5.3 Busca e descoberta (lado do gestor)

- **RF-12** Ponto de entrada contextual: dentro da tela de um imóvel específico, botão "Preciso de um profissional" que já pré-carrega bairro/cidade do imóvel.
- **RF-13** Ponto de entrada geral: módulo "Comunidade de Prestadores" no menu, com busca livre por categoria + localidade.
- **RF-14** Resultado lista prestadores **ativos** (assinatura em dia) na região, com: nome, foto, categorias, nota média, nº de avaliações, preço base, distância/bairro, selo "destaque" (se plano premium).
- **RF-15** Ordenação padrão: relevância (combinação de nota média, nº de avaliações, proximidade, prestadores em destaque pagos) — critério exato a definir na Fase 2.
- **RF-16** Filtros: categoria, bairro/cidade, nota mínima, faixa de preço.
- **RF-17** Página de perfil público do prestador: bio, categorias, preços, portfólio, avaliações completas (com resposta do prestador, se houver), botão de contato.

### 5.4 Contato / geração de chamado

- **RF-18** Botão "Contatar" abre WhatsApp (link `wa.me`) ou exibe telefone — a conversa em si ocorre fora da plataforma.
- **RF-19** Cada clique em "Contatar" gera um registro interno de **lead/contato** (gestor → prestador, categoria, imóvel opcional, timestamp), usado para: (a) habilitar avaliação futura, (b) métricas para o prestador, (c) analytics do módulo.
- **RF-20** (Fase 2) Opcional: formulário curto "Descreva o problema" antes de contatar, para o prestador já chegar com contexto (pode virar mensagem pré-formatada no WhatsApp).

### 5.5 Avaliações e reputação

- **RF-21** Gestor só pode avaliar um prestador com quem tenha um registro de contato (RF-19) prévio — evita reviews falsas de quem nunca usou.
- **RF-22** Avaliação = nota 1-5 estrelas + comentário opcional + (opcional) tags rápidas ("pontual", "preço justo", "resolveu de primeira").
- **RF-23** Sistema envia, alguns dias após o contato, uma notificação/prompt "Você contratou [Prestador]? Avalie o atendimento" (RF-33).
- **RF-24** Prestador pode responder publicamente a uma avaliação (uma vez, sem editar a nota).
- **RF-25** Nota média e contagem de avaliações exibidas no perfil e nos resultados de busca; recalculadas a cada nova avaliação.
- **RF-26** Gestor pode favoritar prestadores ("meus preferidos") para acesso rápido futuro.
- **RF-27** Denúncia de avaliação abusiva/perfil falso, encaminhada para moderação do Admin.

### 5.6 Assinatura e cobrança do prestador

- **RF-28** Prestador escolhe entre plano **mensal** ou **anual (com desconto)** ao final do cadastro (ou depois, se ficou como rascunho).
- **RF-29** Cobrança recorrente automática via gateway de pagamento; falha de cobrança move o status para `past_due` com período de carência (ex.: 3-5 dias) antes de `inactive`.
- **RF-30** Somente prestadores com assinatura `active` aparecem em buscas e perfis públicos; `past_due`/`inactive`/`pending_approval`/`suspended` ficam ocultos (mas o prestador ainda acessa seu painel para regularizar).
- **RF-31** Prestador pode cancelar a qualquer momento; permanece visível até o fim do período já pago, depois some (sem reembolso proporcional, salvo definição contrária).
- **RF-32** Histórico de faturas/recibos disponível no painel do prestador.

### 5.7 Notificações

- **RF-33** Notificar prestador: novo lead/contato recebido, avaliação recebida, assinatura próxima do vencimento, pagamento falhou, conta suspensa/reativada.
- **RF-34** Notificar gestor: prompt de avaliação pós-contato, resposta do prestador à sua avaliação.

### 5.8 Painel administrativo (Admin)

- **RF-35** Fila de aprovação de novos cadastros de prestador (se moderação prévia for adotada).
- **RF-36** Gestão de categorias, planos e preços de assinatura.
- **RF-37** Busca/gestão de todos os prestadores (ativar/suspender manualmente, ex. por denúncia grave).
- **RF-38** Dashboard de métricas do módulo (ver seção 13 — KPIs).
- **RF-39** Fila de denúncias (perfis, avaliações) para tratamento manual.

---

## 6. Regras de negócio (resumo)

1. Prestador só é visível/pesquisável com assinatura `active`.
2. Avaliação exige contato prévio registrado (anti-fraude de reputação).
3. Um gestor não pode avaliar o mesmo contato mais de uma vez (1 avaliação por lead/contato; pode haver nova avaliação para um novo contato no futuro).
4. Cancelamento de assinatura não gera reembolso proporcional (a validar com jurídico/produto).
5. Prestador pode atuar em múltiplas categorias e múltiplas cidades/bairros dentro do mesmo cadastro.
6. Alterações cadastrais sensíveis (documento, categoria) podem exigir nova aprovação — evita golpe de "troca de identidade" após aprovação inicial.
7. O hóspede.ai não é parte na relação comercial do serviço contratado — apenas plataforma de descoberta e reputação (ver seção 11, aspectos legais).

---

## 7. Requisitos Não Funcionais (RNF)

| Categoria | Requisito |
|---|---|
| **Segurança** | Autenticação forte para prestador (mesmo padrão do gestor); dados sensíveis (CPF/CNPJ) criptografados em repouso; controle de acesso — prestador só edita o próprio perfil; rate limiting em endpoints de contato/busca para evitar scraping/abuso. |
| **Privacidade / LGPD** | Base legal e consentimento explícito no cadastro do prestador; política de privacidade específica do módulo; direito de exclusão de dados (anonimizar avaliações associadas em vez de apagar histórico de terceiros); minimização de dados (não coletar mais do que o necessário); registro de operações de tratamento (leads, avaliações) como dados pessoais. |
| **Disponibilidade** | O módulo deve ter degradação graciosa: se a busca/marketplace cair, não pode afetar o core do produto (gestão de imóveis). Recomenda-se isolamento de serviço/domínio. |
| **Performance** | Busca por localidade + categoria deve responder em <500ms para volumes de até dezenas de milhares de prestadores; paginação obrigatória em listagens. |
| **Escalabilidade** | Modelo de dados deve suportar crescimento multi-cidade sem redesenho (nada hardcoded por cidade). |
| **Auditoria** | Log de mudanças de status de assinatura, aprovações/reprovações, suspensões, denúncias tratadas — quem fez o quê e quando. |
| **Multi-tenancy** | Marketplace de prestadores é uma **rede compartilhada entre todos os tenants/gestores** do hóspede.ai (não isolado por conta) — é justamente o efeito de rede que cria valor. Precisa ficar claro no desenho multi-tenant existente que esta é uma exceção intencional ao isolamento por tenant. |
| **Pagamentos** | PCI-DSS delegado ao gateway (nunca armazenar dados de cartão diretamente); cobrança recorrente com retries e webhooks idempotentes. |
| **Observabilidade** | Métricas de negócio (KPIs da seção 13) e métricas técnicas (latência de busca, taxa de erro de cobrança) monitoradas. |
| **Internacionalização** | Não crítico no MVP (mercado BR), mas evitar hardcode de formatos (CPF/CNPJ, moeda) que impeçam expansão futura. |
| **Acessibilidade** | Interface de busca/perfil deve seguir os mesmos padrões de acessibilidade já usados no produto principal. |

---

## 8. Modelo de dados (proposta lógica)

```mermaid
erDiagram
    USER ||--o| SERVICE_PROVIDER : "pode ser"
    SERVICE_PROVIDER ||--o{ PROVIDER_SERVICE : oferece
    SERVICE_CATEGORY ||--o{ PROVIDER_SERVICE : classifica
    SERVICE_PROVIDER ||--o{ COVERAGE_AREA : atende
    SERVICE_PROVIDER ||--o{ PROVIDER_SUBSCRIPTION : assina
    SUBSCRIPTION_PLAN ||--o{ PROVIDER_SUBSCRIPTION : define
    PROVIDER_SUBSCRIPTION ||--o{ INVOICE : gera
    GESTOR ||--o{ SERVICE_CONTACT : registra
    SERVICE_PROVIDER ||--o{ SERVICE_CONTACT : recebe
    SERVICE_CONTACT ||--o| REVIEW : habilita
    GESTOR ||--o{ REVIEW : escreve
    SERVICE_PROVIDER ||--o{ REVIEW : recebe
    GESTOR ||--o{ FAVORITE : marca
    SERVICE_PROVIDER ||--o{ FAVORITE : "é favoritado"
    PROPERTY ||--o{ SERVICE_CONTACT : "opcionalmente associado a"
```

### Entidades principais

- **service_provider**: id, user_id (fk auth), nome/razão social, documento (cpf/cnpj), telefone, email, bio, avatar_url, status (`pending_approval`, `active`, `past_due`, `inactive`, `suspended`), rating_avg, rating_count, created_at, approved_at.
- **service_category**: id, nome, slug, ícone, ativo (bool).
- **provider_service**: provider_id, category_id, preco_base, unidade_preco, descricao.
- **coverage_area**: provider_id, cidade, estado, bairro (nullable = cidade toda), lat/lng + raio_km (Fase 2).
- **subscription_plan**: id, nome, periodicidade (`monthly`/`yearly`), preco, desconto_pct, features (jsonb: destaque, limite_categorias, etc.).
- **provider_subscription**: provider_id, plan_id, status (`trialing`,`active`,`past_due`,`canceled`), current_period_start, current_period_end, gateway_customer_id, gateway_subscription_id.
- **invoice**: subscription_id, valor, status (`paid`,`failed`,`pending`), paid_at, gateway_transaction_id.
- **service_contact** (lead): gestor_id, provider_id, category_id, property_id (nullable), mensagem (opcional), canal (`whatsapp`/`telefone`), created_at.
- **review**: service_contact_id (unique), gestor_id, provider_id, nota (1-5), comentario, resposta_prestador, created_at.
- **favorite**: gestor_id, provider_id, created_at.
- **audit_log**: entidade, entidade_id, ação, ator, payload_antes/depois, created_at.

> **[PREMISSA]** Assumo que o hóspede.ai já possui uma tabela `users`/`gestor` e um sistema de autenticação reaproveitável, e que `property` (imóvel) já existe para permitir o vínculo contextual do RF-12. Confirmar com o time do produto principal.

---

## 9. Fluxos principais

### 9.1 Cadastro e ativação do prestador

```mermaid
sequenceDiagram
    participant P as Prestador
    participant S as Sistema (hóspede.ai)
    participant A as Admin
    participant G as Gateway de Pagamento

    P->>S: Preenche cadastro (dados, categorias, cobertura, preços)
    S->>S: Status = pending_approval
    alt Moderação prévia ativada
        S->>A: Notifica novo cadastro
        A->>S: Aprova / Reprova (com motivo)
    end
    P->>S: Escolhe plano (mensal/anual)
    S->>G: Cria assinatura recorrente
    G-->>S: Webhook: pagamento confirmado
    S->>S: Status = active
    S-->>P: Perfil visível na busca
```

### 9.2 Busca e contato pelo gestor

```mermaid
sequenceDiagram
    participant Ge as Gestor
    participant S as Sistema
    participant Pr as Prestador

    Ge->>S: Abre "Preciso de um profissional" (a partir do imóvel ou busca geral)
    S->>S: Filtra prestadores ativos por categoria + localidade
    S-->>Ge: Lista ordenada (rating, distância, destaque)
    Ge->>S: Abre perfil do prestador
    Ge->>S: Clica em "Contatar"
    S->>S: Registra service_contact
    S-->>Ge: Abre WhatsApp/telefone do prestador
    Ge--)Pr: Conversa e negociação (fora da plataforma)
    S->>Ge: (dias depois) "Avalie o atendimento"
    Ge->>S: Envia nota + comentário
    S->>S: Atualiza rating_avg do prestador
```

### 9.3 Inadimplência e reativação

```mermaid
stateDiagram-v2
    [*] --> pending_approval
    pending_approval --> active: aprovado + 1º pagamento ok
    pending_approval --> rejected: reprovado
    active --> past_due: falha na cobrança
    past_due --> active: pagamento regularizado
    past_due --> inactive: fim do período de carência
    inactive --> active: novo pagamento manual
    active --> suspended: ação do Admin (denúncia grave)
    suspended --> active: revisão favorável
    active --> canceled: cancelamento voluntário (visível até fim do período pago)
    canceled --> inactive: fim do período pago
```

---

## 10. Integração com o sistema atual — pontos de atenção

**[PREMISSA — validar]**: como não tenho acesso ao código do produto principal hóspede.ai, seguem recomendações de integração assumindo uma arquitetura típica de SaaS de gestão (auth central, banco relacional, dashboard web do gestor):

1. **Identidade**: reaproveitar o provedor de autenticação existente. O prestador é um **novo tipo de conta**, não uma role dentro da conta de gestor (são públicos, personas diferentes, ciclo de vida de cobrança diferente). Avaliar se compensa um provedor de auth único compartilhado ou uma base de usuários separada com SSO opcional.
2. **Navegação**: novo item de menu "Comunidade de Prestadores" para o gestor; e um **fluxo de onboarding separado** ("Seja um prestador parceiro") acessível fora do login de gestor (landing pública, para captar prestadores organicamente/SEO).
3. **Contexto do imóvel**: ponto de entrada dentro da tela de detalhe do imóvel (RF-12) é o principal driver de valor percebido — vale priorizar essa integração mesmo que o módulo standalone venha depois.
4. **Notificações**: reaproveitar o sistema de notificações do produto principal, se existir (e-mail/push), em vez de criar um novo canal.
5. **Cobrança**: se o hóspede.ai já cobra o gestor via algum gateway (Stripe, Pagar.me, Asaas, Iugu), avaliar reaproveitar o mesmo provedor para a assinatura do prestador — reduz integração duplicada, mas atenção: o público prestador (autônomo/MEI brasileiro) tem forte preferência por **PIX recorrente e boleto**, nem todo gateway internacional cobre bem esse caso.
6. **Isolamento**: mesmo reaproveitando infraestrutura, recomenda-se que o módulo viva em schema/domínio próprio (ex.: `marketplace.*`) para permitir evolução e, se necessário, extração futura em serviço separado sem acoplar ao core de reservas/imóveis.
7. **Dados do imóvel para geolocalização**: se `property` já tem endereço/geo cadastrado, reaproveitar para popular automaticamente a busca contextual (RF-12) em vez de pedir ao gestor para digitar a localização de novo.

---

## 11. Aspectos legais e compliance

- **Papel do hóspede.ai**: deixar contratualmente claro nos Termos de Uso que a plataforma é um **diretório/vitrine de prestadores independentes**, não contrata, não fiscaliza execução do serviço, e não é parte na relação comercial entre gestor e prestador (mitiga responsabilidade civil por serviço malfeito, atraso, dano ao imóvel etc.).
- **Nota fiscal**: emissão de NF do serviço prestado (ar-condicionado, limpeza etc.) é responsabilidade do prestador — fora do escopo da plataforma. O hóspede.ai emite NF apenas da **própria assinatura** cobrada do prestador.
- **LGPD**: tratamento de CPF/CNPJ e dados de contato do prestador exige base legal (execução de contrato) e política de privacidade própria; avaliações contêm dados pessoais do gestor (autor) e opinião sobre o prestador — ambos precisam de tratamento adequado (retenção, direito de exclusão/anonimização).
- **Cadastro/verificação**: recomenda-se, no mínimo, validação de formato de CPF/CNPJ e confirmação de telefone (OTP); verificação documental mais forte (selfie + doc) pode ser Fase 2/3 como diferencial de confiança ("prestador verificado").
- **Cancelamento/reembolso de assinatura**: definir política clara (ex.: sem reembolso proporcional, conforme CDC permite para contratos de prestação continuada, desde que informado previamente).

---

## 12. Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| **Cold start** (poucos prestadores no lançamento → gestores não voltam) | Alto | Lançar em 1-2 cidades piloto com curadoria manual/prospecção ativa de prestadores; oferecer trial gratuito nos primeiros meses; recrutar prestadores já indicados informalmente pelos gestores atuais (pesquisa com base de clientes) |
| **Avaliações falsas/manipuladas** | Médio | Exigir contato registrado antes de avaliar (RF-21); rate limit de avaliações por gestor/prestador; moderação reativa por denúncia |
| **Prestador fantasma/golpe** (cobra e não aparece) | Alto (reputacional) | Moderação de cadastro na Fase 1; canal de denúncia visível; suspensão rápida por Admin |
| **Concorrência de marketplaces genéricos** (GetNinjas etc.) | Médio | Diferencial = rede fechada e contextualizada ao imóvel/urgência de temporada, não é preciso vencer no volume, só na relevância para esse nicho |
| **Baixo ARPU / churn de prestador sem leads suficientes** | Médio | Painel do prestador com métricas de visualização/contato (mostrar valor); plano de destaque pago como upsell, não como barreira de entrada |
| **Sazonalidade regional** (poucas cidades com massa crítica) | Médio | MVP com foco geográfico deliberado (cidades onde já há concentração de gestores hóspede.ai) |
| **Responsabilidade legal por serviço malfeito** | Alto se mal contratualizado | Termos de uso claros (seção 11) + disclaimer visível nas telas de contato |

---

## 13. Métricas de sucesso (KPIs)

- Nº de prestadores com assinatura `active`, por cidade/categoria
- MRR do módulo (receita recorrente de assinaturas)
- Taxa de conversão busca → contato (service_contact / buscas)
- Taxa de avaliação pós-contato (reviews / contacts)
- Nota média da rede e distribuição por categoria
- Churn mensal de assinaturas de prestador
- Tempo médio entre cadastro do prestador e primeiro lead recebido (mostra "time to value")
- % de gestores ativos que já usaram o módulo ao menos uma vez (adoção)

---

## 14. Estimativa de esforço (alto nível, não é um plano de sprint)

| Fase | Escopo | Estimativa |
|---|---|---|
| Fase 0 — Discovery | Entrevistas, definição de categorias/preços/cidades piloto | 1-2 semanas |
| Fase 1 — MVP | Cadastro, catálogo, busca simples, contato, avaliação, 1 gateway, admin básico | 6-8 semanas (1 squad full-stack) |
| Fase 2 — Growth | Geolocalização, plano anual, destaque pago, notificações automáticas, painel de métricas do prestador | 4-6 semanas |
| Fase 3 — Futuro | Chat interno, orçamento estruturado, agenda de disponibilidade, app do prestador | A avaliar após tração do MVP |

(Estimativas grosseiras para dimensionamento de negócio; refinar em planning técnico quando a decisão de implementar for tomada.)

---

## 15. Perguntas em aberto para a próxima rodada

1. O sistema principal do hóspede.ai já tem autenticação/usuário base que dá para reaproveitar para o prestador, ou será uma base de contas separada?
2. Já existe algum gateway de pagamento em uso hoje (para cobrança do gestor) que possa ser reaproveitado para a assinatura recorrente do prestador? Precisa suportar PIX recorrente/boleto para o público de prestador autônomo?
3. Moderação de cadastro será **prévia** (aprovação manual antes de aparecer) ou **reativa** (aparece direto, moderação só por denúncia)? Isso muda bastante o esforço operacional inicial.
4. Quais cidades/regiões fazem sentido para o piloto, com base na concentração atual de gestores hóspede.ai?
5. Faixa de preço da assinatura do prestador (mensal e anual) — já existe uma hipótese, ou parte de pesquisa de mercado (GetNinjas Profissionais, Houzz Pro etc.)?
6. Haverá período de trial gratuito para os primeiros prestadores (estratégia de cold start)?
7. O prestador poderá ser, ao mesmo tempo, gestor de imóveis (dupla persona)? Isso afeta o modelo de contas.
8. Existe já um catálogo/estrutura de "imóvel" (property) com endereço geocodificado que possa alimentar a busca contextual (RF-12)?

---

## 16. Próximos passos sugeridos

1. Validar este documento e responder às perguntas da seção 15.
2. Rodar Fase 0 (discovery) com uma amostra pequena de gestores e prestadores reais.
3. Prototipar wireframes das telas críticas: cadastro do prestador, busca do gestor, perfil público, fluxo de avaliação.
4. Só então detalhar o plano técnico de implementação (schema definitivo, escolha de gateway, escolha de abordagem de geolocalização) para a Fase 1.
