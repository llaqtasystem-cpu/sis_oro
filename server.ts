import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import fs from "fs";
import crypto from "crypto";

const db = new Database("database.sqlite");

// Initialize Database Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    pin TEXT NOT NULL,
    role TEXT NOT NULL,
    branchId TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS materials (
    id TEXT PRIMARY KEY,
    receiptNumber TEXT NOT NULL,
    client TEXT NOT NULL,
    initialWeight REAL NOT NULL,
    finalWeight REAL NOT NULL,
    marketPrice REAL NOT NULL,
    loss REAL NOT NULL,
    purity REAL NOT NULL,
    usdToBs REAL NOT NULL,
    pricePerGram REAL NOT NULL,
    lossPercentage REAL,
    registrationDate TEXT NOT NULL,
    total REAL NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    createdBy TEXT NOT NULL,
    sourceMaterials TEXT
  );

  CREATE TABLE IF NOT EXISTS smeltingOperations (
    id TEXT PRIMARY KEY,
    sourceMaterialIds TEXT NOT NULL,
    resultMaterialId TEXT NOT NULL,
    date TEXT NOT NULL,
    totalInitialWeight REAL NOT NULL,
    totalFinalWeight REAL NOT NULL,
    marketPrice REAL DEFAULT 0,
    loss REAL DEFAULT 0,
    purity REAL DEFAULT 0,
    usdToBs REAL DEFAULT 0,
    pricePerGram REAL DEFAULT 0,
    total REAL DEFAULT 0,
    createdBy TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exportOperations (
    id TEXT PRIMARY KEY,
    sourceMaterialIds TEXT NOT NULL,
    date TEXT NOT NULL,
    totalWeight REAL NOT NULL,
    marketPrice REAL NOT NULL,
    pricePerGram REAL NOT NULL,
    salePrice REAL NOT NULL,
    createdBy TEXT NOT NULL,
    client TEXT NOT NULL,
    receiptNumber TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS companySettings (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    taxId TEXT,
    logoUrl TEXT,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    abbreviation TEXT NOT NULL,
    location TEXT,
    phone TEXT,
    managerId TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    ci TEXT,
    workplace TEXT,
    isMineCooperative INTEGER DEFAULT 0,
    recommendedBy TEXT,
    referentialPhone TEXT,
    branchId TEXT NOT NULL,
    branchName TEXT,
    registeredBy TEXT,
    createdAt TEXT NOT NULL,
    UNIQUE(ci, branchId)
  );

  CREATE TABLE IF NOT EXISTS referrers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone1 TEXT NOT NULL,
    phone2 TEXT,
    ci TEXT,
    branchId TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    UNIQUE(ci, branchId)
  );
`);

// Migration: Make referrers.ci nullable if it's currently NOT NULL
try {
  const tableInfo = db.prepare("PRAGMA table_info(referrers)").all() as any[];
  const ciCol = tableInfo.find(c => c.name === 'ci');
  if (ciCol && ciCol.notnull === 1) {
    db.transaction(() => {
      db.prepare("CREATE TABLE referrers_new (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone1 TEXT NOT NULL, phone2 TEXT, ci TEXT, branchId TEXT NOT NULL, createdAt TEXT NOT NULL, UNIQUE(ci, branchId))").run();
      db.prepare("INSERT INTO referrers_new SELECT id, name, phone1, phone2, ci, branchId, createdAt FROM referrers").run();
      db.prepare("DROP TABLE referrers").run();
      db.prepare("ALTER TABLE referrers_new RENAME TO referrers").run();
    })();
    console.log("Migration: referrers.ci is now nullable");
  }
} catch (err) {
  console.error("Migration error:", err);
}

// Migration: Ensure all clients columns exist
db.exec(`
  CREATE TABLE IF NOT EXISTS referrerPayouts (
    id TEXT PRIMARY KEY,
    referrerId TEXT NOT NULL,
    referrerName TEXT NOT NULL,
    purchaseIds TEXT NOT NULL,
    purchaseReceipts TEXT NOT NULL,
    totalAmount REAL NOT NULL,
    paidAt TEXT NOT NULL,
    paidBy TEXT NOT NULL,
    branchId TEXT NOT NULL,
    notes TEXT,
    FOREIGN KEY (referrerId) REFERENCES referrers(id)
  );

  CREATE TABLE IF NOT EXISTS goldPurchases (
    id TEXT PRIMARY KEY,
    receiptNumber TEXT NOT NULL,
    branchId TEXT NOT NULL,
    clientId TEXT NOT NULL,
    total REAL NOT NULL,
    type TEXT NOT NULL, -- 'abierto' | 'cerrado'
    referrerName TEXT,
    commission REAL DEFAULT 0,
    advancePayment REAL DEFAULT 0,
    createdBy TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    closedAt TEXT,
    closedBy TEXT,
    closeMarketPrice REAL,
    closeUsdToBs REAL,
    closeTotal REAL
  );

  CREATE TABLE IF NOT EXISTS goldPurchaseItems (
    id TEXT PRIMARY KEY,
    purchaseId TEXT NOT NULL,
    initialWeight REAL NOT NULL,
    finalWeight REAL NOT NULL,
    marketPrice REAL NOT NULL,
    purity REAL NOT NULL,
    pricePerGram REAL NOT NULL,
    total REAL NOT NULL,
    usdToBs REAL NOT NULL,
    loss REAL NOT NULL,
    lossPercentage REAL,
    type TEXT DEFAULT 'pieza',
    createdBy TEXT,
    closeMarketPrice REAL,
    closeUsdToBs REAL,
    closePricePerGram REAL,
    closeTotal REAL,
    FOREIGN KEY (purchaseId) REFERENCES goldPurchases(id) ON DELETE CASCADE
  );
`);

// Migration: Ensure all clients columns exist
const clientColumns = db.prepare("PRAGMA table_info(clients)").all();
const clientColumnNames = clientColumns.map((c: any) => c.name);

const requiredClientColumns = ['ci', 'workplace', 'isMineCooperative', 'branchName', 'registeredBy', 'referentialPhone'];
const missingColumns = requiredClientColumns.filter(col => !clientColumnNames.includes(col));

if (missingColumns.length > 0) {
  console.log(`Migrating clients table to include missing fields: ${missingColumns.join(', ')}...`);
  try {
    db.transaction(() => {
      if (!clientColumnNames.includes('ci')) db.exec("ALTER TABLE clients ADD COLUMN ci TEXT");
      if (!clientColumnNames.includes('workplace')) db.exec("ALTER TABLE clients ADD COLUMN workplace TEXT");
      if (!clientColumnNames.includes('isMineCooperative')) db.exec("ALTER TABLE clients ADD COLUMN isMineCooperative INTEGER DEFAULT 0");
      if (!clientColumnNames.includes('branchName')) db.exec("ALTER TABLE clients ADD COLUMN branchName TEXT");
      if (!clientColumnNames.includes('registeredBy')) db.exec("ALTER TABLE clients ADD COLUMN registeredBy TEXT");
      if (!clientColumnNames.includes('referentialPhone')) db.exec("ALTER TABLE clients ADD COLUMN referentialPhone TEXT");
    })();
  } catch (error) {
    console.error("Migration failed for clients table:", error);
  }
}
const userColumns = db.prepare("PRAGMA table_info(users)").all();
const userColumnNames = userColumns.map((c: any) => c.name);

if (!userColumnNames.includes('username')) {
  console.log("Migrating users table to include username...");
  try {
    const hasCreatedAt = userColumnNames.includes('createdAt');
    const selectFields = hasCreatedAt 
      ? "id, name, email, email, pin, role, createdAt" 
      : "id, name, email, email, pin, role, CURRENT_TIMESTAMP";

    db.transaction(() => {
      db.exec(`
        CREATE TABLE users_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          username TEXT UNIQUE NOT NULL,
          email TEXT,
          pin TEXT NOT NULL,
          role TEXT NOT NULL,
          branchId TEXT,
          createdAt TEXT NOT NULL
        );
        
        INSERT INTO users_new (id, name, username, email, pin, role, createdAt)
        SELECT ${selectFields} FROM users;
        
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
    })();
    console.log("Migration complete.");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

