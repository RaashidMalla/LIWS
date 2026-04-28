const mysql    = require('mysql2/promise');
const settings = require('./settings');

let connection = null;

function disconnect() {
  if (connection) {
    try { connection.end(); } catch (_) {}
    connection = null;
  }
}

async function connectDB() {
  if (connection) {
    try { await connection.ping(); return { success: true }; }
    catch (_) { disconnect(); }
  }
  try {
    const cfg = settings.get('mysql') || {};
    connection = await mysql.createConnection({
      host:     cfg.host     || '127.0.0.1',
      port:     cfg.port     || 3306,
      user:     cfg.user     || 'root',
      password: cfg.password || '',
      multipleStatements: false
    });
    return { success: true };
  } catch (e) {
    connection = null;
    return { success: false, msg: e.message };
  }
}

async function ensureConnection() {
  if (!connection) {
    const r = await connectDB();
    if (!r.success) throw new Error(r.msg || 'Not connected to MySQL');
  }
}

async function listDatabases() {
  await ensureConnection();
  const [rows] = await connection.query('SHOW DATABASES');
  return rows.map(r => r.Database);
}

async function listTables(dbName) {
  await ensureConnection();
  const [rows] = await connection.query(
    `SELECT TABLE_NAME AS name, TABLE_ROWS AS rows FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
    [dbName]
  );
  return rows;
}

async function createDatabase(name) {
  await ensureConnection();
  await connection.query(`CREATE DATABASE \`${name.replace(/`/g, '')}\``);
  return { success: true };
}

async function dropDatabase(name) {
  await ensureConnection();
  await connection.query(`DROP DATABASE \`${name.replace(/`/g, '')}\``);
  return { success: true };
}

async function runQuery(sql, dbName) {
  await ensureConnection();
  try {
    if (dbName) await connection.query(`USE \`${dbName.replace(/`/g, '')}\``);
    const [result, fields] = await connection.query(sql);
    if (Array.isArray(result)) {
      return {
        success: true,
        type: 'select',
        columns: fields ? fields.map(f => f.name) : (result[0] ? Object.keys(result[0]) : []),
        rows: result
      };
    }
    return {
      success: true,
      type: 'write',
      affectedRows: result.affectedRows,
      message: `Query OK — ${result.affectedRows} row(s) affected`
    };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

async function getTableRows(dbName, table) {
  await ensureConnection();
  const safeDb = dbName.replace(/`/g, '');
  const safeTable = table.replace(/`/g, '');
  const [rows, fields] = await connection.query(
    `SELECT * FROM \`${safeDb}\`.\`${safeTable}\` LIMIT 100`
  );
  return {
    columns: fields.map(f => f.name),
    rows
  };
}

async function updateRow(dbName, table, id, data) {
  await ensureConnection();
  const safeDb = dbName.replace(/`/g, '');
  const safeTable = table.replace(/`/g, '');
  const cols = Object.keys(data);
  if (cols.length === 0) return { success: false, msg: 'No fields to update' };
  const setClause = cols.map(c => `\`${c.replace(/`/g, '')}\` = ?`).join(', ');
  const values = cols.map(c => data[c]);
  values.push(id);
  await connection.query(
    `UPDATE \`${safeDb}\`.\`${safeTable}\` SET ${setClause} WHERE id = ?`,
    values
  );
  return { success: true };
}

async function deleteRow(dbName, table, id) {
  await ensureConnection();
  const safeDb = dbName.replace(/`/g, '');
  const safeTable = table.replace(/`/g, '');
  await connection.query(
    `DELETE FROM \`${safeDb}\`.\`${safeTable}\` WHERE id = ?`,
    [id]
  );
  return { success: true };
}

module.exports = {
  connectDB,
  disconnect,
  listDatabases,
  listTables,
  createDatabase,
  dropDatabase,
  runQuery,
  getTableRows,
  updateRow,
  deleteRow
};
