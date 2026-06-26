/**
 * Remove o campo `nucleo` de todos os procedimentos já inseridos no banco.
 * Execute uma única vez para corrigir os procedimentos criados pelo seed anterior.
 *
 * Uso:
 *   cd local-api
 *   node clear-procedure-nucleos.js
 */

require('dotenv').config();

const { MongoClient } = require('mongodb');

const PIPEON_MONGO = process.env.PIPEON_MONGO_URL || 'mongodb://localhost:27017/';
const PIPEON_DB    = process.env.PIPEON_DB_NAME   || 'pipeon';

async function run() {
  const client = new MongoClient(PIPEON_MONGO);
  try {
    await client.connect();
    const col = client.db(PIPEON_DB).collection('pipeon_procedures');
    const result = await col.updateMany(
      { nucleo: { $exists: true } },
      { $unset: { nucleo: '' } },
    );
    console.log(`✓ ${result.modifiedCount} procedimento(s) com nucleo removido.`);
  } finally {
    await client.close();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