if (!userColumnNames.includes('branchId')) {
  db.exec("ALTER TABLE users ADD COLUMN branchId TEXT");
  console.log("Added column branchId to users");
}

// Migration: Ensure branches table has abbreviation
const branchColumns = db.prepare("PRAGMA table_info(branches)").all();
const branchColumnNames = branchColumns.map((c: any) => c.name);
if (!branchColumnNames.includes('abbreviation')) {
  db.exec("ALTER TABLE branches ADD COLUMN abbreviation TEXT NOT NULL DEFAULT 'S'");
  console.log("Added column abbreviation to branches");
}

// Migration: Ensure all goldPurchases columns exist and have correct schema
const goldColumns = db.prepare("PRAGMA table_info(goldPurchases)").all();
const goldColumnNames = goldColumns.map((c: any) => c.name);

// If 'initialWeight' exists, it's the old schema. We need to migrate to the batch schema.
if (goldColumnNames.includes('initialWeight')) {
  console.log("Migrating goldPurchases table to batch schema...");
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE goldPurchases_new (
          id TEXT PRIMARY KEY,
          receiptNumber TEXT NOT NULL,
          branchId TEXT NOT NULL,
          clientId TEXT NOT NULL,
          total REAL NOT NULL,
          type TEXT NOT NULL,
          createdBy TEXT NOT NULL,
          createdAt TEXT NOT NULL
        );
        
        CREATE TABLE goldPurchaseItems (
          id TEXT PRIMARY KEY,
          purchaseId TEXT NOT NULL,
          initialWeight REAL NOT NULL,
          finalWeight REAL NOT NULL,
          marketPrice REAL NOT NULL,
          purity REAL NOT NULL,
          pricePerGram REAL NOT NULL,
          total REAL NOT NULL,
          usdToBs REAL NOT NULL,
          loss REAL NOT NULL,
          lossPercentage REAL,
          FOREIGN KEY (purchaseId) REFERENCES goldPurchases_new(id) ON DELETE CASCADE
        );
        
        INSERT INTO goldPurchases_new (
          id, receiptNumber, branchId, clientId, total, type, createdBy, createdAt
        )
        SELECT id, 'MIG-' || id, branchId, clientId, total, type, createdBy, createdAt FROM goldPurchases;
        
        INSERT INTO goldPurchaseItems (
          id, purchaseId, initialWeight, finalWeight, marketPrice, purity, pricePerGram, total, usdToBs, loss
        )
        SELECT id || '-item', id, initialWeight, finalWeight, marketPrice, purity, pricePerGram, total, usdToBs, loss FROM goldPurchases;
        
        DROP TABLE goldPurchases;
        ALTER TABLE goldPurchases_new RENAME TO goldPurchases;
      `);
    })();
    console.log("Migration complete.");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

// Migration: Ensure all companySettings columns exist
const columns = db.prepare("PRAGMA table_info(companySettings)").all();
const columnNames = columns.map((c: any) => c.name);
const requiredColumns = ['address', 'phone', 'email', 'taxId', 'logoUrl'];

requiredColumns.forEach(col => {
  if (!columnNames.includes(col)) {
    db.exec(`ALTER TABLE companySettings ADD COLUMN ${col} TEXT`);
    console.log(`Added column ${col} to companySettings`);
  }
});

// Migration: Ensure all smeltingOperations columns exist
const smeltingColumns = db.prepare("PRAGMA table_info(smeltingOperations)").all();
const smeltingColumnNames = smeltingColumns.map((c: any) => c.name);
const requiredSmeltingColumns = ['marketPrice', 'loss', 'purity', 'usdToBs', 'pricePerGram', 'total'];

requiredSmeltingColumns.forEach(col => {
  if (!smeltingColumnNames.includes(col)) {
    db.exec(`ALTER TABLE smeltingOperations ADD COLUMN ${col} REAL DEFAULT 0`);
    console.log(`Added column ${col} to smeltingOperations`);
  }
});

// Migration: Ensure users table has branchId
if (!userColumnNames.includes('branchId')) {
  db.exec(`ALTER TABLE users ADD COLUMN branchId TEXT`);
  console.log(`Added column branchId to users`);
}

// Migration for lossPercentage
const materialColsReview = db.prepare("PRAGMA table_info(materials)").all();
if (!materialColsReview.map((c: any) => c.name).includes('lossPercentage')) {
  console.log("Migrating materials table for lossPercentage...");
  db.exec("ALTER TABLE materials ADD COLUMN lossPercentage REAL");
}

const purchaseItemColsReview = db.prepare("PRAGMA table_info(goldPurchaseItems)").all();
const pItemColNames = purchaseItemColsReview.map((c: any) => c.name);
if (!pItemColNames.includes('lossPercentage')) {
  console.log("Migrating goldPurchaseItems table for lossPercentage...");
  db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN lossPercentage REAL");
}
if (!pItemColNames.includes('type')) {
  console.log("Migrating goldPurchaseItems table for type...");
  db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN type TEXT DEFAULT 'pieza'");
}
if (!pItemColNames.includes('createdBy')) {
  console.log("Migrating goldPurchaseItems table for createdBy...");
  db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN createdBy TEXT");
}

// Migration for goldPurchases referral fields
const goldPurchasesColsReview = db.prepare("PRAGMA table_info(goldPurchases)").all();
const gpColNames = goldPurchasesColsReview.map((c: any) => c.name);
if (!gpColNames.includes('referrerName')) {
  console.log("Migrating goldPurchases for referrerName...");
  db.exec("ALTER TABLE goldPurchases ADD COLUMN referrerName TEXT");
}
if (!gpColNames.includes('commission')) {
  console.log("Migrating goldPurchases for commission...");
  db.exec("ALTER TABLE goldPurchases ADD COLUMN commission REAL DEFAULT 0");
}
if (!gpColNames.includes('commissionPaid')) {
  console.log("Migrating goldPurchases for commissionPaid...");
  db.exec("ALTER TABLE goldPurchases ADD COLUMN commissionPaid INTEGER DEFAULT 0");
  db.exec("ALTER TABLE goldPurchases ADD COLUMN commissionPaidAt TEXT");
  db.exec("ALTER TABLE goldPurchases ADD COLUMN commissionPaidBy TEXT");
}
if (!gpColNames.includes('advancePayment')) {
  console.log("Migrating goldPurchases for advancePayment...");
  db.exec("ALTER TABLE goldPurchases ADD COLUMN advancePayment REAL DEFAULT 0");
}
if (!gpColNames.includes('closedAt')) {
  console.log("Migrating goldPurchases for closedAt...");
  db.exec("ALTER TABLE goldPurchases ADD COLUMN closedAt TEXT");
}
if (!gpColNames.includes('closedBy')) {
  console.log("Migrating goldPurchases for closedBy...");
  db.exec("ALTER TABLE goldPurchases ADD COLUMN closedBy TEXT");
}
if (!gpColNames.includes('closeMarketPrice')) {
  db.exec("ALTER TABLE goldPurchases ADD COLUMN closeMarketPrice REAL");
  db.exec("ALTER TABLE goldPurchases ADD COLUMN closeUsdToBs REAL");
  db.exec("ALTER TABLE goldPurchases ADD COLUMN closeTotal REAL");
}

const pItemColsReview = db.prepare("PRAGMA table_info(goldPurchaseItems)").all();
const pItemColNamesReview = pItemColsReview.map((c: any) => c.name);
if (!pItemColNamesReview.includes('closeMarketPrice')) {
  db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN closeMarketPrice REAL");
  db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN closeUsdToBs REAL");
  db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN closePricePerGram REAL");
  db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN closeTotal REAL");
}

// Bootstrap default admin if not exists
const adminUsername = "admin";
const adminEmail = "llaqtasystem@gmail.com";

// Check if a user with the admin username or email already exists
const existingByUsername = db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)").get(adminUsername) as any;
const existingByEmail = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)").get(adminEmail) as any;

if (!existingByUsername && !existingByEmail) {
  console.log(`Creating default superadmin: ${adminUsername}`);
  db.prepare(`
    INSERT INTO users (id, name, username, email, pin, role, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    "Super Administrador",
    adminUsername,
    adminEmail,
    "1234", // Default PIN
    "superadmin",
    new Date().toISOString()
  );
} else {
  // If we found a user by email, prioritize that one as the superadmin
  const targetUser = existingByEmail || existingByUsername;
  console.log(`Ensuring superadmin role for: ${targetUser.username}`);
  
  // We only update the username to "admin" if it's not already taken by someone else
  // or if the target user is already the one with that username.
  const canUpdateUsername = !existingByUsername || existingByUsername.id === targetUser.id;
  
  if (canUpdateUsername) {
    db.prepare("UPDATE users SET username = ?, pin = ?, role = ? WHERE id = ?")
      .run(adminUsername, "1234", "superadmin", targetUser.id);
  } else {
    // If username "admin" is taken by another user, just update PIN and role for the email-matched user
    db.prepare("UPDATE users SET pin = ?, role = ? WHERE id = ?")
      .run("1234", "superadmin", targetUser.id);
  }
}

