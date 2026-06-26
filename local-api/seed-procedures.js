/**
 * Seed script — insere todos os procedimentos operacionais no banco Pipeon.
 *
 * Uso:
 *   cd local-api
 *   node seed-procedures.js
 *
 * Variáveis de ambiente (opcional, via .env):
 *   PIPEON_MONGO_URL  — string de conexão do banco Pipeon (padrão: mongodb://localhost:27017/)
 *   PIPEON_DB_NAME    — nome do banco Pipeon (padrão: pipeon)
 *
 * O projectId padrão é "target-database". Ajuste via admin se necessário.
 */

require('dotenv').config();

const { MongoClient } = require('mongodb');

const PIPEON_MONGO = process.env.PIPEON_MONGO_URL || 'mongodb://localhost:27017/';
const PIPEON_DB    = process.env.PIPEON_DB_NAME   || 'pipeon';
const PROJECT_ID   = 'target-database';

const procedures = [

  // ── 1 ─────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Ciclos',
    name: 'Reabrir a fase de recurso em ciclo',
    description:
      'Reabre a fase de recurso alterando configuration.status para openForEvaluationsDocument ' +
      'e marcando evaluation.documentEvaluation.appeal.appealfinished como false.',
    inputs: [
      { key: 'noticeId', label: 'ID do Ciclo (extraído da URL)', type: 'objectId', required: true },
    ],
    steps: [
      {
        collection: 'notices',
        operation: 'backup',
        filter: { _id: '{{noticeId}}' },
      },
      {
        collection: 'notices',
        operation: 'updateOne',
        filter: { _id: '{{noticeId}}' },
        update: {
          $set: {
            'configuration.status': 'openForEvaluationsDocument',
            'evaluation.documentEvaluation.appeal.appealfinished': false,
          },
        },
      },
    ],
    isActive: true,
    order: 10,
  },

  // ── 2 ─────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Ciclos',
    name: 'Alterar data limite para envio de recurso de documentação',
    description:
      'Altera o campo appealEnd em evaluation.documentEvaluation.appeal. ' +
      'Atenção: o banco está 3h adiantado (ex: encerramento às 23h59 local → 2023-06-06T02:59:59.999+00:00 no banco).',
    inputs: [
      { key: 'noticeId', label: 'ID do Ciclo (extraído da URL)', type: 'objectId', required: true },
      {
        key: 'novaData',
        label: 'Nova data limite — formato ISO (+3h) ex: 2023-06-06T02:59:59.999+00:00',
        type: 'string',
        required: true,
      },
    ],
    steps: [
      {
        collection: 'notices',
        operation: 'backup',
        filter: { _id: '{{noticeId}}' },
      },
      {
        collection: 'notices',
        operation: 'updateOne',
        filter: { _id: '{{noticeId}}' },
        update: {
          $set: {
            'evaluation.documentEvaluation.appeal.appealEnd': { $date: '{{novaData}}' },
          },
        },
      },
    ],
    isActive: true,
    order: 20,
  },

  // ── 3 ─────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Ciclos',
    name: 'Alterar prazo das Avaliações de projeto em andamento',
    description:
      'Altera o campo validityEndProject no ciclo. ' +
      'Atenção: o banco está 3h adiantado em relação ao horário local.',
    inputs: [
      { key: 'noticeId', label: 'ID do Ciclo (extraído da URL)', type: 'objectId', required: true },
      {
        key: 'novaData',
        label: 'Nova data de validade — formato ISO (+3h) ex: 2023-06-06T02:59:59.999+00:00',
        type: 'string',
        required: true,
      },
    ],
    steps: [
      {
        collection: 'notices',
        operation: 'backup',
        filter: { _id: '{{noticeId}}' },
      },
      {
        collection: 'notices',
        operation: 'updateOne',
        filter: { _id: '{{noticeId}}' },
        update: {
          $set: {
            validityEndProject: { $date: '{{novaData}}' },
          },
        },
      },
    ],
    isActive: true,
    order: 30,
  },

  // ── 4 ─────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Revisores',
    name: 'Alterar Usuário Vinculado ao Revisor',
    description:
      'Transfere o cadastro de revisor do usuário antigo para o novo. ' +
      'Obtenha os IDs dos usuários pela collection users filtrando por e-mail.',
    inputs: [
      {
        key: 'antigoUserId',
        label: 'ID do Usuário Antigo (collection users → _id)',
        type: 'objectId',
        required: true,
      },
      {
        key: 'novoUserId',
        label: 'ID do Novo Usuário (collection users → _id)',
        type: 'objectId',
        required: true,
      },
    ],
    steps: [
      {
        collection: 'reviewers',
        operation: 'backup',
        filter: { userId: '{{antigoUserId}}' },
      },
      {
        collection: 'reviewers',
        operation: 'updateOne',
        filter: { userId: '{{antigoUserId}}' },
        update: {
          $set: { userId: '{{novoUserId}}' },
        },
      },
    ],
    isActive: true,
    order: 40,
  },

  // ── 5a ────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Formulários',
    name: 'Atualização da data em Formulários adicionais — Início',
    description:
      'Atualiza o campo startDate em additionalFormsRegister. ' +
      'Atenção: o banco está 3h adiantado. Obtenha o ID do formulário na URL do sistema.',
    inputs: [
      { key: 'formId', label: 'ID do Formulário adicional (URL)', type: 'objectId', required: true },
      {
        key: 'novaData',
        label: 'Nova data de início — formato ISO (+3h) ex: 2026-03-12T03:00:00.000+00:00',
        type: 'string',
        required: true,
      },
    ],
    steps: [
      {
        collection: 'additionalFormsRegister',
        operation: 'backup',
        filter: { _id: '{{formId}}' },
      },
      {
        collection: 'additionalFormsRegister',
        operation: 'updateOne',
        filter: { _id: '{{formId}}' },
        update: {
          $set: { startDate: { $date: '{{novaData}}' } },
        },
      },
    ],
    isActive: true,
    order: 50,
  },

  // ── 5b ────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Formulários',
    name: 'Atualização da data em Formulários adicionais — Término',
    description:
      'Atualiza o campo endDate em additionalFormsRegister. ' +
      'Atenção: o banco está 3h adiantado. Obtenha o ID do formulário na URL do sistema.',
    inputs: [
      { key: 'formId', label: 'ID do Formulário adicional (URL)', type: 'objectId', required: true },
      {
        key: 'novaData',
        label: 'Nova data de término — formato ISO (+3h) ex: 2026-03-12T02:59:59.999+00:00',
        type: 'string',
        required: true,
      },
    ],
    steps: [
      {
        collection: 'additionalFormsRegister',
        operation: 'backup',
        filter: { _id: '{{formId}}' },
      },
      {
        collection: 'additionalFormsRegister',
        operation: 'updateOne',
        filter: { _id: '{{formId}}' },
        update: {
          $set: { endDate: { $date: '{{novaData}}' } },
        },
      },
    ],
    isActive: true,
    order: 51,
  },

  // ── 5c ────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Formulários',
    name: 'Atualização da data em Formulários adicionais — Notificação',
    description:
      'Atualiza o campo notificationDate em additionalFormsRegister. ' +
      'Atenção: o banco está 3h adiantado. Obtenha o ID do formulário na URL do sistema.',
    inputs: [
      { key: 'formId', label: 'ID do Formulário adicional (URL)', type: 'objectId', required: true },
      {
        key: 'novaData',
        label: 'Nova data de notificação — formato ISO (+3h) ex: 2026-03-11T03:00:00.000+00:00',
        type: 'string',
        required: true,
      },
    ],
    steps: [
      {
        collection: 'additionalFormsRegister',
        operation: 'backup',
        filter: { _id: '{{formId}}' },
      },
      {
        collection: 'additionalFormsRegister',
        operation: 'updateOne',
        filter: { _id: '{{formId}}' },
        update: {
          $set: { notificationDate: { $date: '{{novaData}}' } },
        },
      },
    ],
    isActive: true,
    order: 52,
  },

  // ── 6 ─────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Fechamento',
    name: 'Disponibilizar Alteração de Projeto quando fechamento estiver iniciada',
    description:
      'Altera o status do fechamento para NOTIFIED, liberando o campo de alteração de projeto. ' +
      'Informe o _id do documento em accountabilityReports.',
    inputs: [
      {
        key: 'accountabilityId',
        label: 'ID do documento em accountabilityReports',
        type: 'objectId',
        required: true,
      },
    ],
    steps: [
      {
        collection: 'accountabilityReports',
        operation: 'backup',
        filter: { _id: '{{accountabilityId}}' },
      },
      {
        collection: 'accountabilityReports',
        operation: 'updateOne',
        filter: { _id: '{{accountabilityId}}' },
        update: {
          $set: { status: 'NOTIFIED' },
        },
      },
    ],
    isActive: true,
    order: 60,
  },

  // ── 7 ─────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Ciclos',
    name: 'Encerrar fase de avaliação de projetos e habilitar fase de documentação',
    description:
      'Define configuration.status como completedEvaluationsProject e marca as flags de avaliação como concluídas.',
    inputs: [
      { key: 'noticeId', label: 'ID do Ciclo (extraído da URL)', type: 'objectId', required: true },
    ],
    steps: [
      {
        collection: 'notices',
        operation: 'backup',
        filter: { _id: '{{noticeId}}' },
      },
      {
        collection: 'notices',
        operation: 'updateOne',
        filter: { _id: '{{noticeId}}' },
        update: {
          $set: {
            'configuration.status': 'completedEvaluationsProject',
            'evaluation.projectAppealPhase.isCompleted': true,
            'evaluation.distributionCompleted': true,
            'evaluation.allEvaluationsFinished': true,
          },
        },
      },
    ],
    isActive: true,
    order: 70,
  },

  // ── 8 ─────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Documentação',
    name: 'Marcar projeto como "Inabilitado" na fase de documentação',
    description:
      'Define status DISABLED em documentEvaluations pelo número do projeto. ' +
      'A nota do avaliador é opcional — deixe em branco para não preencher.',
    inputs: [
      {
        key: 'submissionNumber',
        label: 'Número do projeto (ex: 12345)',
        type: 'string',
        required: true,
      },
      {
        key: 'evaluatorNote',
        label: 'Justificativa de inabilitação (opcional)',
        type: 'string',
        required: false,
      },
    ],
    steps: [
      {
        collection: 'documentEvaluations',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'documentEvaluations',
        operation: 'updateOne',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
        update: {
          $set: {
            status: 'DISABLED',
            evaluatorNote: '{{evaluatorNote}}',
          },
        },
      },
    ],
    isActive: true,
    order: 80,
  },

  // ── 9 ─────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Contratação',
    name: 'Pular etapa de formulário na contratação',
    description:
      'Marca todos os contratos do ciclo como MARKEDFORCONTRACT em contractDigital, ' +
      'pulando a etapa de formulário de contratação.',
    inputs: [
      { key: 'noticeId', label: 'ID do Ciclo (extraído da URL)', type: 'objectId', required: true },
    ],
    steps: [
      {
        collection: 'contractDigital',
        operation: 'backup',
        filter: { notice: '{{noticeId}}' },
      },
      {
        collection: 'contractDigital',
        operation: 'updateMany',
        filter: { notice: '{{noticeId}}' },
        update: {
          $set: { status: 'MARKEDFORCONTRACT' },
        },
      },
    ],
    isActive: true,
    order: 90,
  },

  // ── 10a ───────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Contratação',
    name: 'Regerar termo de execução após assinatura do solicitante — Liberar geração',
    description:
      'Define o status do contrato como CONTRACTATTACHED, permitindo que o sistema regere o termo de execução. ' +
      'Após a geração, execute o passo de retorno (SIGNATURESENT).',
    inputs: [
      {
        key: 'submissionId',
        label: 'ID do projeto (submission._id em contractDigital)',
        type: 'objectId',
        required: true,
      },
    ],
    steps: [
      {
        collection: 'contractDigital',
        operation: 'backup',
        filter: { 'submission._id': '{{submissionId}}' },
      },
      {
        collection: 'contractDigital',
        operation: 'updateOne',
        filter: { 'submission._id': '{{submissionId}}' },
        update: {
          $set: { status: 'CONTRACTATTACHED' },
        },
      },
    ],
    isActive: true,
    order: 100,
  },

  // ── 10b ───────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Contratação',
    name: 'Regerar termo de execução após assinatura do solicitante — Retornar para SIGNATURESENT',
    description:
      'Após a geração do novo termo, retorna o status do contrato para SIGNATURESENT ' +
      'para que a equipe possa assinar.',
    inputs: [
      {
        key: 'submissionId',
        label: 'ID do projeto (submission._id em contractDigital)',
        type: 'objectId',
        required: true,
      },
    ],
    steps: [
      {
        collection: 'contractDigital',
        operation: 'backup',
        filter: { 'submission._id': '{{submissionId}}' },
      },
      {
        collection: 'contractDigital',
        operation: 'updateOne',
        filter: { 'submission._id': '{{submissionId}}' },
        update: {
          $set: { status: 'SIGNATURESENT' },
        },
      },
    ],
    isActive: true,
    order: 101,
  },

  // ── 11 ────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Avaliações',
    name: 'Retirar projeto da lista de avaliadores (Declínio)',
    description:
      'Define status DECLINED em submissions para remover o projeto da lista de avaliadores. ' +
      'Obs: o passo de criação do evento SubmissionEvents deve ser realizado manualmente no banco.',
    inputs: [
      {
        key: 'submissionId',
        label: 'ID do projeto (submissions → _id)',
        type: 'objectId',
        required: true,
      },
    ],
    steps: [
      {
        collection: 'submissions',
        operation: 'backup',
        filter: { _id: '{{submissionId}}' },
      },
      {
        collection: 'submissions',
        operation: 'updateOne',
        filter: { _id: '{{submissionId}}' },
        update: {
          $set: {
            status: 'DECLINED',
            'lastEvent.status': 'DECLINED',
            'lastEventNotRestricted.status': 'DECLINED',
          },
        },
      },
    ],
    isActive: true,
    order: 110,
  },

  // ── 12 ────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Avaliações',
    name: 'Retornar avaliações para pendentes para substituição de avaliador(a)',
    description:
      'Retorna todas as avaliações de um avaliador em um ciclo para NOTSTARTED e limpa as notas, ' +
      'permitindo a substituição do avaliador.',
    inputs: [
      {
        key: 'evaluatorUserId',
        label: 'ID do avaliador (noticeEvaluator.userId em evaluations)',
        type: 'objectId',
        required: true,
      },
      {
        key: 'noticeId',
        label: 'ID do Ciclo',
        type: 'objectId',
        required: true,
      },
    ],
    steps: [
      {
        collection: 'evaluations',
        operation: 'backup',
        filter: {
          'noticeEvaluator.userId': '{{evaluatorUserId}}',
          notice: '{{noticeId}}',
        },
      },
      {
        collection: 'evaluations',
        operation: 'updateMany',
        filter: {
          'noticeEvaluator.userId': '{{evaluatorUserId}}',
          notice: '{{noticeId}}',
        },
        update: {
          $set: {
            status: 'NOTSTARTED',
            'phaseForm.blocks.$[].fields.$[].value': null,
            'phaseForm.blocks.$[].sumValue': null,
          },
          $unset: {
            evaluationAverage: '',
            evaluationAverageByBlocks: '',
            evaluationSum: '',
            submittedDate: '',
            evaluatorNote: '',
          },
        },
      },
    ],
    isActive: true,
    order: 120,
  },

  // ── 13 ────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Ciclos',
    name: 'Retornar Ciclo para Concluir Etapa de Inscrições',
    description:
      'Retorna o ciclo para configuration.status = closedForSubscriptions quando avançado ' +
      'incorretamente para avaliações.',
    inputs: [
      { key: 'noticeId', label: 'ID do Ciclo (extraído da URL)', type: 'objectId', required: true },
    ],
    steps: [
      {
        collection: 'notices',
        operation: 'backup',
        filter: { _id: '{{noticeId}}' },
      },
      {
        collection: 'notices',
        operation: 'updateOne',
        filter: { _id: '{{noticeId}}' },
        update: {
          $set: { 'configuration.status': 'closedForSubscriptions' },
        },
      },
    ],
    isActive: true,
    order: 130,
  },

  // ── 14 ────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Monitoramento',
    name: 'Reversão da rejeição de um pedido de prorrogação',
    description:
      'Reverte a rejeição de um pedido de prorrogação retornando o status para SENT ' +
      'em submissionReadjustments.',
    inputs: [
      {
        key: 'readjustmentId',
        label: 'ID do pedido de prorrogação (submissionReadjustments → _id)',
        type: 'objectId',
        required: true,
      },
    ],
    steps: [
      {
        collection: 'submissionReadjustments',
        operation: 'backup',
        filter: { _id: '{{readjustmentId}}' },
      },
      {
        collection: 'submissionReadjustments',
        operation: 'updateOne',
        filter: { _id: '{{readjustmentId}}' },
        update: {
          $set: { status: 'SENT' },
        },
      },
    ],
    isActive: true,
    order: 140,
  },

  // ── 15 ────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Contratação',
    name: 'Status de não contratado para marcado para contratação',
    description:
      'Altera o status do contrato para MARKEDFORCONTRACT e atualiza o status do projeto ' +
      'em submissions para CONTRACTDOCUMENTSSENT.',
    inputs: [
      {
        key: 'submissionNumber',
        label: 'Número do projeto (ex: 12345)',
        type: 'string',
        required: true,
      },
    ],
    steps: [
      {
        collection: 'contractDigital',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'contractDigital',
        operation: 'updateOne',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
        update: {
          $set: { status: 'MARKEDFORCONTRACT' },
          $rename: {
            contractToSignLimitDate: 'contractToSignLimitDate_old',
            contractToSignStartDate: 'contractToSignStartDate_old',
            contractToSignFile: 'contractToSignFile_old',
            contractToSignSentDate: 'contractToSignSentDate_old',
          },
        },
      },
      {
        collection: 'submissions',
        operation: 'backup',
        filter: { submissionNumber: '{{submissionNumber}}' },
      },
      {
        collection: 'submissions',
        operation: 'updateOne',
        filter: { submissionNumber: '{{submissionNumber}}' },
        update: {
          $set: {
            'lastEvent.status': 'CONTRACTDOCUMENTSSENT',
            'lastEventNotRestricted.status': 'CONTRACTDOCUMENTSSENT',
          },
        },
      },
    ],
    isActive: true,
    order: 150,
  },

  // ── 16 ────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Documentação',
    name: 'Voltar para editar justificativa de avaliação de documentação',
    description:
      'Retorna o status em documentEvaluations para CORRECTIONSENT, ' +
      'permitindo que a análise seja reaberta para edição.',
    inputs: [
      {
        key: 'submissionNumber',
        label: 'Número do projeto (ex: 12345)',
        type: 'string',
        required: true,
      },
    ],
    steps: [
      {
        collection: 'documentEvaluations',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'documentEvaluations',
        operation: 'updateOne',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
        update: {
          $set: { status: 'CORRECTIONSENT' },
        },
      },
    ],
    isActive: true,
    order: 160,
  },

  // ── 17 ────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Revisores',
    name: 'Voltar Revisor para Pendentes de Cadastro',
    description:
      'Retorna o revisor para SUBMITTED em reviewers e a avaliação para PENDING em reviewerEvaluations. ' +
      'Informe o userId e o _id do documento em reviewers (reviewerDocId).',
    inputs: [
      {
        key: 'userId',
        label: 'userId do revisor (reviewers → userId)',
        type: 'objectId',
        required: true,
      },
      {
        key: 'reviewerDocId',
        label: '_id do documento reviewers (para atualizar reviewerEvaluations)',
        type: 'objectId',
        required: true,
      },
    ],
    steps: [
      {
        collection: 'reviewers',
        operation: 'backup',
        filter: { userId: '{{userId}}' },
      },
      {
        collection: 'reviewers',
        operation: 'updateOne',
        filter: { userId: '{{userId}}' },
        update: {
          $set: { status: 'SUBMITTED' },
        },
      },
      {
        collection: 'reviewerEvaluations',
        operation: 'backup',
        filter: { reviewerId: '{{reviewerDocId}}' },
      },
      {
        collection: 'reviewerEvaluations',
        operation: 'updateOne',
        filter: { reviewerId: '{{reviewerDocId}}' },
        update: {
          $set: { status: 'PENDING' },
        },
      },
    ],
    isActive: true,
    order: 170,
  },

  // ── 18 ────────────────────────────────────────────────────────────────────
  {
    projectId: PROJECT_ID,
    nucleo: 'Avaliações',
    name: 'Zerar notas de projetos de um avaliador',
    description:
      'Reseta as avaliações de um avaliador em um ciclo: status NOTSTARTED, ' +
      'zerando médias, soma e campos do formulário. Filtra por noticeEvaluator._id.',
    inputs: [
      {
        key: 'evaluatorId',
        label: 'ID do avaliador (noticeEvaluator._id em evaluations)',
        type: 'objectId',
        required: true,
      },
      {
        key: 'noticeId',
        label: 'ID do Ciclo',
        type: 'objectId',
        required: true,
      },
    ],
    steps: [
      {
        collection: 'evaluations',
        operation: 'backup',
        filter: {
          'noticeEvaluator._id': '{{evaluatorId}}',
          notice: '{{noticeId}}',
        },
      },
      {
        collection: 'evaluations',
        operation: 'updateMany',
        filter: {
          'noticeEvaluator._id': '{{evaluatorId}}',
          notice: '{{noticeId}}',
        },
        update: {
          $set: {
            evaluationAverage: 0,
            evaluationSum: 0,
            status: 'NOTSTARTED',
          },
          $unset: {
            'phaseForm.blocks.$[].fields.$[].value': '',
            'phaseForm.blocks.$[].fields.$[].justification': '',
          },
        },
      },
    ],
    isActive: true,
    order: 180,
  },
];

// Núcleos são atribuídos pelo admin via UI — não setar no seed
procedures.forEach((p) => { delete p.nucleo; });

// ─────────────────────────────────────────────────────────────────────────────

async function seed() {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const col = client.db(PIPEON_DB).collection('pipeon_procedures');

    let inserted = 0;
    let skipped  = 0;

    for (const proc of procedures) {
      const exists = await col.findOne({ name: proc.name });
      if (exists) {
        console.log(`  ⏭  Já existe: "${proc.name}"`);
        skipped++;
        continue;
      }
      await col.insertOne({ ...proc, createdAt: new Date().toISOString() });
      console.log(`  ✓  Inserido: "${proc.name}"`);
      inserted++;
    }

    console.log(`\nConcluído — ${inserted} inserido(s), ${skipped} ignorado(s).`);
  } finally {
    await client.close();
  }
}

seed().catch((e) => { console.error(e); process.exit(1); });
