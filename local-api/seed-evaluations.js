const { MongoClient, ObjectId } = require('mongodb');

const MONGO = 'mongodb://localhost:27017/';
const DB = 'target-database';
const NOTICE_ID = '6838b3554ff3330404eeb85f';
const EVALUATOR_EMAIL = 'evaluator@example.com';
const COMMISSION_NAME = 'Romance';

async function main() {
  const client = new MongoClient(MONGO);
  await client.connect();
  const db = client.db(DB);

  const user = await db.collection('users').findOne({ email: EVALUATOR_EMAIL });
  if (!user) {
    console.error('Usuario nao encontrado: ' + EVALUATOR_EMAIL);
    await client.close(); return;
  }
  console.log('Avaliador: ' + user.name + ' (' + user._id + ')');

  const notice = await db.collection('notices').findOne({ _id: new ObjectId(NOTICE_ID) });
  if (!notice) {
    console.error('Ciclo nao encontrado: ' + NOTICE_ID);
    await client.close(); return;
  }
  console.log('Ciclo: ' + (notice.configuration?.name || notice._id));

  const evaluators = notice.projectEvaluators || [];

  // Busca pelo nome da comissao (case-insensitive)
  let group = evaluators.find((g) =>
    (g.name || '').toLowerCase() === COMMISSION_NAME.toLowerCase()
  );

  if (!group) {
    // Fallback: grupo onde o avaliador esta listado
    group = evaluators.find((g) => {
      const users = (g.users || []).map((u) => u.toString());
      const main = g.mainUser?.toString();
      return users.includes(user._id.toString()) || main === user._id.toString();
    });
    if (group) console.warn('Comissao "' + COMMISSION_NAME + '" nao encontrada. Usando grupo do avaliador: ' + (group.name || group._id));
  }

  const groupId = group?._id ?? new ObjectId();
  if (!group) console.warn('Nenhuma comissao encontrada. Usando groupId gerado.');
  else console.log('Comissao: ' + (group.name || groupId));

  const submissions = await db.collection('submissions')
    .find({ noticeId: new ObjectId(NOTICE_ID) }).limit(10).toArray();
  console.log('Submissoes encontradas: ' + submissions.length);

  const now = new Date();
  const noticeEvaluatorId = new ObjectId();

  const docs = Array.from({ length: 10 }, (_, i) => {
    const sub = submissions[i] ?? null;
    return {
      notice: new ObjectId(NOTICE_ID),
      noticeEvaluator: { _id: noticeEvaluatorId, userId: user._id },
      noticeEvaluatorGroupId: new ObjectId(groupId),
      submission: sub
        ? { _id: sub._id, submissionNumber: sub.submissionNumber ?? ('SEED-' + (i+1)), name: sub.name ?? ('Projeto Teste ' + (i+1)) }
        : { _id: new ObjectId(), submissionNumber: 'SEED-' + (i+1), name: 'Projeto Teste ' + (i+1) },
      status: 'COMPLETE',
      evaluationType: 'project',
      evaluationSum: 80 + i,
      evaluationAverage: 8.0 + i * 0.1,
      evaluationAverageByBlocks: 8.0 + i * 0.1,
      submittedDate: now,
      deleted: false,
      createdAt: now,
      updatedAt: now,
    };
  });

  const result = await db.collection('evaluations').insertMany(docs);
  console.log('\n' + result.insertedCount + ' avaliacoes inseridas com status COMPLETE (avaliacao concluida)');
  await client.close();
}

main().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