// Bootstrap default settings if not exists
const existingSettings = db.prepare("SELECT * FROM companySettings LIMIT 1").get() as any;
if (!existingSettings) {
  db.prepare(`
    INSERT INTO companySettings (id, name, updatedAt)
    VALUES (?, ?, ?)
  `).run(crypto.randomUUID(), "Aurum Manager - Almacén", new Date().toISOString());
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Request logging middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // --- API Routes ---
  
  // Custom 404 for API routes to avoid returning HTML fallback
  app.all("/api/*", (req, res, next) => {
    // This will be reached if no other /api route matches
    // But we need to define it AFTER all api routes if we want it to be a fallback
    next();
  });

  // Debug route
  app.get("/api/debug/users", (req, res) => {
    const users = db.prepare("SELECT username, email, pin, role FROM users").all();
    res.json(users);
  });

  // Auth
  app.post("/api/auth/login", (req, res) => {
    const { username, pin } = req.body;
    const pinStr = String(pin);
    console.log(`Login attempt for: ${username} with PIN: ${pinStr}`);
    
    // Check both username and email, handling NULL emails safely and making it case-insensitive
    const user = db.prepare(`
      SELECT * FROM users 
      WHERE (LOWER(username) = LOWER(?)) 
      OR (email IS NOT NULL AND LOWER(email) = LOWER(?))
    `).get(username, username) as any;

    if (user) {
      console.log(`User found: ${user.username}, stored PIN: ${user.pin}`);
      if (String(user.pin) === pinStr) {
        console.log(`Login successful for: ${username}`);
        res.json(user);
      } else {
        console.log(`Incorrect PIN for: ${username}. Expected: ${user.pin}, Received: ${pinStr}`);
        res.status(401).json({ error: "PIN incorrecto" });
      }
    } else {
      const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as any;
      console.log(`User not found: "${username}". Total users in DB: ${userCount?.count || 0}`);
      res.status(401).json({ error: "Usuario no registrado" });
    }
  });

  // Users
  app.get("/api/users", (req, res) => {
    const users = db.prepare("SELECT * FROM users").all();
    res.json(users);
  });

  app.post("/api/users", (req, res) => {
    const { name, username, email, pin, role, branchId } = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    try {
      db.prepare("INSERT INTO users (id, name, username, email, pin, role, branchId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, name, username, email || null, pin, role, branchId || null, createdAt);
      res.json({ id, name, username, email, pin, role, branchId, createdAt });
    } catch (e) {
      console.error("User creation failed:", e);
      res.status(400).json({ error: "Nombre de usuario ya registrado" });
    }
  });

  app.put("/api/users/:id", (req, res) => {
    const { name, username, email, pin, role, branchId } = req.body;
    try {
      db.prepare("UPDATE users SET name = ?, username = ?, email = ?, pin = ?, role = ?, branchId = ? WHERE id = ?")
        .run(name, username, email || null, pin, role, branchId || null, req.params.id);
      res.json({ success: true });
    } catch (e) {
      console.error("User update failed:", e);
      res.status(400).json({ error: "Error al actualizar usuario (posible nombre de usuario duplicado)" });
    }
  });

  app.delete("/api/users/:id", (req, res) => {
    db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Branches
  app.get("/api/branches", (req, res) => {
    const branches = db.prepare("SELECT * FROM branches").all();
    res.json(branches);
  });

  app.post("/api/branches", (req, res) => {
    const { name, abbreviation, location, phone, managerId } = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    db.prepare("INSERT INTO branches (id, name, abbreviation, location, phone, managerId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, name, abbreviation || 'S', location, phone, managerId || null, createdAt);
    res.json({ id, name, abbreviation, location, phone, managerId, createdAt });
  });

  app.put("/api/branches/:id", (req, res) => {
    const { name, abbreviation, location, phone, managerId } = req.body;
    db.prepare("UPDATE branches SET name = ?, abbreviation = ?, location = ?, phone = ?, managerId = ? WHERE id = ?")
      .run(name, abbreviation || 'S', location, phone, managerId || null, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/branches/:id", (req, res) => {
    db.prepare("DELETE FROM branches WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Materials
  app.get("/api/materials", (req, res) => {
    const materials = db.prepare("SELECT * FROM materials").all();
    res.json(materials.map((m: any) => ({
      ...m,
      sourceMaterials: m.sourceMaterials ? JSON.parse(m.sourceMaterials) : []
    })));
  });

  app.post("/api/materials", (req, res) => {
    const id = crypto.randomUUID();
    const data = req.body;
    const registrationDate = new Date().toISOString();
    // Note: In a real app, you'd get the user ID from a session/token
    // For now, we'll expect it in the body or use a placeholder if not provided
    const createdBy = data.createdBy || "system";
    
    db.prepare(`
      INSERT INTO materials (
        id, receiptNumber, client, initialWeight, finalWeight, marketPrice, 
        loss, purity, usdToBs, pricePerGram, lossPercentage, registrationDate, total, 
        type, status, createdBy, sourceMaterials
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.receiptNumber, data.client, data.initialWeight, data.finalWeight, data.marketPrice,
      data.loss, data.purity, data.usdToBs, data.pricePerGram, data.lossPercentage || (data.initialWeight > 0 ? (data.loss / data.initialWeight) * 100 : 0), registrationDate, data.total,
      data.type, data.status, createdBy, data.sourceMaterials ? JSON.stringify(data.sourceMaterials) : null
    );
    res.json({ id, ...data, registrationDate, createdBy });
  });

  app.put("/api/materials/:id", (req, res) => {
    const data = req.body;
    const fields = Object.keys(data).map(k => `${k} = ?`).join(", ");
    const values = Object.values(data).map(v => typeof v === "object" ? JSON.stringify(v) : v);
    db.prepare(`UPDATE materials SET ${fields} WHERE id = ?`).run(...values, req.params.id);
    res.json({ success: true });
  });

  // Smelting
  app.get("/api/smelting", (req, res) => {
    const ops = db.prepare("SELECT * FROM smeltingOperations").all();
    res.json(ops.map((o: any) => ({ ...o, sourceMaterialIds: JSON.parse(o.sourceMaterialIds) })));
  });

  app.post("/api/smelting", (req, res) => {
    const { operation, materialIds } = req.body;
    const opId = crypto.randomUUID();
    const resultMaterialId = crypto.randomUUID();
    const date = new Date().toISOString();

    // Fetch source materials to store their info in the result material
    const placeholders = materialIds.map(() => "?").join(",");
    const sourceMaterialsData = db.prepare(`SELECT * FROM materials WHERE id IN (${placeholders})`).all(...materialIds);
    
    const sourceMaterialsInfo = sourceMaterialsData.map((m: any) => ({
      receiptNumber: m.receiptNumber,
      client: m.client,
      finalWeight: m.finalWeight,
      total: m.total,
      registrationDate: m.registrationDate,
      purity: m.purity,
      marketPrice: m.marketPrice,
      sourceMaterials: m.sourceMaterials ? JSON.parse(m.sourceMaterials) : []
    }));

    const transaction = db.transaction(() => {
      // 1. Create the result material
      db.prepare(`
        INSERT INTO materials (
          id, receiptNumber, client, initialWeight, finalWeight, marketPrice, 
          loss, purity, usdToBs, pricePerGram, registrationDate, total, 
          type, status, createdBy, sourceMaterials
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        resultMaterialId, 
        operation.receiptNumber || `F-${Date.now()}`,
        "FUNDICION INTERNA",
        operation.initialWeight,
        operation.finalWeight,
        operation.marketPrice || 0,
        operation.loss || 0,
        operation.purity || 100,
        operation.usdToBs || 6.96,
        operation.pricePerGram || 0,
        date,
        operation.total || 0,
        "barra", "disponible", operation.createdBy || "system",
        JSON.stringify(sourceMaterialsInfo)
      );

      // 2. Update source materials status
      db.prepare(`UPDATE materials SET status = 'fundido' WHERE id IN (${placeholders})`).run(...materialIds);

      // 3. Create smelting operation record
      db.prepare(`
        INSERT INTO smeltingOperations (
          id, sourceMaterialIds, resultMaterialId, date, totalInitialWeight, totalFinalWeight, 
          marketPrice, loss, purity, usdToBs, pricePerGram, total, createdBy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        opId, JSON.stringify(materialIds), resultMaterialId, date,
        operation.initialWeight, operation.finalWeight,
        operation.marketPrice || 0,
        operation.loss || 0,
        operation.purity || 100,
        operation.usdToBs || 6.96,
        operation.pricePerGram || 0,
        operation.total || 0,
        operation.createdBy || "system"
      );
    });

    try {
      transaction();
      res.json({ success: true, opId, resultMaterialId });
    } catch (e) {
      console.error("Smelting transaction failed:", e);
      res.status(500).json({ error: "Error al procesar la fundición" });
    }
  });

  // Export
  app.get("/api/export", (req, res) => {
    const ops = db.prepare("SELECT * FROM exportOperations").all();
    res.json(ops.map((o: any) => ({ ...o, sourceMaterialIds: JSON.parse(o.sourceMaterialIds) })));
  });

  app.post("/api/export", (req, res) => {
    const { operation, materialIds } = req.body;
    const opId = crypto.randomUUID();
    const date = new Date().toISOString();

    const transaction = db.transaction(() => {
      // 1. Update source materials status
      const placeholders = materialIds.map(() => "?").join(",");
      db.prepare(`UPDATE materials SET status = 'exportado' WHERE id IN (${placeholders})`).run(...materialIds);

      // 2. Create export operation record
      db.prepare(`
        INSERT INTO exportOperations (
          id, sourceMaterialIds, date, totalWeight, marketPrice, pricePerGram, salePrice, createdBy, client, receiptNumber
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        opId, JSON.stringify(materialIds), date, operation.totalWeight,
        operation.marketPrice, operation.pricePerGram, operation.salePrice,
        operation.createdBy || "system", operation.client, operation.receiptNumber
      );
    });

    try {
      transaction();
      res.json({ success: true, opId });
    } catch (e) {
      console.error("Export transaction failed:", e);
      res.status(500).json({ error: "Error al procesar la exportación" });
    }
  });

  // Settings
  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM companySettings LIMIT 1").get();
    res.json(settings);
  });

  app.post("/api/settings", (req, res) => {
    const data = req.body;
    const updatedAt = new Date().toISOString();
    
    // Get the existing settings ID
    const existing = db.prepare("SELECT id FROM companySettings LIMIT 1").get() as any;
    const settingsId = existing ? existing.id : crypto.randomUUID();
    
    const allowedFields = ['name', 'address', 'phone', 'email', 'taxId', 'logoUrl'];
    const values = allowedFields.map(f => data[f] !== undefined ? data[f] : null);

    try {
      if (existing) {
        const setClause = allowedFields.map(f => `${f} = ?`).join(", ");
        db.prepare(`UPDATE companySettings SET ${setClause}, updatedAt = ? WHERE id = ?`)
          .run(...values, updatedAt, settingsId);
      } else {
        const columns = ['id', ...allowedFields, 'updatedAt'];
        const placeholders = columns.map(() => "?").join(", ");
        db.prepare(`INSERT INTO companySettings (${columns.join(", ")}) VALUES (${placeholders})`)
          .run(settingsId, ...values, updatedAt);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving settings:", error);
      res.status(500).json({ error: "Error al guardar la configuración" });
    }
  });

  app.put("/api/settings/:id", (req, res) => {
    const data = req.body;
    const { id, ...updateData } = data;
    const fields = Object.keys(updateData).map(k => `${k} = ?`).join(", ");
    const values = Object.values(updateData);
    db.prepare(`UPDATE companySettings SET ${fields} WHERE id = ?`).run(...values, req.params.id);
    res.json({ success: true });
  });

  // Clients
  app.get("/api/clients", (req, res) => {
    const { branchId } = req.query;
    let clients;
    if (branchId) {
      clients = db.prepare("SELECT * FROM clients WHERE branchId = ?").all(branchId);
    } else {
      clients = db.prepare("SELECT * FROM clients").all();
    }
    res.json(clients);
  });

  app.post("/api/clients", (req, res) => {
    const client = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    
    // Clean CI: trim and convert empty to null
    const ci = typeof client.ci === 'string' ? client.ci.trim() : client.ci;
    const finalCI = ci === '' ? null : ci;

    try {
      db.prepare(`
        INSERT INTO clients (
          id, name, phone, email, ci, workplace, isMineCooperative, 
          recommendedBy, referentialPhone, branchId, branchName, registeredBy, createdAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, client.name, client.phone, client.email, finalCI, client.workplace, 
        client.isMineCooperative ? 1 : 0, client.recommendedBy, client.referentialPhone, 
        client.branchId, client.branchName, client.registeredBy, createdAt
      );
      res.json({ ...client, id, createdAt, ci: finalCI });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        res.status(400).json({ error: "Ya existe un cliente con este CI en esta sucursal." });
      } else {
        console.error("Error creating client:", error);
        res.status(500).json({ error: "Error al crear el cliente" });
      }
    }
  });

  app.put("/api/clients/:id", (req, res) => {
    const client = req.body;
    const { id, ...updateData } = client;
    
    // Convert boolean to integer for SQLite
    if (updateData.isMineCooperative !== undefined) {
      updateData.isMineCooperative = updateData.isMineCooperative ? 1 : 0;
    }

    // Clean CI: trim and convert empty to null
    if (updateData.ci !== undefined) {
      const ci = typeof updateData.ci === 'string' ? updateData.ci.trim() : updateData.ci;
      updateData.ci = ci === '' ? null : ci;
    }

    try {
      const fields = Object.keys(updateData).map(k => `${k} = ?`).join(", ");
      const values = Object.values(updateData);
      db.prepare(`UPDATE clients SET ${fields} WHERE id = ?`).run(...values, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        res.status(400).json({ error: "Ya existe un cliente con este CI en esta sucursal." });
      } else {
        console.error("Error updating client:", error);
        res.status(500).json({ error: "Error al actualizar el cliente" });
      }
    }
  });

  app.delete("/api/clients/:id", (req, res) => {
    db.prepare("DELETE FROM clients WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Referrers
  app.get("/api/referrers", (req, res) => {
    const { branchId } = req.query;
    let referrers;
    if (branchId) {
      referrers = db.prepare("SELECT * FROM referrers WHERE branchId = ?").all(branchId);
    } else {
      referrers = db.prepare("SELECT * FROM referrers").all();
    }
    res.json(referrers);
  });

  app.post("/api/referrers", (req, res) => {
    const referrer = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    
    // Clean CI: trim and convert empty to null
    const ciRaw = referrer.ci;
    const ci = typeof ciRaw === 'string' ? ciRaw.trim() : ciRaw;
    const finalCI = (ci === '' || ci === null || ci === undefined) ? null : ci;

    try {
      db.prepare(`
        INSERT INTO referrers (id, name, phone1, phone2, ci, branchId, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, referrer.name || '', referrer.phone1 || '', referrer.phone2 || null, finalCI, referrer.branchId || '', createdAt);
      res.json({ ...referrer, id, createdAt, ci: finalCI });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        res.status(400).json({ error: "Ya existe un referido con este CI en esta sucursal." });
      } else {
        console.error("Error creating referrer:", error);
        res.status(500).json({ error: "Error al crear el referido" });
      }
    }
  });

  app.put("/api/referrers/:id", (req, res) => {
    const referrer = req.body;
    const { id, ...updateData } = referrer;
    
    // Clean CI: trim and convert empty to null
    if (updateData.ci !== undefined) {
      const ciRaw = updateData.ci;
      const ci = typeof ciRaw === 'string' ? ciRaw.trim() : ciRaw;
      updateData.ci = (ci === '' || ci === null || ci === undefined) ? null : ci;
    }

    try {
      const fields = Object.keys(updateData).map(k => `${k} = ?`).join(", ");
      const values = Object.values(updateData);
      db.prepare(`UPDATE referrers SET ${fields} WHERE id = ?`).run(...values, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        res.status(400).json({ error: "Ya existe un referido con este CI en esta sucursal." });
      } else {
        console.error("Error updating referrer:", error);
        res.status(500).json({ error: "Error al actualizar el referido" });
      }
    }
  });

  app.delete("/api/referrers/:id", (req, res) => {
    db.prepare("DELETE FROM referrers WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Referrer Payouts
  app.get("/api/referrer-payouts", (req, res) => {
    const { branchId, referrerId } = req.query;
    let query = "SELECT * FROM referrerPayouts";
    const params: any[] = [];
    
    if (branchId || referrerId) {
      query += " WHERE";
      if (branchId) {
        query += " branchId = ?";
        params.push(branchId);
      }
      if (referrerId) {
        if (branchId) query += " AND";
        query += " referrerId = ?";
        params.push(referrerId);
      }
    }
    
    query += " ORDER BY paidAt DESC";
    const payouts = db.prepare(query).all(...params);
    res.json(payouts.map((p: any) => ({
      ...p,
      purchaseIds: JSON.parse(p.purchaseIds),
      purchaseReceipts: JSON.parse(p.purchaseReceipts)
    })));
  });

  app.post("/api/referrer-payouts", (req, res) => {
    const { referrerId, referrerName, purchaseIds, purchaseReceipts, totalAmount, paidBy, branchId, notes } = req.body;
    const id = crypto.randomUUID();
    const paidAt = new Date().toISOString();

    try {
      db.transaction(() => {
        // Insert payout
        db.prepare(`
          INSERT INTO referrerPayouts (id, referrerId, referrerName, purchaseIds, purchaseReceipts, totalAmount, paidAt, paidBy, branchId, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, referrerId, referrerName, JSON.stringify(purchaseIds), JSON.stringify(purchaseReceipts), totalAmount, paidAt, paidBy, branchId, notes || null);

        // Update purchases as paid
        const placeholders = purchaseIds.map(() => "?").join(",");
        db.prepare(`
          UPDATE goldPurchases 
          SET commissionPaid = 1, 
              commissionPaidAt = ?, 
              commissionPaidBy = ? 
          WHERE id IN (${placeholders})
        `).run(paidAt, paidBy, ...purchaseIds);
      })();
      res.json({ id, paidAt });
    } catch (error) {
      console.error("Failed to process referrer payout:", error);
      res.status(500).json({ error: "Failed to process referrer payout" });
    }
  });

  // Gold Purchases
  app.get("/api/gold-purchases", (req, res) => {
    const { branchId } = req.query;
    let purchases;
    if (branchId) {
      purchases = db.prepare("SELECT * FROM goldPurchases WHERE branchId = ? ORDER BY createdAt DESC").all(branchId);
    } else {
      purchases = db.prepare("SELECT * FROM goldPurchases ORDER BY createdAt DESC").all();
    }
    
    // Add items to each purchase
    const purchasesWithItems = purchases.map((p: any) => {
      const items = db.prepare("SELECT * FROM goldPurchaseItems WHERE purchaseId = ?").all(p.id);
      return { ...p, items };
    });
    
    res.json(purchasesWithItems);
  });

  app.post("/api/gold-purchases", (req, res) => {
    const { branchId, clientId, total, type, referrerName, commission, advancePayment, createdBy, items, date } = req.body;
    const purchaseId = crypto.randomUUID();
    const createdAt = date ? new Date(date).toISOString() : new Date().toISOString();
    let receiptNumber = '';
    
    try {
      db.transaction(() => {
        // ... previous logic to generate receiptNumber ...
        const branch = db.prepare("SELECT abbreviation FROM branches WHERE id = ?").get(branchId) as any;
        const abbr = branch ? branch.abbreviation : 'S';
        const year = new Date(createdAt).getFullYear().toString().slice(-2);
        const prefix = `${abbr}${year}`;
        const lastPurchase = db.prepare(`
          SELECT receiptNumber FROM goldPurchases 
          WHERE branchId = ? AND receiptNumber LIKE ? 
          ORDER BY LENGTH(receiptNumber) DESC, receiptNumber DESC LIMIT 1
        `).get(branchId, `${prefix}%`) as any;
        
        let sequence = 1;
        if (lastPurchase) {
          const lastNum = parseInt(lastPurchase.receiptNumber.substring(prefix.length));
          if (!isNaN(lastNum)) sequence = lastNum + 1;
        }
        receiptNumber = `${prefix}${sequence.toString().padStart(2, '0')}`;

        // Insert main purchase
        db.prepare(`
          INSERT INTO goldPurchases (id, receiptNumber, branchId, clientId, total, type, referrerName, commission, advancePayment, createdBy, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(purchaseId, receiptNumber, branchId, clientId, total, type, referrerName || null, commission || 0, advancePayment || 0, createdBy, createdAt);
        
        // Insert items
        if (items && Array.isArray(items)) {
          const itemStmt = db.prepare(`
            INSERT INTO goldPurchaseItems (
              id, purchaseId, initialWeight, finalWeight, marketPrice, 
              purity, pricePerGram, total, usdToBs, loss, lossPercentage, type, createdBy
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          items.forEach(item => {
            itemStmt.run(
              crypto.randomUUID(), purchaseId, item.initialWeight, item.finalWeight, 
              item.marketPrice, item.purity, item.pricePerGram, item.total, 
              item.usdToBs, item.loss, item.lossPercentage || 0, item.type || 'pieza', createdBy
            );
          });
        }
      })();
      
      res.json({ id: purchaseId, receiptNumber, branchId, clientId, total, type, createdBy, createdAt, items });
    } catch (error) {
      console.error("Failed to save gold purchase:", error);
      res.status(500).json({ error: "Failed to save gold purchase" });
    }
  });

  app.post("/api/gold-purchases/:id/close", (req, res) => {
    const { id } = req.params;
    const { closedBy, closeMarketPrice, closeUsdToBs, closeTotal, items } = req.body;
    const closedAt = new Date().toISOString();

    try {
      db.transaction(() => {
        // Update purchase record
        db.prepare(`
          UPDATE goldPurchases 
          SET type = 'cerrado', 
              closedAt = ?, 
              closedBy = ?, 
              closeMarketPrice = ?, 
              closeUsdToBs = ?, 
              closeTotal = ? 
          WHERE id = ?
        `).run(closedAt, closedBy, closeMarketPrice, closeUsdToBs, closeTotal, id);

        // Update items if provided
        if (items && Array.isArray(items)) {
          const itemStmt = db.prepare(`
            UPDATE goldPurchaseItems 
            SET closeMarketPrice = ?, 
                closeUsdToBs = ?, 
                closePricePerGram = ?, 
                closeTotal = ? 
            WHERE id = ?
          `);
          
          items.forEach(item => {
            itemStmt.run(
              item.closeMarketPrice, 
              item.closeUsdToBs, 
              item.closePricePerGram, 
              item.closeTotal, 
              item.id
            );
          });
        }
      })();
      res.json({ success: true, closedAt, closedBy });
    } catch (error) {
      console.error("Failed to close gold purchase:", error);
      res.status(500).json({ error: "Failed to close gold purchase" });
    }
  });

  app.put("/api/gold-purchases/:id", (req, res) => {
    const purchase = req.body;
    const { id, ...updateData } = purchase;
    const fields = Object.keys(updateData).map(k => `${k} = ?`).join(", ");
    const values = Object.values(updateData);
    db.prepare(`UPDATE goldPurchases SET ${fields} WHERE id = ?`).run(...values, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/gold-purchases/:id", (req, res) => {
    db.prepare("DELETE FROM goldPurchases WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });
  
  // API 404 handler: if a request starts with /api but didn't match any route above
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: "Route not found", path: req.url });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Global error handler caught:", err);
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  });
}

startServer();
