const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DATABASE_URL = process.env.DATABASE_URL;
// DB file at root directory of project to reuse existing database
const DB_FILE = path.join(__dirname, '../parkospace.db');

let pool = null;
let usePostgres = false;

console.log("\n" + "=" * 60);
console.log(" PARKOSPACE DATABASE INITIALIZATION");
if (!DATABASE_URL) {
  console.log(" [INFO] No DATABASE_URL found in .env, defaulting to SQLite.");
} else {
  console.log(" [INFO] DATABASE_URL found, attempting PostgreSQL connection...");
}
console.log("=" * 60);

// Get a connection / client wrapper
// For postgres, we use the connection pool.
// For sqlite, we open the database file.
function getDbConnection() {
  if (DATABASE_URL && (DATABASE_URL.includes("postgres") || DATABASE_URL.includes("postgresql"))) {
    if (!pool) {
      pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false } // match sslmode=require
      });
    }
    usePostgres = true;
    return pool;
  }
  usePostgres = false;
  return new sqlite3.Database(DB_FILE);
}

// Helper to run query (for both postgres and sqlite)
function queryAll(sql, params = []) {
  const db = getDbConnection();
  if (usePostgres) {
    return db.query(sql, params).then(res => res.rows);
  } else {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        db.close();
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

function queryRun(sql, params = []) {
  const db = getDbConnection();
  if (usePostgres) {
    return db.query(sql, params).then(res => res.rowCount);
  } else {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        db.close();
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }
}

function queryOne(sql, params = []) {
  const db = getDbConnection();
  if (usePostgres) {
    return db.query(sql, params).then(res => res.rows[0] || null);
  } else {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        db.close();
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }
}

// Execute direct query on client
async function runInitSql(db, sql) {
  if (usePostgres) {
    await db.query(sql);
  } else {
    await new Promise((resolve, reject) => {
      db.run(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

async function initDb() {
  const db = getDbConnection();

  if (usePostgres) {
    console.log(" [SUCCESS] Connected & Initializing Supabase (PostgreSQL)...");
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS owners (
          phone TEXT PRIMARY KEY,
          name TEXT,
          email TEXT UNIQUE,
          password_hash TEXT,
          joined_at DOUBLE PRECISION
        );
      `);

      // Migrations
      try { await db.query("ALTER TABLE owners ADD COLUMN IF NOT EXISTS email TEXT;"); } catch (e) {}
      try { await db.query("ALTER TABLE owners ADD COLUMN IF NOT EXISTS password_hash TEXT;"); } catch (e) {}
      try { await db.query("ALTER TABLE owners ADD CONSTRAINT owners_email_unique UNIQUE (email);"); } catch (e) {}

      await db.query(`
        CREATE TABLE IF NOT EXISTS listings (
          id TEXT PRIMARY KEY,
          title TEXT,
          "desc" TEXT,
          price_hourly DOUBLE PRECISION,
          price_daily DOUBLE PRECISION,
          price_monthly DOUBLE PRECISION,
          lat DOUBLE PRECISION,
          lng DOUBLE PRECISION,
          length DOUBLE PRECISION,
          breadth DOUBLE PRECISION,
          amenities TEXT,
          gmap_link TEXT,
          gmap_link_regen TEXT,
          image TEXT,
          owner_phone TEXT REFERENCES owners(phone),
          is_sold BOOLEAN,
          created_at DOUBLE PRECISION,
          address_text TEXT,
          area_landmark TEXT
        );
      `);
      try { await db.query("ALTER TABLE listings ADD COLUMN IF NOT EXISTS area_landmark TEXT;"); } catch (e) {}
      try { await db.query("ALTER TABLE listings ADD COLUMN IF NOT EXISTS gmap_link_regen TEXT;"); } catch (e) {}

      // Enable RLS for Postgres if possible
      try {
        await db.query("ALTER TABLE owners ENABLE ROW LEVEL SECURITY;");
        await db.query("ALTER TABLE listings ENABLE ROW LEVEL SECURITY;");
      } catch (rlsErr) {
        console.log(` [WARNING] Could not enable RLS on startup: ${rlsErr.message}`);
      }

      // Ensure ON UPDATE CASCADE is set on the foreign key constraint
      try {
        await db.query("ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_owner_phone_fkey;");
        await db.query("ALTER TABLE listings ADD CONSTRAINT listings_owner_phone_fkey FOREIGN KEY (owner_phone) REFERENCES owners(phone) ON UPDATE CASCADE;");
        console.log(" [SUCCESS] Altered listings foreign key constraint to ON UPDATE CASCADE.");
      } catch (fkErr) {
        console.log(` [WARNING] Could not alter listings foreign key constraint: ${fkErr.message}`);
      }
    } catch (e) {
      console.log(` [ERROR] PG Init Error: ${e.message}`);
    }
  } else {
    console.log(" [INFO] Initializing Local SQLite Tables...");
    // For SQLite, do sequence of table setup
    const initSql = [
      `CREATE TABLE IF NOT EXISTS owners (
        phone TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        password_hash TEXT,
        joined_at REAL
      )`,
      `CREATE TABLE IF NOT EXISTS listings (
        id TEXT PRIMARY KEY,
        title TEXT,
        desc TEXT,
        price_hourly REAL,
        price_daily REAL,
        price_monthly REAL,
        lat REAL,
        lng REAL,
        length REAL,
        breadth REAL,
        amenities TEXT,
        gmap_link TEXT,
        gmap_link_regen TEXT,
        image TEXT,
        owner_phone TEXT,
        is_sold INTEGER,
        created_at REAL,
        address_text TEXT,
        area_landmark TEXT,
        FOREIGN KEY(owner_phone) REFERENCES owners(phone)
      )`
    ];

    await new Promise((resolve) => {
      db.serialize(async () => {
        db.run(initSql[0]);
        // Run sqlite migrations
        db.run("ALTER TABLE owners ADD COLUMN email TEXT", () => {});
        db.run("ALTER TABLE owners ADD COLUMN password_hash TEXT", () => {});
        db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_owners_email ON owners(email)", () => {});
        
        db.run(initSql[1]);
        db.run("ALTER TABLE listings ADD COLUMN address_text TEXT", () => {});
        db.run("ALTER TABLE listings ADD COLUMN area_landmark TEXT", () => {});
        db.run("ALTER TABLE listings ADD COLUMN gmap_link_regen TEXT", () => {});
        resolve();
      });
    });
    db.close();
  }
}

// Database Operations

async function dbGetListings(ownerPhone = null) {
  let sql = "SELECT * FROM listings";
  let params = [];
  if (ownerPhone) {
    sql += " WHERE owner_phone = " + (usePostgres ? "$1" : "?");
    params.push(ownerPhone);
  }
  const rows = await queryAll(sql, params);
  return rows.map(row => {
    // Parse amenities from JSON string to array
    let amenities = [];
    if (row.amenities) {
      try {
        amenities = JSON.parse(row.amenities);
      } catch (e) {
        amenities = [];
      }
    }
    return {
      ...row,
      amenities,
      is_sold: Boolean(row.is_sold),
      gmap_link_regen: row.gmap_link_regen || row.gmap_link || '#'
    };
  });
}

async function dbAddListing(data) {
  const amenitiesJson = JSON.stringify(data.amenities || []);
  let isSoldVal = data.is_sold;
  if (!usePostgres) {
    isSoldVal = isSoldVal ? 1 : 0;
  }
  const gmapRegen = data.gmap_link_regen || data.gmap_link || '#';

  let sql, params;
  if (usePostgres) {
    sql = `
      INSERT INTO listings (id, title, "desc", area_landmark, price_hourly, price_daily, price_monthly, lat, lng, length, breadth, amenities, gmap_link, gmap_link_regen, image, owner_phone, is_sold, created_at, address_text)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    `;
  } else {
    sql = `
      INSERT INTO listings (id, title, desc, area_landmark, price_hourly, price_daily, price_monthly, lat, lng, length, breadth, amenities, gmap_link, gmap_link_regen, image, owner_phone, is_sold, created_at, address_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
  }

  params = [
    data.id, data.title, data.desc, data.area_landmark || '',
    data.price_hourly, data.price_daily, data.price_monthly,
    data.lat, data.lng, data.length, data.breadth,
    amenitiesJson, data.gmap_link, gmapRegen, data.image, data.owner_phone,
    isSoldVal, data.created_at, data.address_text || ''
  ];

  await queryRun(sql, params);
}

async function dbUpdateListing(lid, data, ownerPhone) {
  let isSoldVal = data.is_sold;
  if (!usePostgres) {
    isSoldVal = isSoldVal ? 1 : 0;
  }
  const gmapRegen = data.gmap_link_regen || data.gmap_link || '#';
  const amenitiesJson = JSON.stringify(data.amenities || []);

  let fields = [
    'title', 'desc', 'area_landmark', 'length', 'breadth',
    'price_hourly', 'price_daily', 'price_monthly',
    'gmap_link', 'gmap_link_regen', 'is_sold', 'amenities'
  ];
  if (usePostgres) {
    fields = [
      'title', '"desc"', 'area_landmark', 'length', 'breadth',
      'price_hourly', 'price_daily', 'price_monthly',
      'gmap_link', 'gmap_link_regen', 'is_sold', 'amenities'
    ];
  }

  const params = [
    data.title, data.desc, data.area_landmark || '',
    data.length, data.breadth,
    data.price_hourly, data.price_daily, data.price_monthly,
    data.gmap_link, gmapRegen, isSoldVal, amenitiesJson
  ];

  let sql = `UPDATE listings SET ${fields.map((f, i) => `${f} = ${usePostgres ? `$${i+1}` : '?'}`).join(', ')}`;

  if (data.lat !== undefined && data.lat !== null) {
    const latIdx = params.length + 1;
    sql += `, lat = ${usePostgres ? `$${latIdx}` : '?'}, lng = ${usePostgres ? `$${latIdx+1}` : '?'}, address_text = ${usePostgres ? `$${latIdx+2}` : '?'}`;
    params.push(data.lat, data.lng, data.address_text || '');
  }

  const whereIdx1 = params.length + 1;
  const whereIdx2 = params.length + 2;
  sql += ` WHERE id = ${usePostgres ? `$${whereIdx1}` : '?'} AND owner_phone = ${usePostgres ? `$${whereIdx2}` : '?'}`;
  params.push(lid, ownerPhone);

  const changes = await queryRun(sql, params);
  return changes > 0;
}

async function dbDeleteListing(lid, ownerPhone) {
  const sql = `DELETE FROM listings WHERE id = ${usePostgres ? '$1' : '?'} AND owner_phone = ${usePostgres ? '$2' : '?'}`;
  const changes = await queryRun(sql, [lid, ownerPhone]);
  return changes > 0;
}

async function dbGetOwner(phone) {
  const sql = `SELECT * FROM owners WHERE phone = ${usePostgres ? '$1' : '?'}`;
  return await queryOne(sql, [phone]);
}

async function dbGetOwnerByEmail(email) {
  const sql = `SELECT * FROM owners WHERE email = ${usePostgres ? '$1' : '?'}`;
  return await queryOne(sql, [email]);
}

async function dbSaveOwner(data) {
  let sql, params;
  if (usePostgres) {
    sql = `
      INSERT INTO owners (phone, name, email, password_hash, joined_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (phone) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        password_hash = COALESCE(EXCLUDED.password_hash, owners.password_hash)
    `;
    params = [data.phone, data.name, data.email || '', data.password_hash, data.joined_at];
  } else {
    sql = "INSERT OR REPLACE INTO owners (phone, name, email, password_hash, joined_at) VALUES (?, ?, ?, ?, ?)";
    params = [data.phone, data.name, data.email || '', data.password_hash, data.joined_at];
  }
  await queryRun(sql, params);
}

async function dbUpdatePassword(phone, passwordHash) {
  const sql = `UPDATE owners SET password_hash = ${usePostgres ? '$1' : '?'} WHERE phone = ${usePostgres ? '$2' : '?'}`;
  await queryRun(sql, [passwordHash, phone]);
}

async function dbUpdateOwnerProfile(oldPhone, newPhone, newName) {
  const isPg = usePostgres;

  // 1. If phone changed, check if new phone is already registered by another account
  if (oldPhone !== newPhone) {
    const existing = await dbGetOwner(newPhone);
    if (existing) {
      throw new Error("Phone number is already registered by another account.");
    }
  }

  if (isPg) {
    // Under Postgres, listings.owner_phone has ON UPDATE CASCADE, so updating owners table
    // will automatically update listings.owner_phone.
    const sql = "UPDATE owners SET phone = $1, name = $2 WHERE phone = $3";
    await queryRun(sql, [newPhone, newName, oldPhone]);
  } else {
    // For SQLite, we perform updates manually on both tables since FK is not enforced by default
    await queryRun("UPDATE listings SET owner_phone = ? WHERE owner_phone = ?", [newPhone, oldPhone]);
    await queryRun("UPDATE owners SET phone = ?, name = ? WHERE phone = ?", [newPhone, newName, oldPhone]);
  }
}

module.exports = {
  initDb,
  dbGetListings,
  dbAddListing,
  dbUpdateListing,
  dbDeleteListing,
  dbGetOwner,
  dbGetOwnerByEmail,
  dbSaveOwner,
  dbUpdatePassword,
  dbUpdateOwnerProfile,
  getIsPostgres: () => usePostgres
};
