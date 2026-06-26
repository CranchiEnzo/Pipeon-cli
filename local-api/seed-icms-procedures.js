require('dotenv').config();
const { MongoClient } = require('mongodb');

const PIPEON_MONGO = process.env.PIPEON_MONGO_URL || 'mongodb://localhost:27017/';
const PIPEON_DB = process.env.PIPEON_DB_NAME || 'pipeon';
const PROJECT_ID = process.env.PROJECT_ID || null;

const ICMS_PROCEDURES = [
  {
    name: 'Alterar o proponente para um novo e-mail',
    description:
      'Altera o proprietário de um cadastro de proponente no sistema FomentoCultSP. ' +
      'Documentações necessárias: RG (frente e verso), nome e ofício de alteração de usuário [INTERNAL-SYSTEM]. ' +
      'Procedimento realizado diretamente na interface web em fomentocultsp.sp.gov.br/configuracoes/proponentes.',
    inputs: [],
    steps: [],
    order: 10,
  },
  {
    name: 'Ajuste para Correção do Erro: "O valor total do orçamento do projeto deve ser igual ao valor do [INTERNAL-SYSTEM]"',
    description:
      'Corrige o erro de orçamento na submissão: localizar a última section e alterar status de ' +
      'VALIDATIONERROR para VALIDATED; nas duas sections anteriores à última readequação, ' +
      'alterar deprecated: true e budgetRequestDraft: true em replacementIds. ' +
      'Procedimento requer navegação manual nas sections do documento.',
    inputs: [
      { key: 'submissionNumber', label: 'Número da submissão', type: 'string', required: true },
    ],
    steps: [
      {
        collection: 'submissions',
        operation: 'backup',
        filter: { submissionNumber: '{{submissionNumber}}' },
      },
    ],
    order: 20,
  },
  {
    name: 'Alterar data/texto do parecer - Comissão',
    description:
      'Atualiza o texto e/ou data do parecer em indiretoEvaluations (campo verdict.conclusion). ' +
      'Validar previamente na tela de Histórico Completo e na aba de Reuniões do edital antes de executar. ' +
      'A data deve ser informada dentro do próprio texto do parecer.',
    inputs: [
      { key: 'submissionNumber', label: 'Número da submissão', type: 'string', required: true },
      { key: 'conclusion', label: 'Novo texto do parecer (incluindo data no final)', type: 'string', required: true },
    ],
    steps: [
      {
        collection: 'indiretoEvaluations',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'indiretoEvaluations',
        operation: 'updateOne',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
        update: { $set: { 'verdict.conclusion': '{{conclusion}}' } },
      },
    ],
    order: 30,
  },
  {
    name: 'Alterar Porte do Projeto na Prestação de Contas',
    description:
      'Corrige o porte do projeto (Pequeno/Médio/Grande) em uma PC já iniciada. ' +
      'IDs dos portes — Pequeno: 687956682ab3236e4aa80d49, Médio: 687956a244a1112516bc427a, Grande: 68823e8ac9ae110081ee8ce5. ' +
      'Requer identificação da regra correta em notice.accountability.indiretoConfiguration.bySelectionRules ' +
      'e replicação em accountabilityIndireto, accountabilityBudgets e accountabilityObjectives.',
    inputs: [
      { key: 'submissionNumber', label: 'Número da submissão', type: 'string', required: true },
    ],
    steps: [
      {
        collection: 'accountabilityIndireto',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'accountabilityBudgets',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'accountabilityObjectives',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
    ],
    order: 40,
  },
  {
    name: 'Alterar segmento de projeto',
    description:
      'Parte 1: habilita o campo de alteração de segmento para o proponente adicionando ' +
      'allowUpdateSegment: true no segundo documento mais recente (verdict) e no mais recente (proponent) de indiretoEvaluations. ' +
      'Parte 2: altera manualmente o campo occupation na section correta de submissions. ' +
      'Verificar se houve readequação recente pelas datas de indiretoEvaluations antes de executar.',
    inputs: [
      { key: 'submissionNumber', label: 'Número da submissão', type: 'string', required: true },
    ],
    steps: [
      {
        collection: 'submissions',
        operation: 'backup',
        filter: { submissionNumber: '{{submissionNumber}}' },
      },
      {
        collection: 'indiretoEvaluations',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
    ],
    order: 50,
  },
  {
    name: 'Aprovação de Projeto e Liberação para Criação de PC',
    description:
      'Aprova o projeto pela CAP e libera a criação de PC: atualiza lastEvent e lastEventNotRestricted em submissions ' +
      'para CAPEVALUATIONAPPROVEDNOTIFIED e status em indiretoEvaluations para APPROVED.',
    inputs: [
      { key: 'submissionNumber', label: 'Número da submissão', type: 'string', required: true },
    ],
    steps: [
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
            lastEvent: 'CAPEVALUATIONAPPROVEDNOTIFIED',
            lastEventNotRestricted: 'CAPEVALUATIONAPPROVEDNOTIFIED',
          },
        },
      },
      {
        collection: 'indiretoEvaluations',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'indiretoEvaluations',
        operation: 'updateOne',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
        update: { $set: { status: 'APPROVED' } },
      },
    ],
    order: 60,
  },
  {
    name: 'Ativar campo de complemento necessário',
    description:
      'Habilita a aba de Complemento para o proponente em indiretoEvaluations. ' +
      'No documento mais recente (ordenar por createdAt: -1): proponent.complementRequired = true. ' +
      'No segundo documento mais recente: verdict.complementRequired = true. ' +
      'ATENÇÃO: este passo atualiza o primeiro resultado da query — validar manualmente o documento mais recente antes de executar.',
    inputs: [
      { key: 'submissionNumber', label: 'Número da submissão', type: 'string', required: true },
    ],
    steps: [
      {
        collection: 'indiretoEvaluations',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'indiretoEvaluations',
        operation: 'updateOne',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
        update: { $set: { 'proponent.complementRequired': true } },
      },
    ],
    order: 70,
  },
  {
    name: 'Ativar Campo de Readequação Orçamentária',
    description:
      'Ativa o campo de Readequação Orçamentária: configura readjustmentBudgetRequired: true e o objeto ' +
      'readjustmentBudget com os IDs das sections em indiretoEvaluations; duplica as sections 0 e 1 em submissions ' +
      'com novos _id, replacementIds.idReference, createdAt e updatedAt. ' +
      'Para múltiplas readequações, usar idReplacedBy para encadear versões. ' +
      'Procedimento requer execução manual — o backup é gerado automaticamente.',
    inputs: [
      { key: 'submissionNumber', label: 'Número da submissão', type: 'string', required: true },
    ],
    steps: [
      {
        collection: 'submissions',
        operation: 'backup',
        filter: { submissionNumber: '{{submissionNumber}}' },
      },
      {
        collection: 'indiretoEvaluations',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
    ],
    order: 80,
  },
  {
    name: 'Cancelamento de Solicitação de Alteração de Projeto',
    description:
      'Cancela uma solicitação de alteração de projeto: altera status em indiretoEvaluations para ' +
      'PROPONENT_CANCELLED_CHANGES_REQUEST; atualiza lastEvent.status e lastEventNotRestricted.status em submissions ' +
      'para CAPEVALUATIONCANCELEDCHANGESREQUESTD. ' +
      'Após executar, acessar o projeto no sistema e realizar "Atualizar Conexão". ' +
      'Clonar o evento em submissionEvents manualmente.',
    inputs: [
      { key: 'submissionNumber', label: 'Número da submissão', type: 'string', required: true },
    ],
    steps: [
      {
        collection: 'indiretoEvaluations',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'indiretoEvaluations',
        operation: 'updateOne',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
        update: { $set: { status: 'PROPONENT_CANCELLED_CHANGES_REQUEST' } },
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
            'lastEvent.status': 'CAPEVALUATIONCANCELEDCHANGESREQUESTD',
            'lastEventNotRestricted.status': 'CAPEVALUATIONCANCELEDCHANGESREQUESTD',
          },
        },
      },
    ],
    order: 90,
  },
  {
    name: 'Data Limite do Envio do Complemento da Prestação de Contas (PC Antiga — Análise Exauriente)',
    description:
      'Ajusta a data limite para envio do complemento em icmsAccountabilityThoroughVersion ' +
      '(campo complementLimitDate). Para Análise Sumária da PC Antiga usar icmsAccountabilityVersion. ' +
      'Confirmar a nova data com o cliente antes de executar. Ordenar por createdAt: -1 para garantir o documento mais recente.',
    inputs: [
      { key: 'submissionId', label: 'submissionId do documento (ObjectId)', type: 'objectId', required: true },
      { key: 'newDate', label: 'Nova data limite (ISO 8601 ex: 2025-12-31T23:59:00.000Z)', type: 'string', required: true },
    ],
    steps: [
      {
        collection: 'icmsAccountabilityThoroughVersion',
        operation: 'backup',
        filter: { submissionId: '{{submissionId}}' },
      },
      {
        collection: 'icmsAccountabilityThoroughVersion',
        operation: 'updateOne',
        filter: { submissionId: '{{submissionId}}' },
        update: { $set: { complementLimitDate: '{{newDate}}' } },
      },
    ],
    order: 100,
  },
  {
    name: 'Exclusão da nova prestação de contas',
    description:
      'Exclui uma Prestação de Contas criada indevidamente. ' +
      'Requer exclusão manual dos documentos em accountabilityBudgets, accountabilityIndireto, accountabilityObjectives ' +
      'e nas collections de IA-ACCOUNTABILITY (project_accountabilities, project_documents, project_evaluations, projects, stages, tasks). ' +
      'Em submissionDocuments: marcar evento de envio como deleted: true e atualizar statusBefore no lastEvent. ' +
      'O backup é gerado automaticamente neste passo.',
    inputs: [
      { key: 'submissionNumber', label: 'Número da submissão', type: 'string', required: true },
    ],
    steps: [
      {
        collection: 'accountabilityIndireto',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'accountabilityBudgets',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'accountabilityObjectives',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
    ],
    order: 110,
  },
  {
    name: 'Expandir data limite do complemento de informações em nova prestação de contas',
    description:
      'Expande a data limite para complemento na nova PC ICMS: atualiza status para PROPONENT_PENDING_COMPLEMENT ' +
      'e limitDate em accountabilityIndireto; status e complementRequest.limitDate em accountabilityObjectives e accountabilityBudgets.',
    inputs: [
      { key: 'submissionNumber', label: 'Número da submissão', type: 'string', required: true },
      { key: 'newLimitDate', label: 'Nova data limite (ISO 8601 ex: 2025-12-31T23:59:00.000Z)', type: 'string', required: true },
    ],
    steps: [
      {
        collection: 'accountabilityIndireto',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'accountabilityIndireto',
        operation: 'updateOne',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
        update: { $set: { status: 'PROPONENT_PENDING_COMPLEMENT', limitDate: '{{newLimitDate}}' } },
      },
      {
        collection: 'accountabilityObjectives',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'accountabilityObjectives',
        operation: 'updateOne',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
        update: {
          $set: {
            status: 'PROPONENT_PENDING_COMPLEMENT',
            'complementRequest.limitDate': '{{newLimitDate}}',
          },
        },
      },
      {
        collection: 'accountabilityBudgets',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'accountabilityBudgets',
        operation: 'updateOne',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
        update: {
          $set: {
            status: 'PROPONENT_PENDING_COMPLEMENT',
            'complementRequest.limitDate': '{{newLimitDate}}',
          },
        },
      },
    ],
    order: 120,
  },
  {
    name: 'Habilitação de envio de documentos',
    description:
      'Exclui documentos enviados equivocadamente em submissionDocuments e reabilita o envio pelo proponente. ' +
      'Localizar o objeto com status NOTSTARTED dentro de batchOfDocuments; excluir o documento com envio equivocado ' +
      'e atribuir status NOTSTARTED ao documento anterior. ' +
      'Atualizar lastEvent, notRestricted e status em submissions após a exclusão.',
    inputs: [
      { key: 'submissionId', label: '_id da submission (ObjectId)', type: 'objectId', required: true },
    ],
    steps: [
      {
        collection: 'submissionDocuments',
        operation: 'backup',
        filter: { submission: '{{submissionId}}' },
      },
    ],
    order: 130,
  },
  {
    name: 'Queries - Nova prestação de contas',
    description:
      'Consultas de aggregation MongoDB para extração de informações da nova PC ICMS na collection accountabilityIndireto. ' +
      '(1) PCs Iniciadas: match status PROPONENT_DRAFT + lookup submissions + filtro section ICMS não deprecated. ' +
      '(2) PCs Enviadas: match sentDate != null. ' +
      '(3) PCs Iniciadas e Enviadas combinadas. ' +
      'Executar via aba Aggregations → Text no MongoDB Compass.',
    inputs: [],
    steps: [],
    order: 140,
  },
  {
    name: 'Reabertura - Análise de material de divulgação',
    description:
      'Reabre a análise do material de divulgação: altera o status do documento mais recente em ' +
      'indiretoPromotionalMaterial de APPROVED ou REPROVED para REQUESTED, ' +
      'retornando o material para o estado "Material enviado" no front-end.',
    inputs: [
      { key: 'submissionNumber', label: 'Número da submissão', type: 'string', required: true },
    ],
    steps: [
      {
        collection: 'indiretoPromotionalMaterial',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'indiretoPromotionalMaterial',
        operation: 'updateOne',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
        update: { $set: { status: 'REQUESTED' } },
      },
    ],
    order: 150,
  },
  {
    name: 'Retornar Avaliação para o Avaliador para Correção de Parecer',
    description:
      'Retorna a avaliação ao parecerista para correção do parecer: altera status em indiretoEvaluations ' +
      'de PROPONENT_PENDING_COMPLEMENT para DRAFT_EVALUATION; marca eventos incorretos como deleted: true em ' +
      'submissionEvents (manualmente); atualiza lastEvent e lastEventNotRestricted em submissions para ' +
      'INDIRETO_SUBMISSION_ACTIVITIES_SENT. Após executar, acessar Histórico Completo e clicar em "Atualizar Conexão".',
    inputs: [
      { key: 'submissionNumber', label: 'Número da submissão', type: 'string', required: true },
    ],
    steps: [
      {
        collection: 'indiretoEvaluations',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'indiretoEvaluations',
        operation: 'updateOne',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
        update: { $set: { status: 'DRAFT_EVALUATION' } },
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
            lastEvent: 'INDIRETO_SUBMISSION_ACTIVITIES_SENT',
            lastEventNotRestricted: 'INDIRETO_SUBMISSION_ACTIVITIES_SENT',
          },
        },
      },
    ],
    order: 160,
  },
  {
    name: 'Retornar Avaliação para o Parecerista',
    description:
      'Retorna projeto cancelado automaticamente ao parecerista para inclusão do parecer: altera status em ' +
      'indiretoEvaluations para PENDING_EVALUATOR_ASSIGNMENT; atualiza lastEvent.lastEventNotRescrited em submissions ' +
      'para INDIRETO_EVALUATION_SUBMISSION_DISAPPROVED. ' +
      'Após executar, acessar Histórico Completo e clicar em "Atualizar Conexão". ' +
      'Alterar submissionEvents (deleted: true) apenas se o cliente solicitar explicitamente.',
    inputs: [
      { key: 'submissionNumber', label: 'Número da submissão', type: 'string', required: true },
    ],
    steps: [
      {
        collection: 'indiretoEvaluations',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'indiretoEvaluations',
        operation: 'updateOne',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
        update: { $set: { status: 'PENDING_EVALUATOR_ASSIGNMENT' } },
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
            'lastEvent.lastEventNotRescrited': 'INDIRETO_EVALUATION_SUBMISSION_DISAPPROVED',
          },
        },
      },
    ],
    order: 170,
  },
  {
    name: 'Retornar Documentos para Iniciar Avaliação',
    description:
      'Retorna a avaliação dos documentos para o status de início (NOTSTARTED) em submissionDocuments: ' +
      'excluir o último batch de notificação de pendência; no novo último objeto de batchOfDocuments, ' +
      'alterar status para NOTSTARTED e responseStatus para SENT; atualizar o status geral do documento para NOTSTARTED. ' +
      'Validar no front-end se a alteração é para documentos do projeto ou do proponente.',
    inputs: [
      { key: 'submissionId', label: '_id da submission (ObjectId)', type: 'objectId', required: true },
    ],
    steps: [
      {
        collection: 'submissionDocuments',
        operation: 'backup',
        filter: { submission: '{{submissionId}}' },
      },
      {
        collection: 'submissionDocuments',
        operation: 'updateOne',
        filter: { submission: '{{submissionId}}' },
        update: { $set: { status: 'NOTSTARTED' } },
      },
    ],
    order: 180,
  },
  {
    name: 'Retornar para o avaliador - Prestação de contas (antiga)',
    description:
      'Reabre o relatório da PC antiga para a equipe de Prestações de Contas do ICMS iniciar a análise exauriente: ' +
      'altera proponentStatus para COMPLEMENTSENT e status para DRAFT em icmsAccountabilityThoroughVersion, ' +
      'fazendo o sistema interpretar que o complemento solicitado foi enviado pelo proponente.',
    inputs: [
      { key: 'submissionId', label: 'submissionId do documento (ObjectId)', type: 'objectId', required: true },
    ],
    steps: [
      {
        collection: 'icmsAccountabilityThoroughVersion',
        operation: 'backup',
        filter: { submissionId: '{{submissionId}}' },
      },
      {
        collection: 'icmsAccountabilityThoroughVersion',
        operation: 'updateOne',
        filter: { submissionId: '{{submissionId}}' },
        update: { $set: { proponentStatus: 'COMPLEMENTSENT', status: 'DRAFT' } },
      },
    ],
    order: 190,
  },
  {
    name: 'Retornar para o Proponente Enviar o Complemento da prestação de contas (Nova PC)',
    description:
      'Retorna o projeto para o proponente enviar complementos na nova PC: atualiza status para ' +
      'PROPONENT_PENDING_COMPLEMENT em accountabilityIndireto, accountabilityObjectives e accountabilityBudgets; ' +
      'atualiza lastEvent.status e lastEventNotRestricted.status em submissions para ' +
      'ACCOUNTABILITY_INDIRETO_PENDING_COMPLEMENT. ' +
      'Em submissionEvents: marcar como deleted: true o documento mais recente com statusAfter ACCOUNTABILITY_INDIRETO_PROPONENT_SENT.',
    inputs: [
      { key: 'submissionNumber', label: 'Número da submissão', type: 'string', required: true },
    ],
    steps: [
      {
        collection: 'accountabilityIndireto',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'accountabilityIndireto',
        operation: 'updateOne',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
        update: { $set: { status: 'PROPONENT_PENDING_COMPLEMENT' } },
      },
      {
        collection: 'accountabilityObjectives',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'accountabilityObjectives',
        operation: 'updateOne',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
        update: { $set: { status: 'PROPONENT_PENDING_COMPLEMENT' } },
      },
      {
        collection: 'accountabilityBudgets',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'accountabilityBudgets',
        operation: 'updateOne',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
        update: { $set: { status: 'PROPONENT_PENDING_COMPLEMENT' } },
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
            'lastEvent.status': 'ACCOUNTABILITY_INDIRETO_PENDING_COMPLEMENT',
            'lastEventNotRestricted.status': 'ACCOUNTABILITY_INDIRETO_PENDING_COMPLEMENT',
          },
        },
      },
    ],
    order: 200,
  },
  {
    name: 'Retornar prestação criada erroneamente',
    description:
      'Retorna uma PC ao estado inicial de criação: remover os documentos em accountabilityBudgets, ' +
      'accountabilityIndireto e accountabilityObjectives (manualmente após backup); em submissions, ' +
      'remover o campo icmsPostApproval.isCompleted e definir icmsPostApproval.isActive como true ' +
      'para permitir o reinício do processo.',
    inputs: [
      { key: 'submissionNumber', label: 'Número da submissão', type: 'string', required: true },
    ],
    steps: [
      {
        collection: 'accountabilityIndireto',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'accountabilityBudgets',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
      },
      {
        collection: 'accountabilityObjectives',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
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
          $unset: { 'icmsPostApproval.isCompleted': '' },
          $set: { 'icmsPostApproval.isActive': true },
        },
      },
    ],
    order: 210,
  },
  {
    name: 'Retorno de situação para avaliação de documentação — Após o início da análise da CAP',
    description:
      'Retorna o projeto para a fase de envio de documentos removendo os registros de avaliação: ' +
      'excluir documentos em indiretoEvaluations e indiretoEvaluationsConnections (manualmente após backup); ' +
      'em submissionDocuments: alterar status para PENDING e, no último objeto de batchOfDocuments validado, ' +
      'setar status: NOTSTARTED e responseStatus: SENT; ' +
      'em submissions: atualizar lastEvent e lastEventNotRestricted para DOCUMENTPENDINGNOTIFIED.',
    inputs: [
      { key: 'submissionNumber', label: 'Número da submissão', type: 'string', required: true },
    ],
    steps: [
      {
        collection: 'indiretoEvaluations',
        operation: 'backup',
        filter: { 'submission.submissionNumber': '{{submissionNumber}}' },
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
            lastEvent: 'DOCUMENTPENDINGNOTIFIED',
            lastEventNotRestricted: 'DOCUMENTPENDINGNOTIFIED',
          },
        },
      },
    ],
    order: 220,
  },
];

