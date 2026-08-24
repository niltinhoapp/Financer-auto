/**
 * Base de conhecimento do sistema de ajuda.
 * Cada tópico tem passos reais do sistema, palavras-chave para busca
 * e os papéis que podem vê-lo (admin, seller, customer, visitante da loja).
 */

export type PapelAjuda = "admin" | "seller" | "customer" | "loja";

export interface TopicoAjuda {
  id: string;
  titulo: string;
  /** palavras-chave extras para a busca (além do título e passos) */
  palavras: string;
  papeis: PapelAjuda[];
  /** prefixos de rota onde o tópico é mais relevante (sugestões contextuais) */
  rotas?: string[];
  passos: string[];
  dica?: string;
}

export const TOPICOS_AJUDA: TopicoAjuda[] = [
  /* ════════════ VEÍCULOS ════════════ */
  {
    id: "veiculo-cadastrar",
    titulo: "Cadastrar um veículo",
    palavras: "carro novo adicionar estoque anunciar foto",
    papeis: ["admin", "seller"],
    rotas: ["/veiculos"],
    passos: [
      "No menu lateral, clique em Veículos → botão Novo Veículo.",
      "Preencha marca, modelo, ano, cor, placa, km e o preço de venda.",
      "Após salvar, abra o veículo e envie as fotos (até o limite indicado).",
      "Veículos com status Disponível aparecem automaticamente na loja virtual.",
    ],
    dica: "Fotos boas vendem: tire na horizontal, com o carro limpo e em local iluminado.",
  },
  {
    id: "veiculo-status",
    titulo: "Mudar o status do veículo (disponível, reservado, vendido)",
    palavras: "reservar marcar vendido garantia esconder da loja",
    papeis: ["admin", "seller"],
    rotas: ["/veiculos"],
    passos: [
      "Abra o veículo na lista de Veículos.",
      "Na seção Alterar Status, clique no status desejado.",
      "Apenas veículos Disponíveis aparecem na loja virtual.",
      "Ao criar um contrato de venda, o status muda para Vendido automaticamente.",
    ],
  },
  {
    id: "veiculo-excluir",
    titulo: "Excluir veículos",
    palavras: "apagar remover deletar carro",
    papeis: ["admin"],
    rotas: ["/veiculos"],
    passos: [
      "Para excluir UM veículo: abra-o e use o card vermelho 'Excluir veículo' no final da página.",
      "Para excluir VÁRIOS: na lista de Veículos, clique em Selecionar, marque os desejados e use a barra Excluir.",
      "Veículos vinculados a contratos não podem ser excluídos — mude o status em vez disso.",
      "A exclusão apaga também todas as fotos. Não pode ser desfeita.",
    ],
  },

  /* ════════════ LEADS ════════════ */
  {
    id: "lead-o-que-e",
    titulo: "O que são Leads e como atendê-los",
    palavras: "interessado loja virtual contato interesse novo",
    papeis: ["admin", "seller"],
    rotas: ["/leads"],
    passos: [
      "Quando alguém demonstra interesse num carro pela loja virtual, vira um Lead com status Novo.",
      "No menu Leads, veja telefone, e-mail e o veículo de interesse de cada um.",
      "Toque no telefone para ligar ou use o e-mail para contato.",
      "Atualize o status conforme avança: Contatado → Negociando → Convertido (ou Perdido).",
    ],
    dica: "Responda leads em até 1 hora — a chance de fechar cai muito depois disso.",
  },
  {
    id: "lead-converter",
    titulo: "Transformar um lead em cliente",
    palavras: "converter cadastrar cliente do lead virar",
    papeis: ["admin", "seller"],
    rotas: ["/leads"],
    passos: [
      "Em Leads, localize o lead e clique no botão verde Converter em Cliente.",
      "O cadastro abre já preenchido com nome, telefone e e-mail.",
      "Complete o que tiver (CPF e endereço podem ficar para o próprio cliente preencher depois).",
      "Ao salvar, o lead é marcado como Convertido automaticamente.",
    ],
  },

  /* ════════════ CLIENTES ════════════ */
  {
    id: "cliente-cadastrar",
    titulo: "Cadastrar um cliente",
    palavras: "novo cliente cadastro rapido nome email celular",
    papeis: ["admin", "seller"],
    rotas: ["/clientes"],
    passos: [
      "Menu Clientes → Novo Cliente.",
      "Obrigatórios: nome completo, e-mail (vira o login do cliente) e celular.",
      "CPF, nascimento e endereço são opcionais — o sistema exige que o PRÓPRIO cliente complete no primeiro acesso.",
      "Após salvar, o cliente fica Pendente até um administrador aprovar.",
    ],
  },
  {
    id: "cliente-aprovar",
    titulo: "Aprovar ou rejeitar um cliente",
    palavras: "aprovação pendente analise documentos liberar venda",
    papeis: ["admin"],
    rotas: ["/clientes/aprovacao"],
    passos: [
      "Menu Aprovação: veja os clientes pendentes.",
      "Confira os dados e os documentos enviados (CPF, RG, comprovantes).",
      "Clique em Aprovar para liberar a criação de contratos, ou Rejeitar com uma observação.",
    ],
  },
  {
    id: "cliente-acesso",
    titulo: "Dar acesso (login e senha) ao cliente",
    palavras: "criar conta senha temporaria gerar acesso area do cliente login",
    papeis: ["admin"],
    rotas: ["/clientes"],
    passos: [
      "Abra a página do cliente e clique em Gerar Acesso.",
      "O sistema cria a conta e mostra uma senha temporária (ex: fin-1234-abcd).",
      "Use o botão verde Enviar pelo WhatsApp — a mensagem já vai pronta com link, e-mail e senha.",
      "No primeiro acesso o cliente é OBRIGADO a criar a própria senha e completar o cadastro.",
    ],
    dica: "Se o cliente perder a senha depois, ele mesmo recupera pelo 'Esqueci minha senha' na tela de login.",
  },
  {
    id: "cliente-restricao",
    titulo: "Bloquear cliente (restrição interna)",
    palavras: "bloquear negativar marcar mau pagador spc serasa interno",
    papeis: ["admin"],
    rotas: ["/clientes"],
    passos: [
      "Abra a página do cliente → botão Restrição Interna.",
      "Informe o motivo (ex: inadimplência em contrato anterior) e confirme.",
      "O cliente fica marcado com o selo Restrição em todas as listas — um alerta para não vender fiado de novo.",
      "É uma marcação interna da loja: não consulta nem registra nada em SPC/Serasa.",
    ],
  },
  {
    id: "cliente-excluir",
    titulo: "Excluir clientes",
    palavras: "apagar remover deletar cadastro",
    papeis: ["admin"],
    rotas: ["/clientes"],
    passos: [
      "Para UM cliente: abra a página dele e use o card vermelho 'Excluir cliente' no final.",
      "Para VÁRIOS: na lista, clique em Selecionar, marque e use a barra Excluir.",
      "Clientes com contrato não podem ser excluídos — use a Restrição Interna para bloquear.",
      "A exclusão remove também documentos enviados e a conta de acesso. Não pode ser desfeita.",
    ],
  },
  {
    id: "cliente-extrato",
    titulo: "Ver e imprimir o extrato do cliente",
    palavras: "historico pagamentos saldo devedor pdf imprimir",
    papeis: ["admin", "seller"],
    rotas: ["/clientes"],
    passos: [
      "Abra a página do cliente → botão Extrato.",
      "Veja total contratado, total pago e saldo devedor real (parcelas em aberto).",
      "Use Baixar PDF para gerar o extrato completo para entregar ao cliente.",
    ],
  },

  /* ════════════ CONTRATOS / VENDA ════════════ */
  {
    id: "venda-nova",
    titulo: "Fazer uma venda (criar contrato)",
    palavras: "vender financiar contrato novo wizard parcelas juros",
    papeis: ["admin", "seller"],
    rotas: ["/contratos"],
    passos: [
      "Menu Contratos → Nova Venda.",
      "Passo 1: escolha o cliente (precisa estar Aprovado).",
      "Passo 2: escolha o veículo disponível.",
      "Passo 3: defina entrada, parcelas e juros — ou ligue o modo manual (abaixo).",
      "Passo 4: revise e confirme. As parcelas são geradas automaticamente e o veículo vira Vendido.",
    ],
  },
  {
    id: "venda-manual",
    titulo: "Venda negociada manualmente (ex: 3 mil + 30x de 450 todo dia 12)",
    palavras: "modo manual combinado entrada parcela fixa sem juros dia vencimento negociar",
    papeis: ["admin", "seller"],
    rotas: ["/contratos/novo"],
    passos: [
      "Na Nova Venda, passo Financiamento, ligue a chave 'Negócio combinado manualmente'.",
      "Digite a entrada (ex: 3000), o número de parcelas (ex: 30) e o valor de cada uma (ex: 450).",
      "Em 'Dia do vencimento (todo mês)' escolha o dia fixo (ex: dia 12) — a 1ª parcela é calculada sozinha.",
      "Multa e juros de atraso continuam valendo, mas só se o cliente atrasar — não mudam o valor combinado.",
    ],
    dica: "Esse modo não calcula juros: a parcela é exatamente o valor que você digitou.",
  },
  {
    id: "contrato-assinar",
    titulo: "Assinatura digital do contrato",
    palavras: "assinar eletronica cliente confirma",
    papeis: ["admin", "seller", "customer"],
    rotas: ["/contratos", "/minha-area"],
    passos: [
      "Após a venda, o cliente vê o aviso 'Assinatura do contrato pendente' na área dele.",
      "Ele toca no aviso, lê o contrato e assina digitando nome completo e CPF.",
      "A assinatura fica registrada com data e hora no contrato.",
    ],
  },
  {
    id: "contrato-pdf",
    titulo: "Gerar PDF do contrato e notas promissórias",
    palavras: "imprimir documento promissoria baixar",
    papeis: ["admin", "seller"],
    rotas: ["/contratos"],
    passos: [
      "Abra o contrato na lista de Contratos.",
      "Use Baixar Contrato para o PDF completo do contrato.",
      "Use Baixar Promissórias para gerar uma nota promissória por parcela em aberto, prontas para imprimir e assinar.",
    ],
  },
  {
    id: "contrato-renegociar",
    titulo: "Renegociar parcelas em atraso",
    palavras: "renegociação acordo refazer parcelamento atrasado divida",
    papeis: ["admin"],
    rotas: ["/contratos"],
    passos: [
      "Abra o contrato → botão Renegociar.",
      "Selecione as parcelas em aberto que entram no acordo (o sistema mostra o valor atualizado com multa/juros).",
      "Defina a entrada do acordo (se houver), o novo valor de parcela, a quantidade e o 1º vencimento.",
      "Ao salvar: as parcelas antigas viram 'Renegociadas' (saem da cobrança) e o novo cronograma é criado.",
    ],
  },
  {
    id: "contrato-excluir",
    titulo: "Excluir um contrato",
    palavras: "apagar remover deletar venda errada cancelar",
    papeis: ["admin"],
    rotas: ["/contratos"],
    passos: [
      "Na lista de Contratos, clique em Selecionar, marque o contrato e use a barra Excluir.",
      "A exclusão é em cascata: apaga parcelas, pagamentos e solicitações vinculadas.",
      "Use apenas para vendas lançadas por engano — não pode ser desfeita.",
    ],
  },

  /* ════════════ RECEBIMENTOS ════════════ */
  {
    id: "receb-confirmar",
    titulo: "Confirmar um pagamento enviado pelo cliente",
    palavras: "solicitação pix comprovante aprovar baixa receber",
    papeis: ["admin"],
    rotas: ["/recebimentos"],
    passos: [
      "Menu Recebimentos → aba Solicitações.",
      "Toque na solicitação para expandir: veja o comprovante anexado e as parcelas.",
      "Confira se o PIX caiu na conta e clique em Confirmar Recebimento — as parcelas são quitadas e o recibo registrado.",
      "Se algo estiver errado, digite o motivo e recuse — o cliente verá a recusa.",
    ],
  },
  {
    id: "receb-manual",
    titulo: "Registrar pagamento recebido em mãos (dinheiro)",
    palavras: "baixa manual dinheiro especie balcao recebi",
    papeis: ["admin"],
    rotas: ["/recebimentos"],
    passos: [
      "Em Recebimentos, aba A Vencer ou Em Atraso, localize a parcela (use a busca por nome).",
      "Clique em Registrar na linha da parcela.",
      "O valor já vem atualizado (com multa/juros se atrasada). Escolha a forma (dinheiro/PIX/transferência) e confirme.",
    ],
  },
  {
    id: "receb-cobrar",
    titulo: "Cobrar parcela atrasada pelo WhatsApp",
    palavras: "cobrança mensagem atraso whatsapp manual",
    papeis: ["admin", "seller"],
    rotas: ["/recebimentos"],
    passos: [
      "Em Recebimentos → aba Em Atraso, cada parcela tem o botão Cobrar.",
      "Ele abre o WhatsApp do cliente com uma mensagem educada já pronta, com o valor atualizado.",
      "Revise e envie — pronto.",
    ],
  },
  {
    id: "receb-avisos",
    titulo: "Avisos automáticos de vencimento e cobrança",
    palavras: "lembrete automatico robo 3 dias vence hoje cobranca dia seguinte evolution api",
    papeis: ["admin", "seller"],
    rotas: ["/recebimentos", "/configuracoes"],
    passos: [
      "Todo dia às 9h o sistema gera: lembrete 3 dias antes do vencimento, lembrete no dia ('vence hoje') e cobrança a partir do dia seguinte (reforçada a cada 7 dias).",
      "Sem API configurada, os avisos ficam em Recebimentos → aba Avisos: clique em Enviar (abre o WhatsApp pronto) e depois em Enviado.",
      "Para envio 100% automático: em Configurações, preencha a Evolution API (URL, instância e chave).",
    ],
  },

  /* ════════════ FINANCEIRO / RELATÓRIOS ════════════ */
  {
    id: "fin-despesas",
    titulo: "Lançar despesas e ver o fluxo de caixa",
    palavras: "gasto custo saida caixa saldo mes despesa",
    papeis: ["admin", "seller"],
    rotas: ["/financeiro"],
    passos: [
      "Menu Fluxo de Caixa: escolha o mês no seletor.",
      "Receitas = pagamentos de parcelas + entradas em dinheiro das vendas do mês.",
      "Clique em Nova Despesa para lançar gastos (manutenção, aluguel, salários, compra de veículo...).",
      "O Saldo do Mês mostra receitas menos despesas.",
    ],
  },
  {
    id: "fin-dashboard",
    titulo: "Entender o Dashboard",
    palavras: "kpi indicadores visao geral graficos carteira",
    papeis: ["admin"],
    rotas: ["/dashboard"],
    passos: [
      "Contratos Ativos / Vendas do Mês / Receita do Mês: o pulso do negócio.",
      "Parcelas em Atraso: clique para ir direto à cobrança.",
      "Carteira de Crédito: total financiado, recebido e o saldo em aberto real (parcelas não pagas).",
      "Os alertas no topo (solicitações, atrasos, leads novos) são atalhos para agir.",
    ],
  },
  {
    id: "fin-relatorios",
    titulo: "Relatórios e exportação",
    palavras: "exportar csv excel receita 12 meses ranking vendedores ticket",
    papeis: ["admin"],
    rotas: ["/relatorios"],
    passos: [
      "Menu Relatórios: receita e vendas dos últimos 12 meses, ticket médio e ranking de vendedores.",
      "Use Exportar CSV para abrir os dados no Excel.",
    ],
  },
  {
    id: "comissoes",
    titulo: "Comissões de vendedores",
    palavras: "comissao percentual pagar vendedor",
    papeis: ["admin", "seller"],
    rotas: ["/comissoes"],
    passos: [
      "Menu Comissões: cada venda gera uma comissão para o vendedor responsável.",
      "O admin marca como Paga quando efetuar o pagamento ao vendedor.",
      "Vendedores veem apenas as próprias comissões.",
    ],
  },

  /* ════════════ TROCAS / GARANTIA / OFICINAS / VENDEDORES ════════════ */
  {
    id: "trocas",
    titulo: "Pedidos de troca de veículo",
    palavras: "trocar carro cliente quer outro upgrade",
    papeis: ["admin", "customer"],
    rotas: ["/trocas", "/minha-area"],
    passos: [
      "O cliente solicita a troca na área dele (Solicitar Troca de Veículo), escolhendo o carro desejado.",
      "O pedido aparece no menu Trocas do painel.",
      "O admin analisa, conversa com o cliente e aprova ou recusa.",
    ],
  },
  {
    id: "garantia",
    titulo: "Garantia e revisões do veículo",
    palavras: "garantia revisao manutencao oficina autorizada historico",
    papeis: ["admin", "seller", "customer"],
    rotas: ["/contratos", "/minha-area/garantia", "/oficinas"],
    passos: [
      "No contrato, o admin cadastra a garantia (período e cobertura) e registra revisões feitas.",
      "Oficinas autorizadas são cadastradas no menu Oficinas.",
      "O cliente consulta tudo em Minha Área → Garantia e Revisões.",
    ],
  },
  {
    id: "vendedores",
    titulo: "Cadastrar e gerenciar vendedores",
    palavras: "funcionario equipe usuario novo vendedor senha",
    papeis: ["admin"],
    rotas: ["/vendedores"],
    passos: [
      "Menu Vendedores → Novo Vendedor: nome, e-mail e senha inicial.",
      "O vendedor acessa o painel com visão limitada: veículos, clientes, contratos próprios e leads.",
      "Para desligar: Excluir — se ele tiver contratos, é apenas desativado (histórico preservado).",
    ],
  },

  /* ════════════ CONFIGURAÇÕES ════════════ */
  {
    id: "config-empresa",
    titulo: "Dados da empresa e chave PIX",
    palavras: "cnpj endereco razao social pix recebedor configurar",
    papeis: ["admin"],
    rotas: ["/configuracoes"],
    passos: [
      "Menu Configurações: preencha nome/razão social, CNPJ, endereço e telefone (saem nos contratos).",
      "Cadastre a chave PIX e o nome do favorecido — é o que o cliente vê ao pagar parcelas.",
      "O campo WhatsApp da loja virtual ativa o botão verde flutuante na loja pública.",
    ],
  },
  {
    id: "config-limpeza",
    titulo: "Limpar dados de teste (Zona de Perigo)",
    palavras: "zerar banco excluir tudo massa resetar teste",
    papeis: ["admin"],
    rotas: ["/configuracoes"],
    passos: [
      "Configurações → Zona de Perigo (seção vermelha no final).",
      "Escolha a categoria (Leads, Veículos, Clientes, Contratos, Despesas) e clique em Limpar.",
      "Digite EXCLUIR para confirmar. Veículos/clientes com contrato são preservados automaticamente.",
      "Ordem recomendada para zerar testes: Contratos → Clientes → Veículos → Leads.",
    ],
    dica: "O backup PITR do Firestore guarda 7 dias — em emergência, dá para recuperar.",
  },
  {
    id: "config-privacidade",
    titulo: "Privacidade de documentos (LGPD)",
    palavras: "lgpd privado arquivo documento seguro privatizar",
    papeis: ["admin"],
    rotas: ["/configuracoes"],
    passos: [
      "Documentos e comprovantes são salvos como privados — só admin/vendedor e o próprio cliente conseguem abrir (link temporário de 15 min).",
      "Se você usava o sistema antes dessa proteção, clique uma vez em Configurações → Privatizar Arquivos Antigos.",
    ],
  },

  /* ════════════ ÁREA DO CLIENTE ════════════ */
  {
    id: "cli-pagar",
    titulo: "Como pagar minhas parcelas",
    palavras: "pagar pix parcela vencimento comprovante enviar dinheiro",
    papeis: ["customer"],
    rotas: ["/minha-area"],
    passos: [
      "Na sua área, o card azul no topo mostra a próxima parcela — toque em Pagar Agora.",
      "Ou selecione várias parcelas na lista e toque em Pagar.",
      "Escolha PIX (copie a chave, pague no seu banco e anexe o comprovante) ou Dinheiro (combine na loja).",
      "Envie a solicitação: quando a loja confirmar, as parcelas ficam marcadas como pagas.",
    ],
  },
  {
    id: "cli-atraso",
    titulo: "Minha parcela atrasou — e agora?",
    palavras: "atrasada multa juros regularizar vencida",
    papeis: ["customer"],
    rotas: ["/minha-area"],
    passos: [
      "Sem pânico: o card no topo mostra o valor já atualizado (com multa e juros do contrato).",
      "Toque em Regularizar Agora para pagar via PIX, ou fale com a loja para combinar.",
      "Quanto antes regularizar, menor o valor — os juros contam por dia.",
    ],
  },
  {
    id: "cli-senha",
    titulo: "Esqueci minha senha / trocar senha",
    palavras: "recuperar senha esqueci login entrar nao consigo",
    papeis: ["customer", "loja"],
    rotas: ["/login", "/loja/acesso"],
    passos: [
      "Na tela de login, digite seu e-mail e toque em 'Esqueci minha senha'.",
      "Você receberá um e-mail com o link para criar uma nova senha (confira o spam).",
      "Se recebeu uma senha temporária da loja, o sistema pedirá para criar a sua no primeiro acesso.",
    ],
  },
  {
    id: "cli-documentos",
    titulo: "Enviar meus documentos",
    palavras: "cpf rg comprovante residencia renda foto enviar documento",
    papeis: ["customer"],
    rotas: ["/minha-area/documentos"],
    passos: [
      "Na sua área, toque em Meus Documentos.",
      "Envie foto ou PDF de cada documento solicitado (CPF, RG, comprovantes).",
      "A loja analisa e aprova — você acompanha o status de cada um ali mesmo.",
    ],
  },
  {
    id: "cli-contrato",
    titulo: "Ver e assinar meu contrato",
    palavras: "assinatura ler contrato segunda via",
    papeis: ["customer"],
    rotas: ["/minha-area"],
    passos: [
      "Na sua área, toque no card do contrato (aviso amarelo se a assinatura estiver pendente).",
      "Leia o contrato completo e assine digitando seu nome e CPF.",
      "Depois de assinado, o mesmo card serve para reler o contrato quando quiser.",
    ],
  },
  {
    id: "cli-troca",
    titulo: "Quero trocar meu veículo",
    palavras: "trocar carro outro modelo upgrade",
    papeis: ["customer"],
    rotas: ["/minha-area/troca"],
    passos: [
      "Na sua área, toque em Solicitar Troca de Veículo.",
      "Escolha o carro desejado no estoque da loja e envie a solicitação.",
      "A loja entrará em contato para negociar as condições da troca.",
    ],
  },

  /* ════════════ LOJA VIRTUAL (visitante) ════════════ */
  {
    id: "loja-interesse",
    titulo: "Tenho interesse em um carro — como faço?",
    palavras: "comprar quero ver financiamento simular contato",
    papeis: ["loja"],
    rotas: ["/loja"],
    passos: [
      "Toque no carro para ver fotos, detalhes e condições.",
      "Preencha o formulário Tenho Interesse com nome e WhatsApp — a loja entra em contato.",
      "Ou toque no botão verde do WhatsApp para falar direto com a loja.",
    ],
  },
  {
    id: "loja-financiamento",
    titulo: "Como funciona o financiamento próprio?",
    palavras: "parcelar sem banco spc serasa aprovacao entrada promissoria",
    papeis: ["loja", "customer"],
    rotas: ["/loja"],
    passos: [
      "O parcelamento é direto com a loja — sem banco e sem consulta ao SPC/Serasa.",
      "Você combina entrada e parcelas que cabem no seu bolso, com contrato digital.",
      "Depois da compra, você acompanha tudo (parcelas, pagamentos, contrato) pela sua área do cliente.",
    ],
  },
];

/** Remove acentos e baixa para busca tolerante. */
function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Busca por palavras-chave com pontuação simples. */
export function buscarAjuda(consulta: string, papel: PapelAjuda): TopicoAjuda[] {
  const termos = normalizar(consulta).split(/\s+/).filter((t) => t.length >= 3);
  const visiveis = TOPICOS_AJUDA.filter((t) => t.papeis.includes(papel));
  if (termos.length === 0) return visiveis;

  return visiveis
    .map((t) => {
      const alvo = normalizar(`${t.titulo} ${t.palavras} ${t.passos.join(" ")}`);
      const titulo = normalizar(t.titulo);
      let score = 0;
      for (const termo of termos) {
        if (titulo.includes(termo)) score += 3;
        else if (alvo.includes(termo)) score += 1;
      }
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t);
}

/** Tópicos sugeridos para a rota atual. */
export function sugestoesPorRota(pathname: string, papel: PapelAjuda): TopicoAjuda[] {
  return TOPICOS_AJUDA
    .filter((t) => t.papeis.includes(papel))
    .filter((t) => t.rotas?.some((r) => pathname.startsWith(r)))
    .slice(0, 4);
}
