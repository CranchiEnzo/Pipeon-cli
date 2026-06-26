require('dotenv').config();

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const jwksClient = require('jwks-rsa');

const app = express();
app.use(express.json({ limit: '50mb' }));

// MongoDB dos sistemas-alvo (target-database, etc.) — padrão local
const DEFAULT_MONGO = 'mongodb://localhost:27017/';

// MongoDB exclusivo do Pipeon — configurável via PIPEON_MONGO_URL no .env
// Se não definido, usa o mesmo servidor local (banco "pipeon")
const PIPEON_MONGO = process.env.PIPEON_MONGO_URL || DEFAULT_MONGO;
const PIPEON_DB = process.env.PIPEON_DB_NAME || 'pipeon';

const JWT_SECRET = 'pipeon-local-dev-secret';
const PORT = 5000;

// ── Microsoft Entra ID (Azure AD) — config do broker de login ────────────────────
// DORMENTE até ENTRA_TENANT_ID e ENTRA_CLIENT_ID serem definidos no .env. Enquanto
// ausentes, POST /api/auth/microsoft responde 503 e o login atual segue funcionando.
const ENTRA_TENANT_ID = process.env.ENTRA_TENANT_ID;
const ENTRA_CLIENT_ID = process.env.ENTRA_CLIENT_ID;
const ENTRA_CONFIGURED = Boolean(ENTRA_TENANT_ID && ENTRA_CLIENT_ID);

// Cliente JWKS criado de forma preguiçosa (só na 1ª chamada já configurada).
let _entraJwks = null;
function getEntraSigningKey(header, callback) {
  if (!_entraJwks) {
    _entraJwks = jwksClient({
      jwksUri: `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/discovery/v2.0/keys`,
      cache: true,
      rateLimit: true,
    });
  }
  _entraJwks.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

function resolveExtendedJson(val) {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(resolveExtendedJson);
  if (typeof val === 'object') {
    if ('$oid' in val) return new ObjectId(typeof val.$oid === 'string' ? val.$oid.trim() : val.$oid);
    if ('$date' in val) return new Date(typeof val.$date === 'string' ? val.$date.trim() : val.$date);
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = resolveExtendedJson(v);
    return out;
  }
  return val;
}

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token ausente.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalido ou expirado.' });
  }
}

// ── Auth ───────────────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'E-mail obrigatorio.' });
  const normalizedEmail = email.toLowerCase();
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const user = await client.db(PIPEON_DB).collection('pipeon_users').findOne({ email: normalizedEmail });
    if (!user) return res.status(401).json({ message: 'Usuario nao encontrado no banco local.' });
    const token = jwt.sign(
      { sub: user._id.toString(), email: user.email ?? email, name: user.name ?? email, role: user.role ?? 'user' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token });
  } catch (e) {
    res.status(500).json({ message: e.message });
  } finally {
    await client.close();
  }
});