async function main() {
  const client = new MongoClient(PIPEON_MONGO);
  await client.connect();
  console.log('Conectado ao MongoDB: ' + PIPEON_MONGO);

  const db = client.db(PIPEON_DB);

  let projectId = PROJECT_ID;
  if (!projectId) {
    const project = await db.collection('pipeon_projects').findOne({ isActive: true });
    if (!project) {
      console.error(
        'Nenhum projeto ativo encontrado em pipeon_projects.\n' +
        'Crie um projeto no admin do Pipeon ou informe PROJECT_ID=<id> ao rodar o script.'
      );
      await client.close();
      process.exit(1);
    }
    projectId = project._id.toString();
    console.log('Projeto encontrado: ' + (project.name || project.slug) + ' (' + projectId + ')');
  } else {
    console.log('Usando PROJECT_ID fornecido: ' + projectId);
  }

  const existing = await db.collection('pipeon_procedures')
    .find({ projectId, nucleo: 'ICMS' })
    .toArray();
  const existingNames = new Set(existing.map((p) => p.name));

  const toInsert = ICMS_PROCEDURES.filter((p) => !existingNames.has(p.name)).map((p) => ({
    ...p,
    nucleo: 'ICMS',
    projectId,
    isActive: true,
    createdAt: new Date().toISOString(),
  }));

  if (toInsert.length === 0) {
    console.log('Todos os procedimentos ICMS já estão cadastrados. Nenhuma inserção necessária.');
    await client.close();
    return;
  }

  const result = await db.collection('pipeon_procedures').insertMany(toInsert);
  console.log('\n' + result.insertedCount + ' procedimento(s) ICMS inserido(s):');
  toInsert.forEach((p) => console.log('  • ' + p.name));

  if (existingNames.size > 0) {
    console.log('\n' + existingNames.size + ' procedimento(s) já existiam e foram ignorados.');
  }

  await client.close();
}

main().catch((e) => {
  console.error('Erro:', e.message);
  process.exit(1);
});