// ── Auth: Microsoft Entra ID (broker) ────────────────────────────────────────────
// Padrão token broker: valida o ID token do Entra via JWKS e emite o MESMO JWT interno
// HS256 usado pelo resto do sistema. DORMENTE enquanto ENTRA_* não estiver configurado.
// Ver docs/plano-azure-ad.md (Fases 2 e 5 — provisionamento just-in-time, opção b).
app.post('/api/auth/microsoft', async (req, res) => {
  if (!ENTRA_CONFIGURED) {
    return res.status(503).json({ message: 'Login Microsoft ainda nao configurado (defina ENTRA_TENANT_ID e ENTRA_CLIENT_ID).' });
  }
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ message: 'idToken obrigatorio.' });

  // 1) Valida assinatura + issuer (tenant) + audience (client) do ID token do Entra.
  let claims;
  try {
    claims = await new Promise((resolve, reject) => {
      jwt.verify(
        idToken,
        getEntraSigningKey,
        {
          audience: ENTRA_CLIENT_ID,
          issuer: `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/v2.0`,
          algorithms: ['RS256'],
        },
        (err, decoded) => (err ? reject(err) : resolve(decoded))
      );
    });
  } catch (e) {
    return res.status(401).json({ message: 'ID token Microsoft invalido: ' + e.message });
  }

  const email = (claims.preferred_username || claims.email || '').toLowerCase();
  const name = claims.name || email;
  const oid = claims.oid;
  if (!email) return res.status(401).json({ message: 'ID token sem email/preferred_username.' });

  // 2) Lookup + provisionamento just-in-time (Fase 5b): usuario ausente entra como 'user'.
  //    $setOnInsert garante que usuario existente NUNCA tem o role rebaixado.
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const result = await client.db(PIPEON_DB).collection('pipeon_users').findOneAndUpdate(
      { email },
      {
        $setOnInsert: {
          email,
          name,
          role: 'user',
          oid,
          isActive: true,
          provisionedVia: 'entra',
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true, returnDocument: 'after' }
    );
    // Compat: driver v6 retorna o doc direto; versões antigas embrulham em { value }.
    const user = result?.value ?? result;
    // TODO (Fase 5, regra 6): registrar auto-criacao em pipeon_operations (ex.: 'user.provisioned').
    const token = jwt.sign(
      { sub: user._id.toString(), email: user.email ?? email, name: user.name ?? name, role: user.role ?? 'user' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token });
  } catch (e) {
    res.status(500).json({ message: e.message });
  } finally {
    await client.close();
  }
});

// ── Generic MongoDB proxy ──────────────────────────────────────────────────────

app.post('/api/mongodb/:action', verifyToken, async (req, res) => {
  const { action } = req.params;
  const { database, connectionString, collection, ...payload } = req.body;
  if (!database || !collection) return res.status(400).json({ error: 'database e collection sao obrigatorios.' });
  const connStr = connectionString || DEFAULT_MONGO;
  const client = new MongoClient(connStr);
  try {
    await client.connect();
    const coll = client.db(database).collection(collection);
    const filter = resolveExtendedJson(payload.filter ?? {});
    const pipeline = resolveExtendedJson(payload.pipeline ?? []);
    let result;
    switch (action) {
      case 'find': {
        const cursor = coll.find(filter, { projection: payload.projection });
        if (payload.limit) cursor.limit(Number(payload.limit));
        result = { documents: await cursor.toArray() };
        break;
      }
      case 'findOne':
        result = { document: await coll.findOne(filter, { projection: payload.projection }) };
        break;
      case 'insertOne':
        result = await coll.insertOne(resolveExtendedJson(payload.document ?? {}));
        break;
      case 'updateOne':
        result = await coll.updateOne(filter, resolveExtendedJson(payload.update), { upsert: payload.upsert ?? false });
        break;
      case 'updateMany':
        result = await coll.updateMany(filter, resolveExtendedJson(payload.update));
        break;
      case 'replaceOne':
        result = await coll.replaceOne(filter, resolveExtendedJson(payload.replacement ?? {}), { upsert: payload.upsert ?? false });
        break;
      case 'aggregate':
        result = { documents: await coll.aggregate(pipeline, { maxTimeMS: 10000 }).toArray() };
        break;
      default:
        return res.status(400).json({ error: 'Acao desconhecida: ' + action });
    }
    res.json(JSON.parse(JSON.stringify(result)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

// ── Users ──────────────────────────────────────────────────────────────────────

app.get('/api/users', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const users = await client.db(PIPEON_DB).collection('pipeon_users').find({}).toArray();
    res.json({ documents: users.map(u => ({ id: u._id.toString(), name: u.name, email: u.email, role: u.role, isActive: u.isActive ?? true, createdAt: u.createdAt })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

app.post('/api/users', verifyToken, async (req, res) => {
  const { name, email, password, role } = req.body;
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const result = await client.db(PIPEON_DB).collection('pipeon_users').insertOne({ name, email, password, role, isActive: true, createdAt: new Date().toISOString() });
    res.json({ id: result.insertedId.toString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

app.post('/api/users/:id/update', verifyToken, async (req, res) => {
  const { id } = req.params;
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    await client.db(PIPEON_DB).collection('pipeon_users').updateOne({ _id: new ObjectId(id) }, { $set: req.body });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

// ── Pipeon Scheduled (sempre no banco pipeon) ──────────────────────────────────

app.get('/api/pipeon/scheduled', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const docs = await client.db(PIPEON_DB).collection('pipeon_scheduled')
      .find({})
      .sort({ scheduledFor: -1 })
      .limit(200)
      .toArray();
    res.json({ documents: docs.map(d => ({ ...d, _id: d._id.toString() })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

app.get('/api/pipeon/scheduled/due', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const now = new Date().toISOString();
    const docs = await client.db(PIPEON_DB).collection('pipeon_scheduled')
      .find({ status: 'pending', scheduledFor: { $lte: now } })
      .toArray();
    res.json({ documents: docs.map(d => ({ ...d, _id: d._id.toString() })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

app.post('/api/pipeon/scheduled', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const result = await client.db(PIPEON_DB).collection('pipeon_scheduled').insertOne(req.body);
    res.json({ insertedId: result.insertedId.toString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

app.post('/api/pipeon/scheduled/:id/cancel', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    await client.db(PIPEON_DB).collection('pipeon_scheduled')
      .updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: 'cancelled' } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

app.post('/api/pipeon/scheduled/:id/executed', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    await client.db(PIPEON_DB).collection('pipeon_scheduled')
      .updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { status: 'executed', executedAt: new Date().toISOString() } }
      );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

// ── Pipeon Settings (sempre no banco pipeon) ──────────────────────────────────

app.get('/api/pipeon/settings/:docId', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const doc = await client.db(PIPEON_DB).collection('pipeon_settings')
      .findOne({ _id: req.params.docId });
    res.json({ document: doc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

app.post('/api/pipeon/settings/:docId', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    await client.db(PIPEON_DB).collection('pipeon_settings').replaceOne(
      { _id: req.params.docId },
      { _id: req.params.docId, ...req.body },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

// ── Projects (sempre no banco pipeon) ────────────────────────────────────────

app.get('/api/pipeon/projects', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const docs = await client.db(PIPEON_DB).collection('pipeon_projects')
      .find({}).sort({ name: 1 }).toArray();
    res.json({ documents: docs.map(d => ({ ...d, _id: d._id.toString() })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

app.post('/api/pipeon/projects', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const result = await client.db(PIPEON_DB).collection('pipeon_projects')
      .insertOne({ ...req.body, createdAt: new Date().toISOString() });
    res.json({ insertedId: result.insertedId.toString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

app.post('/api/pipeon/projects/:id/update', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    await client.db(PIPEON_DB).collection('pipeon_projects')
      .updateOne({ _id: new ObjectId(req.params.id) }, { $set: req.body });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

app.post('/api/pipeon/projects/:id/delete', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    await client.db(PIPEON_DB).collection('pipeon_projects')
      .deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

// ── Procedures Catalog (sempre no banco pipeon) ───────────────────────────────

app.get('/api/pipeon/procedures', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const filter = req.query.projectId ? { projectId: req.query.projectId } : {};
    const docs = await client.db(PIPEON_DB).collection('pipeon_procedures')
      .find(filter).sort({ order: 1, name: 1, _id: 1 }).toArray();
    res.json({ documents: docs.map(d => ({ ...d, _id: d._id.toString() })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

app.post('/api/pipeon/procedures', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const result = await client.db(PIPEON_DB).collection('pipeon_procedures')
      .insertOne({ ...req.body, createdAt: new Date().toISOString() });
    res.json({ insertedId: result.insertedId.toString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

app.post('/api/pipeon/procedures/:id/update', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    await client.db(PIPEON_DB).collection('pipeon_procedures')
      .updateOne({ _id: new ObjectId(req.params.id) }, { $set: req.body });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

app.post('/api/pipeon/procedures/:id/delete', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    await client.db(PIPEON_DB).collection('pipeon_procedures')
      .deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

// ── Operations (sempre no banco pipeon) ──────────────────────────────────────

app.get('/api/pipeon/operations', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const filter = {};
    if (req.query.ticketId) filter.ticketId = req.query.ticketId;
    if (req.query.procedureId) filter.procedureId = req.query.procedureId;
    if (req.query.projectId) filter.projectId = req.query.projectId;
    const docs = await client.db(PIPEON_DB).collection('pipeon_operations')
      .find(filter).sort({ executedAt: -1 }).limit(limit).toArray();
    res.json({ documents: docs.map(d => ({ ...d, _id: d._id.toString() })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

app.post('/api/pipeon/operations', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const result = await client.db(PIPEON_DB).collection('pipeon_operations')
      .insertOne(req.body);
    res.json({ insertedId: result.insertedId.toString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});


// ── Pipeon Logs (sempre no banco pipeon) ──────────────────────────────────────

app.get('/api/pipeon/logs', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const docs = await client.db(PIPEON_DB).collection('pipeon_logs')
      .find({})
      .sort({ executedAt: -1 })
      .limit(limit)
      .toArray();
    res.json({ documents: docs.map(d => ({ ...d, _id: d._id.toString() })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

app.post('/api/pipeon/logs', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const result = await client.db(PIPEON_DB).collection('pipeon_logs').insertOne(req.body);
    res.json({ insertedId: result.insertedId.toString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

// ── Backup creation (server-side fetch → save to pipeon) ──────────────────────

app.post('/api/pipeon/backup/create', verifyToken, async (req, res) => {
  const { noticeId, evaluatorUserId, ticket, evaluatorName, evaluatorEmail, database, connectionString } = req.body;
  if (!noticeId || !evaluatorUserId) {
    return res.status(400).json({ error: 'noticeId e evaluatorUserId sao obrigatorios.' });
  }

  const targetConnStr = connectionString || DEFAULT_MONGO;
  const targetDb = database || 'target-database';
  const targetClient = new MongoClient(targetConnStr);
  const pipeonClient = new MongoClient(PIPEON_MONGO);

  try {
    await targetClient.connect();
    await pipeonClient.connect();

    const filter = {
      notice: new ObjectId(noticeId),
      'noticeEvaluator.userId': new ObjectId(evaluatorUserId),
    };

    const docs = await targetClient.db(targetDb).collection('evaluations')
      .find(filter).limit(100000).toArray();

    const result = await pipeonClient.db(PIPEON_DB).collection('pipeon_auto_backups').insertOne({
      ticket: ticket || '',
      noticeId,
      evaluatorUserId,
      evaluatorName: evaluatorName || '',
      evaluatorEmail: evaluatorEmail || '',
      database: targetDb,
      documentCount: docs.length,
      documents: docs,
      executionType: 'manual',
      createdAt: new Date().toISOString(),
    });

    res.json({ backupId: result.insertedId.toString(), documentCount: docs.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await targetClient.close();
    await pipeonClient.close();
  }
});

// ── Backup genérico (pré-procedimento) ────────────────────────────────────────

app.post('/api/pipeon/backup/create-generic', verifyToken, async (req, res) => {
  const { collection, filter, ticket, database, connectionString } = req.body;
  if (!collection) return res.status(400).json({ error: '"collection" é obrigatório.' });

  const targetConnStr = connectionString || DEFAULT_MONGO;
  const targetDb = database || 'target-database';
  const targetClient = new MongoClient(targetConnStr);
  const pipeonClient = new MongoClient(PIPEON_MONGO);

  try {
    await targetClient.connect();
    await pipeonClient.connect();

    const resolvedFilter = resolveExtendedJson(filter || {});
    const docs = await targetClient.db(targetDb).collection(collection)
      .find(resolvedFilter).limit(10000).toArray();

    const result = await pipeonClient.db(PIPEON_DB).collection('pipeon_auto_backups').insertOne({
      ticket: ticket || '',
      collection,
      filter: JSON.stringify(filter || {}),
      database: targetDb,
      documentCount: docs.length,
      documents: docs,
      executionType: 'pre-procedure',
      createdAt: new Date().toISOString(),
    });

    res.json({ backupId: result.insertedId.toString(), documentCount: docs.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await targetClient.close();
    await pipeonClient.close();
  }
});

// ── Buscar backup por ID ───────────────────────────────────────────────────────

app.get('/api/pipeon/backup/:id', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const doc = await client.db(PIPEON_DB).collection('pipeon_auto_backups')
      .findOne({ _id: new ObjectId(req.params.id) });
    if (!doc) return res.status(404).json({ error: 'Backup não encontrado.' });
    res.json({ ...doc, _id: doc._id.toString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

// ── Changelogs de procedimentos ────────────────────────────────────────────────

app.get('/api/pipeon/changelogs', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const filter = {};
    if (req.query.ticketId) filter.ticket = req.query.ticketId;
    if (req.query.procedureId) filter.procedureId = req.query.procedureId;
    const docs = await client.db(PIPEON_DB).collection('pipeon_changelogs')
      .find(filter).sort({ executedAt: -1 }).limit(limit).toArray();
    res.json({ documents: docs.map(d => ({ ...d, _id: d._id.toString() })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

app.post('/api/pipeon/changelogs', verifyToken, async (req, res) => {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const result = await client.db(PIPEON_DB).collection('pipeon_changelogs')
      .insertOne({ ...req.body, savedAt: new Date().toISOString() });
    res.json({ insertedId: result.insertedId.toString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.close();
  }
});

// ── Auto-execution logic ───────────────────────────────────────────────────────

async function executeProcedure(proc) {
  const targetConnStr = proc.connectionString || DEFAULT_MONGO;
  const targetDb = proc.database || 'target-database';

  const targetClient = new MongoClient(targetConnStr);
  const pipeonClient = new MongoClient(PIPEON_MONGO);

  try {
    await targetClient.connect();
    await pipeonClient.connect();

    const filter = {
      notice: new ObjectId(proc.noticeId),
      'noticeEvaluator.userId': new ObjectId(proc.evaluatorUserId),
    };

    // Etapa 1 — Backup salvo no banco pipeon
    const backupDocs = await targetClient.db(targetDb).collection('evaluations')
      .find(filter).limit(100000).toArray();

    await pipeonClient.db(PIPEON_DB).collection('pipeon_auto_backups').insertOne({
      scheduledId: proc._id.toString(),
      ticket: proc.ticket,
      noticeId: proc.noticeId,
      evaluatorUserId: proc.evaluatorUserId,
      evaluatorName: proc.evaluatorName,
      evaluatorEmail: proc.evaluatorEmail,
      database: targetDb,
      documentCount: backupDocs.length,
      documents: backupDocs,
      createdAt: new Date().toISOString(),
    });

    // Etapa 2 — Reset status para NOTSTARTED
    const r2 = await targetClient.db(targetDb).collection('evaluations').updateMany(filter, {
      $set: { status: 'NOTSTARTED' },
      $unset: {
        evaluationAverage: '',
        evaluationAverageByBlocks: '',
        evaluationSum: '',
        submittedDate: '',
        evaluatorNote: '',
      },
    });

    // Etapa 3 — Limpar campos do formulário
    const r3 = await targetClient.db(targetDb).collection('evaluations').updateMany(filter, {
      $unset: {
        'phaseForm.blocks.$[].fields.$[].value': '',
        'phaseForm.blocks.$[].sumValue': '',
      },
    });

    // Log sempre no banco pipeon (nunca no target-database)
    await pipeonClient.db(PIPEON_DB).collection('pipeon_logs').insertOne({
      ticket: proc.ticket,
      procedureName: proc.procedureName,
      noticeId: proc.noticeId,
      evaluatorName: proc.evaluatorName,
      evaluatorEmail: proc.evaluatorEmail,
      executedBy: 'sistema (automático)',
      executedByName: 'Sistema',
      database: targetDb,
      executedAt: new Date().toISOString(),
      affectedCount: r2.modifiedCount,
      autoExecuted: true,
      scheduledId: proc._id.toString(),
      steps: [
        {
          name: 'Backup automático',
          detail: `${backupDocs.length} documento(s) salvo(s) em pipeon_auto_backups (banco ${PIPEON_DB})`,
          changes: [],
        },
        {
          name: 'Reset de status',
          detail: `${r2.modifiedCount} avaliação(ões) retornada(s) para NOTSTARTED`,
          changes: [
            '$set: status → NOTSTARTED',
            '$unset: evaluationAverage, evaluationAverageByBlocks, evaluationSum, submittedDate, evaluatorNote',
          ],
        },
        {
          name: 'Limpeza de formulário',
          detail: `${r3.modifiedCount} documento(s) com campos limpos`,
          changes: ['$unset: phaseForm.blocks[].fields[].value, phaseForm.blocks[].sumValue'],
        },
      ],
    });

    // Marcar como executado no banco pipeon
    await pipeonClient.db(PIPEON_DB).collection('pipeon_scheduled').updateOne(
      { _id: proc._id },
      { $set: { status: 'executed', executedAt: new Date().toISOString(), autoExecuted: true } }
    );

    // Se recorrente, cria próxima ocorrência para amanhã no mesmo horário
    if (proc.recurring && proc.recurringTime) {
      const next = new Date();
      next.setDate(next.getDate() + 1);
      const [h, m] = proc.recurringTime.split(':').map(Number);
      next.setHours(h, m, 0, 0);

      await pipeonClient.db(PIPEON_DB).collection('pipeon_scheduled').insertOne({
        procedureName: proc.procedureName,
        ticket: proc.ticket,
        noticeId: proc.noticeId,
        evaluatorUserId: proc.evaluatorUserId,
        evaluatorName: proc.evaluatorName,
        evaluatorEmail: proc.evaluatorEmail,
        scheduledFor: next.toISOString(),
        scheduledBy: proc.scheduledBy,
        database: proc.database,
        connectionString: proc.connectionString,
        recurring: proc.recurring,
        recurringTime: proc.recurringTime,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }

    return { success: true, modifiedCount: r2.modifiedCount };
  } finally {
    await targetClient.close();
    await pipeonClient.close();
  }
}

// ── Cron: execução automática a cada minuto ────────────────────────────────────

let cronRunning = false;

cron.schedule('* * * * *', async () => {
  if (cronRunning) return;
  cronRunning = true;

  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const now = new Date().toISOString();
    const pending = await client.db(PIPEON_DB).collection('pipeon_scheduled')
      .find({ status: 'pending', scheduledFor: { $lte: now } })
      .toArray();

    if (pending.length === 0) return;

    console.log(`[cron] ${pending.length} procedimento(s) para executar...`);

    for (const proc of pending) {
      try {
        const result = await executeProcedure(proc);
        console.log(`[cron] ✓ Executado: #${proc.ticket} — ${proc.evaluatorName} (${result.modifiedCount} docs)`);
      } catch (e) {
        console.error(`[cron] ✗ Falha em #${proc.ticket}: ${e.message}`);
        try {
          await client.db(PIPEON_DB).collection('pipeon_scheduled').updateOne(
            { _id: proc._id },
            { $set: { status: 'failed', failedAt: new Date().toISOString(), failError: e.message } }
          );
        } catch { /* ignora falha ao salvar status de erro */ }
      }
    }
  } catch (e) {
    console.error('[cron] Erro no scheduler:', e.message);
  } finally {
    cronRunning = false;
    await client.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('\nPipeon Local API rodando em http://localhost:' + PORT);
  console.log('Banco Pipeon  : ' + PIPEON_MONGO + PIPEON_DB);
  console.log('Banco padrão  : ' + DEFAULT_MONGO);
  console.log('Scheduler     : verificando procedimentos a cada minuto\n');
});
