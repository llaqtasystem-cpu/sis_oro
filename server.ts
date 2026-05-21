import express from "express";
console.log("SERVER SCRIPT LOADING...");
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import mysql from "mysql2/promise";
import Database from "better-sqlite3";
import { initDatabase, DB, getDatabaseConfig, saveDatabaseConfig } from "./db.ts";

async function columnExists(db: DB, table: string, column: string): Promise<boolean> {
  if (db.isMySQL) {
    // MySQL pool.execute DOES NOT support ?? for identifiers. 
    // Since table names here are hardcoded in server.ts, string interpolation is safe.
    const rows = await db.all(`SHOW COLUMNS FROM ${table}`);
    return rows.some((r: any) => r.Field === column);
  } else {
    const rows = await db.all(`PRAGMA table_info(${table})`);
    return rows.some((r: any) => r.name === column);
  }
}

async function startServer() {
  const db = await initDatabase();
  const app = express();

  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      console.log(`[API] ${req.method} ${req.url}`);
    }
    next();
  });

  // Initialize Database Schema
  try {
    const tables = [
      `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        username VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        pin VARCHAR(255) NOT NULL,
        role VARCHAR(255) NOT NULL,
        branchId VARCHAR(255),
        createdAt VARCHAR(255) NOT NULL,
        photo TEXT,
        UNIQUE(username)
      )`,
      `CREATE TABLE IF NOT EXISTS materials (
        id VARCHAR(255) PRIMARY KEY,
        receiptNumber VARCHAR(255) NOT NULL,
        client VARCHAR(255) NOT NULL,
        initialWeight DOUBLE NOT NULL,
        finalWeight DOUBLE NOT NULL,
        marketPrice DOUBLE NOT NULL,
        loss DOUBLE NOT NULL,
        purity DOUBLE NOT NULL,
        usdToBs DOUBLE NOT NULL,
        pricePerGram DOUBLE NOT NULL,
        pricePerGram100 DOUBLE,
        lossPercentage DOUBLE,
        registrationDate VARCHAR(255) NOT NULL,
        total DOUBLE NOT NULL,
        type VARCHAR(255) NOT NULL,
        status VARCHAR(255) NOT NULL,
        createdBy VARCHAR(255) NOT NULL,
        sourceMaterials LONGTEXT
      )`,
      `CREATE TABLE IF NOT EXISTS smeltingOperations (
        id VARCHAR(255) PRIMARY KEY,
        sourceMaterialIds LONGTEXT NOT NULL,
        resultMaterialId VARCHAR(255) NOT NULL,
        date VARCHAR(255) NOT NULL,
        totalInitialWeight DOUBLE NOT NULL,
        totalFinalWeight DOUBLE NOT NULL,
        marketPrice DOUBLE DEFAULT 0,
        loss DOUBLE DEFAULT 0,
        purity DOUBLE DEFAULT 0,
        usdToBs DOUBLE DEFAULT 0,
        pricePerGram DOUBLE DEFAULT 0,
        total DOUBLE DEFAULT 0,
        createdBy VARCHAR(255) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS exportOperations (
        id VARCHAR(255) PRIMARY KEY,
        sourceMaterialIds LONGTEXT NOT NULL,
        date VARCHAR(255) NOT NULL,
        totalWeight DOUBLE NOT NULL,
        marketPrice DOUBLE NOT NULL,
        pricePerGram DOUBLE NOT NULL,
        salePrice DOUBLE NOT NULL,
        createdBy VARCHAR(255) NOT NULL,
        client VARCHAR(255) NOT NULL,
        receiptNumber VARCHAR(255) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS companySettings (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address VARCHAR(255),
        phone VARCHAR(255),
        email VARCHAR(255),
        taxId VARCHAR(255),
        logoUrl VARCHAR(255),
        updatedAt VARCHAR(255) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS branches (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        abbreviation VARCHAR(255) NOT NULL,
        location VARCHAR(255),
        phone VARCHAR(255),
        managerId VARCHAR(255),
        createdAt VARCHAR(255) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS clients (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(255),
        phoneCountryCode VARCHAR(10) DEFAULT '591',
        email VARCHAR(255),
        ci VARCHAR(255),
        workplace VARCHAR(255),
        isMineCooperative INTEGER DEFAULT 0,
        recommendedBy VARCHAR(255),
        referentialPhone VARCHAR(255),
        referentialCountryCode VARCHAR(10) DEFAULT '591',
        branchId VARCHAR(255) NOT NULL,
        branchName VARCHAR(255),
        registeredBy VARCHAR(255),
        createdAt VARCHAR(255) NOT NULL,
        photo TEXT,
        documentPhoto TEXT,
        UNIQUE(ci, branchId)
      )`,
      `CREATE TABLE IF NOT EXISTS branchBankAccounts (
        id VARCHAR(255) PRIMARY KEY,
        branchId VARCHAR(255) NOT NULL,
        bankName VARCHAR(255) NOT NULL,
        accountNumber VARCHAR(255) NOT NULL,
        createdAt VARCHAR(255) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS referrers (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone1 VARCHAR(255) NOT NULL,
        phone2 VARCHAR(255),
        ci VARCHAR(255),
        branchId VARCHAR(255) NOT NULL,
        createdAt VARCHAR(255) NOT NULL,
        photo TEXT,
        documentPhoto TEXT,
        UNIQUE(ci, branchId)
      )`,
      `CREATE TABLE IF NOT EXISTS referrerPayouts (
        id VARCHAR(255) PRIMARY KEY,
        referrerId VARCHAR(255) NOT NULL,
        referrerName VARCHAR(255) NOT NULL,
        purchaseIds LONGTEXT NOT NULL,
        purchaseReceipts LONGTEXT NOT NULL,
        totalAmount DOUBLE NOT NULL,
        paidAt VARCHAR(255) NOT NULL,
        paidBy VARCHAR(255) NOT NULL,
        branchId VARCHAR(255) NOT NULL,
        notes LONGTEXT
      )`,
      `CREATE TABLE IF NOT EXISTS goldPurchases (
        id VARCHAR(255) PRIMARY KEY,
        receiptNumber VARCHAR(255) NOT NULL,
        branchId VARCHAR(255) NOT NULL,
        clientId VARCHAR(255) NOT NULL,
        total DOUBLE NOT NULL,
        type VARCHAR(255) NOT NULL,
        referrerName VARCHAR(255),
        commission DOUBLE DEFAULT 0,
        advancePayment DOUBLE DEFAULT 0,
        createdBy VARCHAR(255) NOT NULL,
        createdAt VARCHAR(255) NOT NULL,
        closedAt VARCHAR(255),
        closedBy VARCHAR(255),
        closeMarketPrice DOUBLE,
        closeUsdToBs DOUBLE,
        closeTotal DOUBLE,
        commissionPaid INTEGER DEFAULT 0,
        commissionPaidAt VARCHAR(255),
        commissionPaidBy VARCHAR(255),
        advancePaymentType VARCHAR(50) DEFAULT 'efectivo',
        advanceCashAmount DOUBLE DEFAULT 0,
        advanceBankAmount DOUBLE DEFAULT 0,
        advanceSourceBankAccountId VARCHAR(255),
        advanceClientBank VARCHAR(255),
        advanceClientAccountNumber VARCHAR(255),
        isFullPayment INTEGER DEFAULT 0,
        advances LONGTEXT
      )`,
      `CREATE TABLE IF NOT EXISTS branchCashMoves (
        id VARCHAR(255) PRIMARY KEY,
        branchId VARCHAR(255) NOT NULL,
        amount DOUBLE NOT NULL,
        type VARCHAR(50) NOT NULL,
        concept VARCHAR(255) NOT NULL,
        category VARCHAR(50) NOT NULL,
        paymentType VARCHAR(50) NOT NULL,
        bankAccountId VARCHAR(255),
        \`date\` VARCHAR(255) NOT NULL,
        createdBy VARCHAR(255) NOT NULL,
        referenceId VARCHAR(255),
        closureId VARCHAR(255)
      )`,
      `CREATE TABLE IF NOT EXISTS branchClosures (
        id VARCHAR(255) PRIMARY KEY,
        branchId VARCHAR(255) NOT NULL,
        \`date\` VARCHAR(255) NOT NULL,
        initialBalance DOUBLE NOT NULL,
        totalCashIn DOUBLE NOT NULL,
        totalCashOut DOUBLE NOT NULL,
        finalBalance DOUBLE NOT NULL,
        status VARCHAR(50) NOT NULL,
        createdBy VARCHAR(255) NOT NULL,
        closedAt VARCHAR(255),
        notes TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS goldTransfers (
        id VARCHAR(255) PRIMARY KEY,
        branchId VARCHAR(255) NOT NULL,
        materialIds LONGTEXT NOT NULL,
        totalWeight DOUBLE NOT NULL,
        totalGrams100 DOUBLE,
        sentBy VARCHAR(255) NOT NULL,
        sentAt VARCHAR(255) NOT NULL,
        status VARCHAR(255) NOT NULL,
        receivedBy VARCHAR(255),
        receivedAt VARCHAR(255)
      )`,
      `CREATE TABLE IF NOT EXISTS goldPurchaseItems (
        id VARCHAR(255) PRIMARY KEY,
        purchaseId VARCHAR(255) NOT NULL,
        initialWeight DOUBLE NOT NULL,
        finalWeight DOUBLE NOT NULL,
        marketPrice DOUBLE NOT NULL,
        purity DOUBLE NOT NULL,
        pricePerGram DOUBLE NOT NULL,
        total DOUBLE NOT NULL,
        usdToBs DOUBLE NOT NULL,
        pricePerGram100 DOUBLE,
        loss DOUBLE NOT NULL,
        lossPercentage DOUBLE,
        type VARCHAR(255) DEFAULT 'pieza',
        createdBy VARCHAR(255),
        closeMarketPrice DOUBLE,
        closeUsdToBs DOUBLE,
        closePricePerGram DOUBLE,
        closeTotal DOUBLE,
        otherQuotation DOUBLE,
        otherPurity DOUBLE,
        material100 DOUBLE,
        isTransferred INTEGER DEFAULT 0,
        isVerifiedInCentral INTEGER DEFAULT 0,
        transferId VARCHAR(255)
      )`
    ];

    for (const tableSql of tables) {
      await db.exec(tableSql);
    }
    console.log("Schema initialization successful");
  } catch (err: any) {
    console.error("Schema init failed:", err);
  }


  // Migrations logic rewritten to be cleaner and cross-platform
  try {
    fs.appendFileSync("startup_log.txt", `${new Date().toISOString()} - Running migrations\n`);
    if (!await columnExists(db, 'goldTransfers', 'totalGrams100')) {
      console.log("Adding totalGrams100 to goldTransfers...");
      await db.exec("ALTER TABLE goldTransfers ADD COLUMN totalGrams100 DOUBLE");
    }
    
    // Migrate status 'en_camino' to 'en_transito'
    await db.run("UPDATE goldTransfers SET status = 'en_transito' WHERE status = 'en_camino'");

    if (!await columnExists(db, 'goldPurchaseItems', 'otherQuotation')) {
      if (await columnExists(db, 'goldPurchaseItems', 'otherWeight')) {
        console.log("Renaming otherWeight to otherQuotation...");
        await db.exec("ALTER TABLE goldPurchaseItems RENAME COLUMN otherWeight TO otherQuotation");
      } else {
        console.log("Adding otherQuotation to goldPurchaseItems...");
        await db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN otherQuotation DOUBLE");
      }
    }
    if (!await columnExists(db, 'goldPurchaseItems', 'otherPurity')) {
      await db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN otherPurity DOUBLE");
    }

    if (!await columnExists(db, 'goldPurchaseItems', 'material100')) {
      console.log("Migrating goldPurchaseItems table for material100...");
      await db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN material100 DOUBLE");
    }

    if (!await columnExists(db, 'goldPurchaseItems', 'pricePerGram100')) {
      console.log("Adding pricePerGram100 to goldPurchaseItems...");
      await db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN pricePerGram100 DOUBLE");
    }

    if (!await columnExists(db, 'materials', 'pricePerGram100')) {
      console.log("Adding pricePerGram100 to materials...");
      await db.exec("ALTER TABLE materials ADD COLUMN pricePerGram100 DOUBLE");
    }

    // Clients migrations
    if (!await columnExists(db, 'clients', 'ci')) await db.exec("ALTER TABLE clients ADD COLUMN ci VARCHAR(255)");
    if (!await columnExists(db, 'clients', 'workplace')) await db.exec("ALTER TABLE clients ADD COLUMN workplace VARCHAR(255)");
    if (!await columnExists(db, 'clients', 'isMineCooperative')) await db.exec("ALTER TABLE clients ADD COLUMN isMineCooperative INTEGER DEFAULT 0");
    if (!await columnExists(db, 'clients', 'branchName')) await db.exec("ALTER TABLE clients ADD COLUMN branchName VARCHAR(255)");
    if (!await columnExists(db, 'clients', 'registeredBy')) await db.exec("ALTER TABLE clients ADD COLUMN registeredBy VARCHAR(255)");
    if (!await columnExists(db, 'clients', 'referentialPhone')) await db.exec("ALTER TABLE clients ADD COLUMN referentialPhone VARCHAR(255)");
    if (!await columnExists(db, 'clients', 'phoneCountryCode')) await db.exec("ALTER TABLE clients ADD COLUMN phoneCountryCode VARCHAR(10) DEFAULT '591'");
    if (!await columnExists(db, 'clients', 'referentialCountryCode')) await db.exec("ALTER TABLE clients ADD COLUMN referentialCountryCode VARCHAR(10) DEFAULT '591'");

    if (!await columnExists(db, 'branches', 'abbreviation')) {
      await db.exec("ALTER TABLE branches ADD COLUMN abbreviation VARCHAR(255) NOT NULL DEFAULT 'S'");
    }

    // Purchase migrations
    if (!await columnExists(db, 'goldPurchases', 'referrerName')) await db.exec("ALTER TABLE goldPurchases ADD COLUMN referrerName VARCHAR(255)");
    if (!await columnExists(db, 'goldPurchases', 'commission')) await db.exec("ALTER TABLE goldPurchases ADD COLUMN commission DOUBLE DEFAULT 0");
    if (!await columnExists(db, 'goldPurchases', 'commissionPaid')) {
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN commissionPaid INTEGER DEFAULT 0");
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN commissionPaidAt VARCHAR(255)");
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN commissionPaidBy VARCHAR(255)");
    }
    if (!await columnExists(db, 'goldPurchases', 'advancePayment')) await db.exec("ALTER TABLE goldPurchases ADD COLUMN advancePayment DOUBLE DEFAULT 0");
    if (!await columnExists(db, 'goldPurchases', 'closedAt')) await db.exec("ALTER TABLE goldPurchases ADD COLUMN closedAt VARCHAR(255)");
    if (!await columnExists(db, 'goldPurchases', 'closedBy')) await db.exec("ALTER TABLE goldPurchases ADD COLUMN closedBy VARCHAR(255)");
    if (!await columnExists(db, 'goldPurchases', 'closeMarketPrice')) {
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN closeMarketPrice DOUBLE");
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN closeUsdToBs DOUBLE");
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN closeTotal DOUBLE");
    }

    if (!await columnExists(db, 'goldPurchaseItems', 'closeMarketPrice')) {
      await db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN closeMarketPrice DOUBLE");
      await db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN closeUsdToBs DOUBLE");
      await db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN closePricePerGram DOUBLE");
      await db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN closeTotal DOUBLE");
    }

    if (!await columnExists(db, 'goldPurchaseItems', 'isTransferred')) {
      await db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN isTransferred INTEGER DEFAULT 0");
      await db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN transferId VARCHAR(255)");
    }

    if (!await columnExists(db, 'goldPurchaseItems', 'isVerifiedInCentral')) {
      await db.exec("ALTER TABLE goldPurchaseItems ADD COLUMN isVerifiedInCentral INTEGER DEFAULT 0");
    }

    // New Bank and Payment fields
    if (!await columnExists(db, 'goldPurchases', 'advancePaymentType')) {
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN advancePaymentType VARCHAR(50) DEFAULT 'efectivo'");
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN advanceSourceBankAccountId VARCHAR(255)");
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN advanceClientBank VARCHAR(255)");
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN advanceClientAccountNumber VARCHAR(255)");
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN isFullPayment INTEGER DEFAULT 0");
    }

    if (!await columnExists(db, 'goldPurchases', 'advanceCashAmount')) {
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN advanceCashAmount DOUBLE DEFAULT 0");
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN advanceBankAmount DOUBLE DEFAULT 0");
    }
    
    if (!await columnExists(db, 'goldPurchases', 'advances')) {
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN advances LONGTEXT");
    }

    if (!await columnExists(db, 'goldPurchases', 'closePaymentType')) {
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN closePaymentType VARCHAR(50) DEFAULT 'efectivo'");
    }
    if (!await columnExists(db, 'goldPurchases', 'closeCashAmount')) {
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN closeCashAmount DOUBLE DEFAULT 0");
    }
    if (!await columnExists(db, 'goldPurchases', 'closeBankAmount')) {
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN closeBankAmount DOUBLE DEFAULT 0");
    }
    if (!await columnExists(db, 'goldPurchases', 'closeSourceBankAccountId')) {
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN closeSourceBankAccountId VARCHAR(255)");
    }
    if (!await columnExists(db, 'goldPurchases', 'closeClientBank')) {
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN closeClientBank VARCHAR(255)");
    }
    if (!await columnExists(db, 'goldPurchases', 'closeClientAccountNumber')) {
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN closeClientAccountNumber VARCHAR(255)");
    }
    if (!await columnExists(db, 'goldPurchases', 'closureId')) {
      await db.exec("ALTER TABLE goldPurchases ADD COLUMN closureId VARCHAR(255)");
    }

    // Branch management migrations
    if (!await columnExists(db, 'branchClosures', 'date')) {
      await db.exec("ALTER TABLE branchClosures ADD COLUMN date VARCHAR(255)");
    }
    if (!await columnExists(db, 'branchCashMoves', 'date')) {
      await db.exec("ALTER TABLE branchCashMoves ADD COLUMN date VARCHAR(255)");
    }
    if (!await columnExists(db, 'branchCashMoves', 'closureId')) {
      await db.exec("ALTER TABLE branchCashMoves ADD COLUMN closureId VARCHAR(255)");
    }
    if (!await columnExists(db, 'branchCashMoves', 'bankAccountId')) {
      await db.exec("ALTER TABLE branchCashMoves ADD COLUMN bankAccountId VARCHAR(255)");
    }
    if (!await columnExists(db, 'users', 'photo')) {
      await db.exec("ALTER TABLE users ADD COLUMN photo TEXT");
    }
    if (!await columnExists(db, 'clients', 'photo')) {
      await db.exec("ALTER TABLE clients ADD COLUMN photo TEXT");
    }
    if (!await columnExists(db, 'clients', 'documentPhoto')) {
      await db.exec("ALTER TABLE clients ADD COLUMN documentPhoto TEXT");
    }
    if (!await columnExists(db, 'referrers', 'photo')) {
      await db.exec("ALTER TABLE referrers ADD COLUMN photo TEXT");
    }
    if (!await columnExists(db, 'referrers', 'documentPhoto')) {
      await db.exec("ALTER TABLE referrers ADD COLUMN documentPhoto TEXT");
    }

    fs.appendFileSync("startup_log.txt", `${new Date().toISOString()} - Migrations successful\n`);
  } catch (err: any) {
    fs.appendFileSync("startup_log.txt", `${new Date().toISOString()} - Migrations warning: ${err.message}\n`);
    console.warn("Migration warning (might be expected on fresh DB):", err);
  }

  // Bootstrap default admin
  try {
    const adminUsername = "admin";
    const adminEmail = "llaqtasystem@gmail.com";
    const existing = await db.get("SELECT * FROM users WHERE LOWER(username) = LOWER(?) OR (email IS NOT NULL AND LOWER(email) = LOWER(?))", [adminUsername, adminEmail]);
    if (!existing) {
      await db.run("INSERT INTO users (id, name, username, email, pin, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)", 
        [crypto.randomUUID(), "Super Administrador", adminUsername, adminEmail, "1234", "superadmin", new Date().toISOString()]);
    }
  } catch (err: any) {
    fs.appendFileSync("startup_log.txt", `${new Date().toISOString()} - Bootstrap (users) error: ${err.message}\n`);
    console.error("Bootstrap error (users):", err);
  }

  // Bootstrap default settings
  try {
    const existing = await db.get("SELECT * FROM companySettings LIMIT 1");
    if (!existing) {
      await db.run("INSERT INTO companySettings (id, name, updatedAt) VALUES (?, ?, ?)", [crypto.randomUUID(), "Aurum Manager - Almacén", new Date().toISOString()]);
    }
  } catch (err: any) {
    fs.appendFileSync("startup_log.txt", `${new Date().toISOString()} - Bootstrap (settings) error: ${err.message}\n`);
    console.error("Bootstrap error (settings):", err);
  }

  const PORT = 3000;
  app.use(express.json());

  const apiRouter = express.Router();

  // Health check
  apiRouter.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Debug route
  apiRouter.get("/debug/users", async (req, res) => {
    const users = await db.all("SELECT username, email, pin, role FROM users");
    res.json(users);
  });

  // Auth
  apiRouter.post("/auth/login", async (req, res) => {
    const { username, pin } = req.body;
    const pinStr = String(pin);
    console.log(`Login attempt for: ${username} with PIN: ${pinStr}`);
    
    const user = await db.get(`
      SELECT * FROM users 
      WHERE (LOWER(username) = LOWER(?)) 
      OR (email IS NOT NULL AND LOWER(email) = LOWER(?))
    `, [username, username]);

    if (user) {
      if (String(user.pin) === pinStr) {
        res.json(user);
      } else {
        res.status(401).json({ error: "PIN incorrecto" });
      }
    } else {
      res.status(401).json({ error: "Usuario no registrado" });
    }
  });

  // Users
  apiRouter.get("/users", async (req, res) => {
    const users = await db.all("SELECT * FROM users");
    res.json(users);
  });

  apiRouter.post("/users", async (req, res) => {
    const { name, username, email, pin, role, branchId, photo } = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    try {
      await db.run("INSERT INTO users (id, name, username, email, pin, role, branchId, createdAt, photo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [id, name, username, email || null, pin, role, branchId || null, createdAt, photo || null]);
      res.json({ id, name, username, email, pin, role, branchId, createdAt, photo });
    } catch (e) {
      console.error("User creation failed:", e);
      res.status(400).json({ error: "Nombre de usuario ya registrado" });
    }
  });

  apiRouter.put("/users/:id", async (req, res) => {
    const { name, username, email, pin, role, branchId, photo } = req.body;
    try {
      await db.run("UPDATE users SET name = ?, username = ?, email = ?, pin = ?, role = ?, branchId = ?, photo = ? WHERE id = ?",
        [name, username, email || null, pin, role, branchId || null, photo || null, req.params.id]);
      res.json({ success: true });
    } catch (e) {
      console.error("User update failed:", e);
      res.status(400).json({ error: "Error al actualizar usuario" });
    }
  });

  apiRouter.delete("/users/:id", async (req, res) => {
    await db.run("DELETE FROM users WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  });

  // Branches
  apiRouter.get("/branches", async (req, res) => {
    try {
      const branches = await db.all("SELECT * FROM branches");
      res.json(branches);
    } catch (e) {
      console.error("Failed to fetch branches:", e);
      res.status(500).json({ error: "Failed to fetch branches" });
    }
  });

  apiRouter.post("/branches", async (req, res) => {
    const { name, abbreviation, location, phone, managerId } = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await db.run("INSERT INTO branches (id, name, abbreviation, location, phone, managerId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, name, abbreviation || 'S', location, phone, managerId || null, createdAt]);
    res.json({ id, name, abbreviation, location, phone, managerId, createdAt });
  });

  apiRouter.put("/branches/:id", async (req, res) => {
    const { name, abbreviation, location, phone, managerId } = req.body;
    await db.run("UPDATE branches SET name = ?, abbreviation = ?, location = ?, phone = ?, managerId = ? WHERE id = ?",
      [name, abbreviation || 'S', location, phone, managerId || null, req.params.id]);
    res.json({ success: true });
  });

  apiRouter.delete("/branches/:id", async (req, res) => {
    await db.run("DELETE FROM branches WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  });

  // Materials
  // Branch Bank Accounts
  apiRouter.get("/branches/:branchId/bank-accounts", async (req, res) => {
    const accounts = await db.all("SELECT * FROM branchBankAccounts WHERE branchId = ?", [req.params.branchId]);
    res.json(accounts);
  });

  apiRouter.post("/branch-bank-accounts", async (req, res) => {
    const { branchId, bankName, accountNumber } = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await db.run("INSERT INTO branchBankAccounts (id, branchId, bankName, accountNumber, createdAt) VALUES (?, ?, ?, ?, ?)",
      [id, branchId, bankName, accountNumber, createdAt]);
    res.json({ id, branchId, bankName, accountNumber, createdAt });
  });

  apiRouter.delete("/branch-bank-accounts/:id", async (req, res) => {
    await db.run("DELETE FROM branchBankAccounts WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  });

  apiRouter.put("/branch-bank-accounts/:id", async (req, res) => {
    const { bankName, accountNumber } = req.body;
    await db.run("UPDATE branchBankAccounts SET bankName = ?, accountNumber = ? WHERE id = ?",
      [bankName, accountNumber, req.params.id]);
    res.json({ success: true });
  });

  apiRouter.get("/branch-bank-accounts-all", async (req, res) => {
    const accounts = await db.all("SELECT * FROM branchBankAccounts");
    res.json(accounts);
  });

  apiRouter.get("/materials", async (req, res) => {
    try {
      const materials = await db.all("SELECT * FROM materials");
      res.json(materials.map((m: any) => {
        try {
          return {
            ...m,
            sourceMaterials: m.sourceMaterials ? JSON.parse(m.sourceMaterials) : []
          };
        } catch (e) {
          console.error(`Failed to parse sourceMaterials for material ${m.id}:`, e);
          return { ...m, sourceMaterials: [] };
        }
      }));
    } catch (e) {
      console.error("Failed to fetch materials:", e);
      res.status(500).json({ error: "Failed to fetch materials" });
    }
  });

  apiRouter.post("/materials", async (req, res) => {
    const id = crypto.randomUUID();
    const data = req.body;
    const registrationDate = new Date().toISOString();
    const createdBy = data.createdBy || "system";
    
    await db.run(`
      INSERT INTO materials (
        id, receiptNumber, client, initialWeight, finalWeight, marketPrice, 
        loss, purity, usdToBs, pricePerGram, lossPercentage, registrationDate, total, 
        type, status, createdBy, sourceMaterials
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, data.receiptNumber, data.client, data.initialWeight, data.finalWeight, data.marketPrice,
      data.loss, data.purity, data.usdToBs, data.pricePerGram, data.lossPercentage || (data.initialWeight > 0 ? (data.loss / data.initialWeight) * 100 : 0), registrationDate, data.total,
      data.type, data.status, createdBy, data.sourceMaterials ? JSON.stringify(data.sourceMaterials) : null
    ]);
    res.json({ id, ...data, registrationDate, createdBy });
  });

  apiRouter.put("/materials/:id", async (req, res) => {
    const data = req.body;
    const fields = Object.keys(data).map(k => `${k} = ?`).join(", ");
    const values = Object.values(data).map(v => typeof v === "object" ? JSON.stringify(v) : v);
    await db.run(`UPDATE materials SET ${fields} WHERE id = ?`, [...values, req.params.id]);
    res.json({ success: true });
  });

  // Smelting
  apiRouter.get("/smelting", async (req, res) => {
    try {
      const ops = await db.all("SELECT * FROM smeltingOperations ORDER BY date DESC");
      res.json(ops.map((o: any) => {
        try {
          return { ...o, sourceMaterialIds: o.sourceMaterialIds ? JSON.parse(o.sourceMaterialIds) : [] };
        } catch (e) {
          console.error(`Failed to parse sourceMaterialIds for smelting ${o.id}:`, e);
          return { ...o, sourceMaterialIds: [] };
        }
      }));
    } catch (error) {
      console.error("Error fetching smelting records:", error);
      res.status(500).json({ error: "Failed to fetch smelting records" });
    }
  });

  apiRouter.post("/smelting", async (req, res) => {
    const { operation, materialIds } = req.body;
    const opId = crypto.randomUUID();
    const resultMaterialId = crypto.randomUUID();
    const date = new Date().toISOString();

    try {
      // Fetch source materials to store their info in the result material
      const placeholders = materialIds.map(() => "?").join(",");
      const sourceMaterialsData = await db.all(`SELECT * FROM materials WHERE id IN (${placeholders})`, materialIds);
      
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

      await db.transaction(async () => {
        // 1. Create the result material
        await db.run(`
          INSERT INTO materials (
            id, receiptNumber, client, initialWeight, finalWeight, marketPrice, 
            loss, purity, usdToBs, pricePerGram, registrationDate, total, 
            type, status, createdBy, sourceMaterials
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
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
        ]);

        // 2. Update source materials status
        await db.run(`UPDATE materials SET status = 'fundido' WHERE id IN (${placeholders})`, materialIds);

        // 3. Create smelting operation record
        await db.run(`
          INSERT INTO smeltingOperations (
            id, sourceMaterialIds, resultMaterialId, date, totalInitialWeight, totalFinalWeight, 
            marketPrice, loss, purity, usdToBs, pricePerGram, total, createdBy
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          opId, JSON.stringify(materialIds), resultMaterialId, date,
          operation.initialWeight, operation.finalWeight,
          operation.marketPrice || 0,
          operation.loss || 0,
          operation.purity || 100,
          operation.usdToBs || 6.96,
          operation.pricePerGram || 0,
          operation.total || 0,
          operation.createdBy || "system"
        ]);
      });

      res.json({ success: true, opId, resultMaterialId });
    } catch (e) {
      console.error("Smelting transaction failed:", e);
      res.status(500).json({ error: "Error al procesar la fundición" });
    }
  });

  // Export
  apiRouter.get("/export", async (req, res) => {
    const ops = await db.all("SELECT * FROM exportOperations ORDER BY date DESC");
    res.json(ops.map((o: any) => ({ ...o, sourceMaterialIds: JSON.parse(o.sourceMaterialIds) })));
  });

  apiRouter.post("/export", async (req, res) => {
    const { operation, materialIds } = req.body;
    const opId = crypto.randomUUID();
    const date = new Date().toISOString();

    try {
      await db.transaction(async () => {
        // 1. Update source materials status
        const placeholders = materialIds.map(() => "?").join(",");
        await db.run(`UPDATE materials SET status = 'exportado' WHERE id IN (${placeholders})`, materialIds);

        // 2. Create export operation record
        await db.run(`
          INSERT INTO exportOperations (
            id, sourceMaterialIds, date, totalWeight, marketPrice, pricePerGram, salePrice, createdBy, client, receiptNumber
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          opId, JSON.stringify(materialIds), date, operation.totalWeight,
          operation.marketPrice, operation.pricePerGram, operation.salePrice,
          operation.createdBy || "system", operation.client, operation.receiptNumber
        ]);
      });

      res.json({ success: true, opId });
    } catch (e) {
      console.error("Export transaction failed:", e);
      res.status(500).json({ error: "Error al procesar la exportación" });
    }
  });

  // Settings
  apiRouter.get("/settings", async (req, res) => {
    const settings = await db.get("SELECT * FROM companySettings LIMIT 1");
    res.json(settings);
  });

  apiRouter.post("/settings", async (req, res) => {
    const data = req.body;
    const updatedAt = new Date().toISOString();
    
    // Get the existing settings ID
    const existing = await db.get("SELECT id FROM companySettings LIMIT 1");
    const settingsId = existing ? existing.id : crypto.randomUUID();
    
    const allowedFields = ['name', 'address', 'phone', 'email', 'taxId', 'logoUrl'];
    const values = allowedFields.map(f => data[f] !== undefined ? data[f] : null);

    try {
      if (existing) {
        const setClause = allowedFields.map(f => `${f} = ?`).join(", ");
        await db.run(`UPDATE companySettings SET ${setClause}, updatedAt = ? WHERE id = ?`, [...values, updatedAt, settingsId]);
      } else {
        const columns = ['id', ...allowedFields, 'updatedAt'];
        const placeholders = columns.map(() => "?").join(", ");
        await db.run(`INSERT INTO companySettings (${columns.join(", ")}) VALUES (${placeholders})`, [settingsId, ...values, updatedAt]);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving settings:", error);
      res.status(500).json({ error: "Error al guardar la configuración" });
    }
  });

  apiRouter.put("/settings/:id", async (req, res) => {
    const data = req.body;
    const { id, ...updateData } = data;
    const fields = Object.keys(updateData).map(k => `${k} = ?`).join(", ");
    const values = Object.values(updateData);
    await db.run(`UPDATE companySettings SET ${fields} WHERE id = ?`, [...values, req.params.id]);
    res.json({ success: true });
  });

  // Database Configurations, Backup, Restore and Vaciar (Clear) Endpoints
  apiRouter.get("/database/config", async (req, res) => {
    try {
      const config = await getDatabaseConfig();
      res.json(config);
    } catch (e: any) {
      res.status(500).json({ error: "No se pudo obtener la configuración de la base de datos" });
    }
  });

  apiRouter.post("/database/config", async (req, res) => {
    try {
      const config = req.body;
      await saveDatabaseConfig(config);
      res.json({ success: true, message: "Configuración guardada. El servidor se reiniciará con la nueva base de datos." });
    } catch (e: any) {
      res.status(500).json({ error: "Error al guardar la configuración de la base de datos" });
    }
  });

  apiRouter.post("/database/test", async (req, res) => {
    const { type, mysql: mysqlConfig, sqlite: sqliteConfig } = req.body;
    if (type === 'mysql') {
      try {
        const conn = await mysql.createConnection({
          host: mysqlConfig.host || 'localhost',
          user: mysqlConfig.user || 'root',
          password: mysqlConfig.password || '',
          database: mysqlConfig.database || '',
          port: Number(mysqlConfig.port) || 3306,
          connectTimeout: 4000
        });
        await conn.query('SELECT 1');
        await conn.end();
        return res.json({ success: true, message: "Conexión a MySQL exitosa" });
      } catch (err: any) {
        console.error("Test MySQL connection failed:", err);
        return res.status(400).json({ success: false, error: `Error de conexión: ${err.message}` });
      }
    } else {
      try {
        const sqlitePath = sqliteConfig.path || 'database.sqlite';
        const sqliteExists = fs.existsSync(path.join(process.cwd(), sqlitePath));
        return res.json({ 
          success: true, 
          message: `Ruta de SQLite válida. ¿Existe archivo?: ${sqliteExists ? 'Sí (se usará el existente)' : 'No (se creará un archivo nuevo)'}` 
        });
      } catch (err: any) {
        return res.status(400).json({ success: false, error: err.message });
      }
    }
  });

  apiRouter.get("/database/stats", async (req, res) => {
    try {
      const config = await getDatabaseConfig();
      const tablesToCount = [
        "companySettings",
        "branches",
        "users",
        "clients",
        "branchBankAccounts",
        "referrers",
        "referrerPayouts",
        "materials",
        "smeltingOperations",
        "exportOperations",
        "goldPurchases",
        "goldPurchaseItems",
        "branchCashMoves",
        "branchClosures",
        "goldTransfers"
      ];

      const stats: Record<string, { sqlite: number; mysql: number }> = {};
      for (const t of tablesToCount) {
        stats[t] = { sqlite: 0, mysql: 0 };
      }

      // 1. Fetch SQLite stats
      try {
        const sqlitePath = config.sqlite?.path || 'database.sqlite';
        const absolutePath = path.join(process.cwd(), sqlitePath);
        if (fs.existsSync(absolutePath)) {
          const sDb = new Database(absolutePath);
          for (const t of tablesToCount) {
            try {
              const row: any = sDb.prepare(`SELECT COUNT(*) as count FROM ${t}`).get();
              stats[t].sqlite = row ? row.count : 0;
            } catch (e) {
              stats[t].sqlite = 0;
            }
          }
          sDb.close();
        }
      } catch (err) {
        console.error("Error reading SQLite stats:", err);
      }

      // 2. Fetch MySQL stats
      let mysqlError: string | null = null;
      try {
        const mysqlConfig = config.mysql;
        if (mysqlConfig && mysqlConfig.host && mysqlConfig.database) {
          const mysqlConn = await mysql.createConnection({
            host: mysqlConfig.host,
            user: mysqlConfig.user,
            password: mysqlConfig.password || '',
            database: mysqlConfig.database,
            port: Number(mysqlConfig.port) || 3306,
            connectTimeout: 1000
          });
          for (const t of tablesToCount) {
            try {
              const [rows]: any = await mysqlConn.query(`SELECT COUNT(*) as count FROM ${t}`);
              stats[t].mysql = rows && rows[0] ? rows[0].count : 0;
            } catch (e) {
              stats[t].mysql = 0;
            }
          }
          await mysqlConn.end();
        } else {
          mysqlError = "Configuración de MySQL incompleta (Falta host o nombre de base de datos).";
        }
      } catch (err: any) {
        console.warn(`[Database Monitor] MySQL stats unreachable: ${err.message || err} (code: ${err.code || 'UNKNOWN'})`);
        mysqlError = `Error de conexión: ${err.message || err}`;
      }

      res.json({
        success: true,
        stats,
        currentEngine: db.isMySQL ? "mysql" : "sqlite",
        mysqlError
      });
    } catch (err: any) {
      console.error("Error getting database stats:", err);
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post("/database/migrate", async (req, res) => {
    const { source, destination, clearDestination } = req.body;
    if (source === destination) {
      return res.status(400).json({ error: "La base de datos origen y destino no pueden ser iguales." });
    }

    try {
      const config = await getDatabaseConfig();
      const tablesToMigrate = [
        "companySettings",
        "branches",
        "users",
        "clients",
        "branchBankAccounts",
        "referrers",
        "referrerPayouts",
        "materials",
        "smeltingOperations",
        "exportOperations",
        "goldPurchases",
        "goldPurchaseItems",
        "branchCashMoves",
        "branchClosures",
        "goldTransfers"
      ];

      const migrationReport: Record<string, { read: number; inserted: number; errors: number }> = {};
      for (const t of tablesToMigrate) {
        migrationReport[t] = { read: 0, inserted: 0, errors: 0 };
      }

      // Initialize Connections
      const sqlitePath = config.sqlite?.path || 'database.sqlite';
      const absoluteSqlitePath = path.join(process.cwd(), sqlitePath);
      
      let sDb: any = null;
      let mysqlConn: any = null;

      try {
        sDb = new Database(absoluteSqlitePath);
      } catch (err: any) {
        if (source === 'sqlite') {
          return res.status(400).json({ error: `No se pudo conectar a SQLite: ${err.message}` });
        }
      }

      try {
        const mysqlConfig = config.mysql;
        if (mysqlConfig && mysqlConfig.host && mysqlConfig.database) {
          mysqlConn = await mysql.createConnection({
            host: mysqlConfig.host,
            user: mysqlConfig.user,
            password: mysqlConfig.password || '',
            database: mysqlConfig.database,
            port: Number(mysqlConfig.port) || 3306,
            connectTimeout: 4000
          });
        } else if (source === 'mysql' || destination === 'mysql') {
          return res.status(400).json({ error: "Configuración de MySQL incompleta." });
        }
      } catch (err: any) {
        if (sDb) sDb.close();
        return res.status(400).json({ error: `No se pudo conectar a MySQL: ${err.message}` });
      }

      // Clear Destination if requested
      if (clearDestination) {
        for (const t of tablesToMigrate) {
          try {
            if (destination === 'sqlite' && sDb) {
              sDb.prepare(`DELETE FROM ${t}`).run();
            } else if (destination === 'mysql' && mysqlConn) {
              await mysqlConn.execute(`DELETE FROM ${t}`);
            }
          } catch (e) {
            console.error(`Error clearing destination table ${t}:`, e);
          }
        }
      }

      // Perform Migration
      for (const t of tablesToMigrate) {
        let rows: any[] = [];
        
        // 1. Read rows from source
        try {
          if (source === 'sqlite' && sDb) {
            try {
              rows = sDb.prepare(`SELECT * FROM ${t}`).all();
            } catch (e) {
              rows = [];
            }
          } else if (source === 'mysql' && mysqlConn) {
            try {
              const [dbRows]: any = await mysqlConn.query(`SELECT * FROM ${t}`);
              rows = dbRows || [];
            } catch (e) {
              rows = [];
            }
          }
          migrationReport[t].read = rows.length;
        } catch (readErr: any) {
          console.error(`Error reading from ${source} table ${t}:`, readErr);
          migrationReport[t].errors++;
          continue;
        }

        // 2. Insert rows into destination
        if (rows.length === 0) continue;

        for (const row of rows) {
          try {
            const columns = Object.keys(row);
            const placeholders = columns.map(() => "?").join(", ");
            const colsList = columns.map(c => `\`${c}\``).join(", ");
            const values = Object.values(row).map(val => {
              if (typeof val === 'object' && val !== null) {
                return JSON.stringify(val);
              }
              return val;
            });

            const replaceSql = `REPLACE INTO ${t} (${colsList}) VALUES (${placeholders})`;

            if (destination === 'sqlite' && sDb) {
              sDb.prepare(replaceSql).run(...values);
            } else if (destination === 'mysql' && mysqlConn) {
              await mysqlConn.execute(replaceSql, values);
            }
            migrationReport[t].inserted++;
          } catch (insErr: any) {
            console.error(`Error inserting into ${destination} table ${t}:`, insErr);
            migrationReport[t].errors++;
          }
        }
      }

      // Close temporary connections
      if (sDb) sDb.close();
      if (mysqlConn) await mysqlConn.end();

      res.json({
        success: true,
        message: `Migración de ${source.toUpperCase()} a ${destination.toUpperCase()} completada de forma segura.`,
        report: migrationReport
      });
    } catch (err: any) {
      console.error("Migration failed:", err);
      res.status(500).json({ error: `Error durante la migración: ${err.message}` });
    }
  });

  apiRouter.get("/database/backup", async (req, res) => {
    try {
      const backupData: Record<string, any[]> = {};
      const tablesToBackup = [
        "companySettings",
        "branches",
        "users",
        "clients",
        "branchBankAccounts",
        "referrers",
        "referrerPayouts",
        "materials",
        "smeltingOperations",
        "exportOperations",
        "goldPurchases",
        "goldPurchaseItems",
        "branchCashMoves",
        "branchClosures",
        "goldTransfers"
      ];

      for (const table of tablesToBackup) {
        try {
          const rows = await db.all(`SELECT * FROM ${table}`);
          backupData[table] = rows;
        } catch (err) {
          console.error(`Error reading table ${table} for backup:`, err);
          backupData[table] = [];
        }
      }
      const config = await getDatabaseConfig();
      res.json({
        success: true,
        exportedAt: new Date().toISOString(),
        engine: db.isMySQL ? "mysql" : "sqlite",
        configType: config.type,
        tables: backupData
      });
    } catch (error: any) {
      console.error("Backup failed:", error);
      res.status(500).json({ error: "No se pudo generar el respaldo de la base de datos" });
    }
  });

  apiRouter.post("/database/restore", async (req, res) => {
    const { tables, branchId, clearBefore } = req.body;
    if (!tables) {
      return res.status(400).json({ error: "No se proporcionaron datos para restaurar" });
    }

    try {
      const isFiltered = branchId && branchId !== "all";
      
      const getBranchFilteredIdSet = (parentRows: any[], targetBrId: string) => {
        return new Set((parentRows || []).filter(p => p.branchId === targetBrId).map(p => p.id));
      };

      const validPurchaseIds = isFiltered && tables.goldPurchases ? getBranchFilteredIdSet(tables.goldPurchases, branchId) : null;

      // 1. Clear data if requested before restoring
      if (clearBefore) {
        if (isFiltered) {
          await db.run(`DELETE FROM goldPurchaseItems WHERE purchaseId IN (SELECT id FROM goldPurchases WHERE branchId = ?)`, [branchId]);
          await db.run(`DELETE FROM goldPurchases WHERE branchId = ?`, [branchId]);
          await db.run(`DELETE FROM branchCashMoves WHERE branchId = ?`, [branchId]);
          await db.run(`DELETE FROM branchClosures WHERE branchId = ?`, [branchId]);
          await db.run(`DELETE FROM goldTransfers WHERE branchId = ?`, [branchId]);
          await db.run(`DELETE FROM referrerPayouts WHERE branchId = ?`, [branchId]);
          await db.run(`DELETE FROM clients WHERE branchId = ?`, [branchId]);
          await db.run(`DELETE FROM referrers WHERE branchId = ?`, [branchId]);
          await db.run(`DELETE FROM branchBankAccounts WHERE branchId = ?`, [branchId]);
          await db.run(`DELETE FROM users WHERE branchId = ? AND role NOT IN ('admin', 'superadmin')`, [branchId]);
        } else {
          // Absolute system wipe except admin users
          const tablesToWipe = [
            "goldPurchaseItems", "goldPurchases", "branchCashMoves", "branchClosures", 
            "goldTransfers", "referrerPayouts", "clients", "referrers", 
            "branchBankAccounts", "materials", "smeltingOperations", "exportOperations"
          ];
          for (const tbl of tablesToWipe) {
            await db.run(`DELETE FROM ${tbl}`);
          }
          await db.run(`DELETE FROM users WHERE role NOT IN ('admin', 'superadmin')`);
          await db.run(`DELETE FROM branches`);
        }
      }

      // 2. Loop and upsert table rows
      const tableOrder = [
        "companySettings",
        "branches",
        "users",
        "clients",
        "branchBankAccounts",
        "referrers",
        "referrerPayouts",
        "materials",
        "smeltingOperations",
        "exportOperations",
        "goldPurchases",
        "goldPurchaseItems",
        "branchCashMoves",
        "branchClosures",
        "goldTransfers"
      ];

      for (const tableName of tableOrder) {
        const rows = tables[tableName];
        if (!Array.isArray(rows)) continue;

        for (const row of rows) {
          // If filtered by branch, check if we should import this row
          if (isFiltered) {
            const hasBranchProp = "branchId" in row;
            if (hasBranchProp && row.branchId !== branchId) {
              continue;
            }
            if (tableName === "goldPurchaseItems") {
              if (validPurchaseIds && !validPurchaseIds.has(row.purchaseId)) {
                continue;
              }
            }
            if (tableName === "users" && row.branchId && row.branchId !== branchId) {
              continue;
            }
            if (tableName === "branches" && row.id !== branchId) {
              continue;
            }
          }

          // Acknowledge that users shouldn't lose existing superadmins
          if (tableName === "users" && row.role === 'superadmin') {
            const userCheck = await db.get("SELECT id FROM users WHERE id = ?", [row.id]);
            if (userCheck) continue;
          }

          const columns = Object.keys(row);
          const values = Object.values(row);
          const idValue = row.id;
          if (!idValue) continue;

          const existing = await db.get(`SELECT id FROM ${tableName} WHERE id = ?`, [idValue]);
          if (existing) {
            const updateColumns = columns.filter(c => c !== 'id');
            if (updateColumns.length === 0) continue;
            const setClause = updateColumns.map(c => `\`${c}\` = ?`).join(", ");
            const updateValues = updateColumns.map(c => {
              const val = row[c];
              if (typeof val === 'object' && val !== null) {
                return JSON.stringify(val);
              }
              return val;
            });
            await db.run(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`, [...updateValues, idValue]);
          } else {
            const colList = columns.map(c => `\`${c}\``).join(", ");
            const placeholders = columns.map(() => "?").join(", ");
            const formattedValues = values.map(val => {
              if (typeof val === 'object' && val !== null) {
                return JSON.stringify(val);
              }
              return val;
            });
            try {
              await db.run(`INSERT INTO ${tableName} (${colList}) VALUES (${placeholders})`, formattedValues);
            } catch (errIns) {
              console.error(`Insert failed for table ${tableName} on row ${idValue}:`, errIns);
            }
          }
        }
      }

      res.json({ success: true, message: "Base de datos restaurada correctamente." });
    } catch (error: any) {
      console.error("Restore failed:", error);
      res.status(500).json({ error: `Error al restaurar: ${error.message}` });
    }
  });

  apiRouter.post("/database/clear", async (req, res) => {
    const { branchId, keepSuperadmins } = req.body;
    try {
      if (branchId && branchId !== "all") {
        console.log(`Clearing database data for branch: ${branchId}`);
        
        await db.run(`DELETE FROM goldPurchaseItems WHERE purchaseId IN (SELECT id FROM goldPurchases WHERE branchId = ?)`, [branchId]);
        await db.run(`DELETE FROM goldPurchases WHERE branchId = ?`, [branchId]);
        await db.run(`DELETE FROM branchCashMoves WHERE branchId = ?`, [branchId]);
        await db.run(`DELETE FROM branchClosures WHERE branchId = ?`, [branchId]);
        await db.run(`DELETE FROM goldTransfers WHERE branchId = ?`, [branchId]);
        await db.run(`DELETE FROM referrerPayouts WHERE branchId = ?`, [branchId]);
        await db.run(`DELETE FROM clients WHERE branchId = ?`, [branchId]);
        await db.run(`DELETE FROM referrers WHERE branchId = ?`, [branchId]);
        await db.run(`DELETE FROM branchBankAccounts WHERE branchId = ?`, [branchId]);
        
        if (keepSuperadmins) {
          await db.run(`DELETE FROM users WHERE branchId = ? AND role NOT IN ('admin', 'superadmin')`, [branchId]);
        } else {
          await db.run(`DELETE FROM users WHERE branchId = ?`, [branchId]);
        }
      } else {
        console.log("Clearing entire database...");
        
        const tablesToClear = [
          "goldPurchaseItems",
          "goldPurchases",
          "branchCashMoves",
          "branchClosures",
          "goldTransfers",
          "referrerPayouts",
          "clients",
          "referrers",
          "branchBankAccounts",
          "materials",
          "smeltingOperations",
          "exportOperations"
        ];
        
        for (const table of tablesToClear) {
          await db.run(`DELETE FROM ${table}`);
        }
        
        if (keepSuperadmins) {
          await db.run(`DELETE FROM users WHERE role NOT IN ('admin', 'superadmin')`);
        } else {
          await db.run(`DELETE FROM users WHERE role NOT IN ('admin', 'superadmin')`);
        }
        await db.run(`DELETE FROM branches`);
      }
      
      res.json({ success: true, message: "Datos vaciados con éxito" });
    } catch (error: any) {
      console.error("Error clearing database:", error);
      res.status(500).json({ error: "Error al vaciar los datos de la base de datos" });
    }
  });

  // Clients
  apiRouter.get("/clients", async (req, res) => {
    const { branchId } = req.query;
    let clients;
    if (branchId) {
      clients = await db.all("SELECT * FROM clients WHERE branchId = ?", [branchId]);
    } else {
      clients = await db.all("SELECT * FROM clients");
    }
    res.json(clients);
  });

  apiRouter.post("/clients", async (req, res) => {
    const client = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    
    // Clean CI: trim and convert empty to null
    const ci = typeof client.ci === 'string' ? client.ci.trim() : client.ci;
    const finalCI = ci === '' ? null : ci;

    try {
      await db.run(`
        INSERT INTO clients (
          id, name, phone, phoneCountryCode, email, ci, workplace, isMineCooperative, 
          recommendedBy, referentialPhone, referentialCountryCode, branchId, branchName, registeredBy, createdAt,
          photo, documentPhoto
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, client.name, client.phone, client.phoneCountryCode, client.email, finalCI, client.workplace, 
        client.isMineCooperative ? 1 : 0, client.recommendedBy, client.referentialPhone, 
        client.referentialCountryCode, client.branchId, client.branchName, client.registeredBy, createdAt,
        client.photo || null, client.documentPhoto || null
      ]);
      res.json({ ...client, id, createdAt, ci: finalCI });
    } catch (error: any) {
      res.status(500).json({ error: "Error al crear el cliente" });
    }
  });

  apiRouter.put("/clients/:id", async (req, res) => {
    const client = req.body;
    const { id, ...updateData } = client;
    
    // Convert boolean to integer
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
      await db.run(`UPDATE clients SET ${fields} WHERE id = ?`, [...values, req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Error al actualizar el cliente" });
    }
  });

  apiRouter.delete("/clients/:id", async (req, res) => {
    await db.run("DELETE FROM clients WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  });

  // Referrers
  apiRouter.get("/referrers", async (req, res) => {
    const { branchId } = req.query;
    let referrers;
    if (branchId) {
      referrers = await db.all("SELECT * FROM referrers WHERE branchId = ?", [branchId]);
    } else {
      referrers = await db.all("SELECT * FROM referrers");
    }
    res.json(referrers);
  });

  apiRouter.post("/referrers", async (req, res) => {
    const referrer = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    
    // Clean CI: trim and convert empty to null
    const ciRaw = referrer.ci;
    const ci = typeof ciRaw === 'string' ? ciRaw.trim() : ciRaw;
    const finalCI = (ci === '' || ci === null || ci === undefined) ? null : ci;

    try {
      await db.run(`
        INSERT INTO referrers (id, name, phone1, phone2, ci, branchId, createdAt, photo, documentPhoto)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, referrer.name || '', referrer.phone1 || '', referrer.phone2 || null, finalCI, referrer.branchId || '', createdAt, referrer.photo || null, referrer.documentPhoto || null]);
      res.json({ ...referrer, id, createdAt, ci: finalCI });
    } catch (error: any) {
      res.status(500).json({ error: "Error al crear el referido" });
    }
  });

  apiRouter.put("/referrers/:id", async (req, res) => {
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
      await db.run(`UPDATE referrers SET ${fields} WHERE id = ?`, [...values, req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: "Error al actualizar el referido" });
    }
  });

  apiRouter.delete("/referrers/:id", async (req, res) => {
    await db.run("DELETE FROM referrers WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  });

  // Referrer Payouts
  apiRouter.get("/referrer-payouts", async (req, res) => {
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
    const payouts = await db.all(query, params);
    res.json(payouts.map((p: any) => ({
      ...p,
      purchaseIds: JSON.parse(p.purchaseIds),
      purchaseReceipts: JSON.parse(p.purchaseReceipts)
    })));
  });

  apiRouter.post("/referrer-payouts", async (req, res) => {
    const { referrerId, referrerName, purchaseIds, purchaseReceipts, totalAmount, paidBy, branchId, notes } = req.body;
    const id = crypto.randomUUID();
    const paidAt = new Date().toISOString();

    try {
      await db.transaction(async () => {
        // Insert payout
        await db.run(`
          INSERT INTO referrerPayouts (id, referrerId, referrerName, purchaseIds, purchaseReceipts, totalAmount, paidAt, paidBy, branchId, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, referrerId, referrerName, JSON.stringify(purchaseIds), JSON.stringify(purchaseReceipts), totalAmount, paidAt, paidBy, branchId, notes || null]);

        // Update purchases as paid
        const placeholders = purchaseIds.map(() => "?").join(",");
        await db.run(`
          UPDATE goldPurchases 
          SET commissionPaid = 1, 
              commissionPaidAt = ?, 
              commissionPaidBy = ? 
          WHERE id IN (${placeholders})
        `, [paidAt, paidBy, ...purchaseIds]);
        // Register cash move
        await db.run(`
          INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, date, createdBy, referenceId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [crypto.randomUUID(), branchId, totalAmount, 'egreso', `Pago Referido: ${referrerName}`, 'pago_referido', 'efectivo', null, paidAt, paidBy, id]);

      });
      res.json({ id, paidAt });
    } catch (error) {
      console.error("Failed to process referrer payout:", error);
      res.status(500).json({ error: "Failed to process referrer payout" });
    }
  });

  // Gold Purchases
  apiRouter.get("/gold-purchases", async (req, res) => {
    const { branchId } = req.query;
    let purchases;
    if (branchId) {
      purchases = await db.all("SELECT * FROM goldPurchases WHERE branchId = ? ORDER BY createdAt DESC", [branchId]);
    } else {
      purchases = await db.all("SELECT * FROM goldPurchases ORDER BY createdAt DESC");
    }
    
    // Add items to each purchase
    const purchasesWithItems = await Promise.all(purchases.map(async (p: any) => {
      const items = await db.all("SELECT * FROM goldPurchaseItems WHERE purchaseId = ?", [p.id]);
      return { 
        ...p, 
        items,
        advances: p.advances ? JSON.parse(p.advances) : []
      };
    }));
    
    res.json(purchasesWithItems);
  });

  apiRouter.post("/gold-purchases", async (req, res) => {
    const { 
      branchId, clientId, total, type, referrerName, commission, 
      advancePayment, createdBy, items, date,
      advancePaymentType, advanceSourceBankAccountId, advanceClientBank, advanceClientAccountNumber, isFullPayment,
      advanceCashAmount, advanceBankAmount, advances
    } = req.body;
    const purchaseId = crypto.randomUUID();
    const createdAt = date ? new Date(date).toISOString() : new Date().toISOString();
    const closedAt = type === 'cerrado' ? createdAt : null;
    const closedBy = type === 'cerrado' ? createdBy : null;
    let receiptNumber = '';
    
    try {
      await db.transaction(async () => {
        const branch = await db.get("SELECT abbreviation FROM branches WHERE id = ?", [branchId]) as any;
        const abbr = branch ? branch.abbreviation : 'S';
        const year = new Date(createdAt).getFullYear().toString().slice(-2);
        const prefix = `${abbr}${year}`;
        const lastPurchase = await db.get(`
          SELECT receiptNumber FROM goldPurchases 
          WHERE branchId = ? AND receiptNumber LIKE ? 
          ORDER BY LENGTH(receiptNumber) DESC, receiptNumber DESC LIMIT 1
        `, [branchId, `${prefix}%`]) as any;
        
        let sequence = 1;
        if (lastPurchase) {
          const lastNum = parseInt(lastPurchase.receiptNumber.substring(prefix.length));
          if (!isNaN(lastNum)) sequence = lastNum + 1;
        }
        receiptNumber = `${prefix}${sequence.toString().padStart(2, '0')}`;

        // Insert main purchase
        await db.run(`
          INSERT INTO goldPurchases (
            id, receiptNumber, branchId, clientId, total, type, referrerName, commission, advancePayment, createdBy, createdAt,
            advancePaymentType, advanceSourceBankAccountId, advanceClientBank, advanceClientAccountNumber, isFullPayment,
            advanceCashAmount, advanceBankAmount, advances, closedAt, closedBy
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          purchaseId, receiptNumber, branchId, clientId, total, type, referrerName || null, 
          commission || 0, advancePayment || 0, createdBy, createdAt,
          advancePaymentType || 'efectivo', advanceSourceBankAccountId || null,
          advanceClientBank || null, advanceClientAccountNumber || null,
          isFullPayment ? 1 : 0,
          advanceCashAmount || 0,
          advanceBankAmount || 0,
          advances ? JSON.stringify(advances) : '[]',
          closedAt, closedBy
        ]);
        
        // Insert items
        if (items && Array.isArray(items)) {
          for (const item of items) {
            await db.run(`
              INSERT INTO goldPurchaseItems (
                id, purchaseId, initialWeight, finalWeight, marketPrice, 
                purity, pricePerGram, pricePerGram100, total, usdToBs, loss, lossPercentage, type, createdBy,
                otherQuotation, otherPurity, material100
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              crypto.randomUUID(), purchaseId, item.initialWeight, item.finalWeight, 
              item.marketPrice, item.purity, item.pricePerGram, item.pricePerGram100 || null, item.total, 
              item.usdToBs, item.loss, item.lossPercentage || 0, item.type || 'pieza', createdBy,
              item.otherQuotation || null, item.otherPurity || null, item.material100 || null
            ]);
          }
        }
        // Register initial advances
        if (advancePayment > 0) {
            const concept = isFullPayment ? `Pago Total Compra: ${receiptNumber}` : `Adelanto de la compra: ${receiptNumber}`;
            if (advancePaymentType === 'efectivo') {
                await db.run(`
                  INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, date, createdBy, referenceId)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [crypto.randomUUID(), branchId, advancePayment, 'egreso', concept, 'adelanto', 'efectivo', null, createdAt, createdBy, purchaseId]);
            } else if (advancePaymentType === 'transferencia') {
                await db.run(`
                  INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, date, createdBy, referenceId)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [crypto.randomUUID(), branchId, advancePayment, 'egreso', concept, 'adelanto', 'transferencia', advanceSourceBankAccountId || null, createdAt, createdBy, purchaseId]);
            } else if (advancePaymentType === 'mixto') {
                if ((advanceCashAmount || 0) > 0) {
                    await db.run(`
                      INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, date, createdBy, referenceId)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [crypto.randomUUID(), branchId, advanceCashAmount, 'egreso', `${concept} (Efectivo)`, 'adelanto', 'efectivo', null, createdAt, createdBy, purchaseId]);
                }
                if ((advanceBankAmount || 0) > 0) {
                    await db.run(`
                      INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, date, createdBy, referenceId)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [crypto.randomUUID(), branchId, advanceBankAmount, 'egreso', `${concept} (Banco)`, 'adelanto', 'transferencia', advanceSourceBankAccountId || null, createdAt, createdBy, purchaseId]);
                }
            }
        }

      });
      
      res.json({ 
        id: purchaseId, receiptNumber, branchId, clientId, total, type, createdBy, createdAt, items,
        advancePaymentType, advanceSourceBankAccountId, advanceClientBank, advanceClientAccountNumber, isFullPayment,
        advanceCashAmount, advanceBankAmount
      });
    } catch (error) {
      console.error("Failed to save gold purchase:", error);
      res.status(500).json({ error: "Failed to save gold purchase" });
    }
  });

  apiRouter.post("/gold-purchases/:id/close", async (req, res) => {
    const { id } = req.params;
    const { 
      closedBy, closeMarketPrice, closeUsdToBs, closeTotal, items,
      closePaymentType, closeCashAmount, closeBankAmount, closeSourceBankAccountId, closeClientBank, closeClientAccountNumber
    } = req.body;
    const closedAt = new Date().toISOString();

    try {
      await db.transaction(async () => {
        const purchase = await db.get("SELECT branchId, receiptNumber, advancePayment, advances FROM goldPurchases WHERE id = ?", [id]) as any;
        if (!purchase) throw new Error("Compra no encontrada");

        // Update purchase record
        await db.run(`
          UPDATE goldPurchases 
          SET type = 'cerrado', 
              closedAt = ?, 
              closedBy = ?, 
              closeMarketPrice = ?, 
              closeUsdToBs = ?, 
              closeTotal = ?,
              closePaymentType = ?,
              closeCashAmount = ?,
              closeBankAmount = ?,
              closeSourceBankAccountId = ?,
              closeClientBank = ?,
              closeClientAccountNumber = ?
          WHERE id = ?
        `, [
          closedAt, 
          closedBy, 
          closeMarketPrice, 
          closeUsdToBs, 
          closeTotal,
          closePaymentType || 'efectivo',
          closeCashAmount || 0,
          closeBankAmount || 0,
          closeSourceBankAccountId || null,
          closeClientBank || null,
          closeClientAccountNumber || null,
          id
        ]);

        // Register liquidation cash move
        const advancesList = purchase.advances ? JSON.parse(purchase.advances) : [];
        const totalAdvances = (purchase.advancePayment || 0) + (Array.isArray(advancesList) ? advancesList.reduce((acc: number, a: any) => acc + (a.amount || 0), 0) : 0);
        const amountToPayNow = closeTotal - totalAdvances;
        
        if (amountToPayNow > 0) {
            const concept = `Liquidación Compra: ${purchase.receiptNumber}`;
            const finalPaymentType = closePaymentType || 'efectivo';
            if (finalPaymentType === 'efectivo') {
                await db.run(`
                  INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, date, createdBy, referenceId)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [crypto.randomUUID(), purchase.branchId, amountToPayNow, 'egreso', concept, 'compra', 'efectivo', null, closedAt, closedBy, id]);
            } else if (finalPaymentType === 'transferencia') {
                await db.run(`
                  INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, date, createdBy, referenceId)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [crypto.randomUUID(), purchase.branchId, amountToPayNow, 'egreso', concept, 'compra', 'transferencia', closeSourceBankAccountId || null, closedAt, closedBy, id]);
            } else if (finalPaymentType === 'mixto') {
                if ((closeCashAmount || 0) > 0) {
                    await db.run(`
                      INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, date, createdBy, referenceId)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [crypto.randomUUID(), purchase.branchId, closeCashAmount, 'egreso', `${concept} (Efectivo)`, 'compra', 'efectivo', null, closedAt, closedBy, id]);
                }
                if ((closeBankAmount || 0) > 0) {
                    await db.run(`
                      INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, date, createdBy, referenceId)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [crypto.randomUUID(), purchase.branchId, closeBankAmount, 'egreso', `${concept} (Transferencia)`, 'compra', 'transferencia', closeSourceBankAccountId || null, closedAt, closedBy, id]);
                }
            }
        }

        // Update items if provided
        if (items && Array.isArray(items)) {
          for (const item of items) {
            await db.run(`
              UPDATE goldPurchaseItems 
              SET closeMarketPrice = ?, 
                  closeUsdToBs = ?, 
                  closePricePerGram = ?, 
                  closeTotal = ? 
              WHERE id = ?
            `, [
              item.closeMarketPrice, 
              item.closeUsdToBs, 
              item.closePricePerGram, 
              item.closeTotal, 
              item.id
            ]);
          }
        }
      });
      res.json({ success: true, closedAt, closedBy });
    } catch (error) {
      console.error("Failed to close gold purchase:", error);
      res.status(500).json({ error: "Failed to close gold purchase" });
    }
  });

  apiRouter.put("/gold-purchases/:id", async (req, res) => {
    const { id } = req.params;
    const purchaseData = req.body;
    const { items, ...updateData } = purchaseData;

    try {
      await db.transaction(async () => {
        // 1. Get existing purchase
        const existingPurchase = await db.get("SELECT * FROM goldPurchases WHERE id = ?", [id]) as any;
        if (!existingPurchase) throw new Error("Purchase not found");

        const oldAdvances = existingPurchase.advances ? JSON.parse(existingPurchase.advances) : [];
        const newAdvances = purchaseData.advances || [];

        // 2. Detect NEW advances
        const newItems = newAdvances.slice(oldAdvances.length);

        for (const adv of newItems) {
          if (adv.amount > 0) {
            const concept = `Adelanto de la compra: ${existingPurchase.receiptNumber}`;
            if (adv.paymentType === 'efectivo') {
              await db.run(`
                 INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, date, createdBy, referenceId)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [crypto.randomUUID(), existingPurchase.branchId, adv.amount, 'egreso', concept, 'adelanto', 'efectivo', null, adv.date || new Date().toISOString(), adv.createdBy || 'system', id]);
            } else if (adv.paymentType === 'transferencia') {
              await db.run(`
                 INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, date, createdBy, referenceId)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [crypto.randomUUID(), existingPurchase.branchId, adv.amount, 'egreso', concept, 'adelanto', 'transferencia', adv.bankAccountId || null, adv.date || new Date().toISOString(), adv.createdBy || 'system', id]);
            } else if (adv.paymentType === 'mixto') {
              if ((adv.cashAmount || 0) > 0) {
                await db.run(`
                   INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, date, createdBy, referenceId)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [crypto.randomUUID(), existingPurchase.branchId, adv.cashAmount, 'egreso', `${concept} (Efectivo)`, 'adelanto', 'efectivo', null, adv.date || new Date().toISOString(), adv.createdBy || 'system', id]);
              }
              if ((adv.bankAmount || 0) > 0) {
                await db.run(`
                   INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, date, createdBy, referenceId)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [crypto.randomUUID(), existingPurchase.branchId, adv.bankAmount, 'egreso', `${concept} (Banco)`, 'adelanto', 'transferencia', adv.bankAccountId || null, adv.date || new Date().toISOString(), adv.createdBy || 'system', id]);
              }
            }
          }
        }

        // 3. Update the purchase record
        if (updateData.advances) {
          updateData.advances = JSON.stringify(updateData.advances);
        }

        const fields = Object.keys(updateData).map(k => `${k} = ?`).join(", ");
        const values = Object.values(updateData);
        await db.run(`UPDATE goldPurchases SET ${fields} WHERE id = ?`, [...values, id]);
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Failed to update gold purchase:", error);
      res.status(500).json({ error: "Failed to update gold purchase" });
    }
  });

  apiRouter.delete("/gold-purchases/:id", async (req, res) => {
    await db.run("DELETE FROM goldPurchases WHERE id = ?", [req.params.id]);
    res.json({ success: true });
  });

  // Gold Transfers
  apiRouter.get("/gold-transfers", async (req, res) => {
    const { branchId } = req.query;
    let transfers;
    if (branchId) {
      transfers = await db.all("SELECT * FROM goldTransfers WHERE branchId = ? ORDER BY sentAt DESC", [branchId]);
    } else {
      transfers = await db.all("SELECT * FROM goldTransfers ORDER BY sentAt DESC");
    }
    res.json(transfers.map((t: any) => ({ ...t, materialIds: JSON.parse(t.materialIds) })));
  });

  apiRouter.post("/gold-transfers", async (req, res) => {
    const { branchId, materialIds, totalWeight, totalGrams100, sentBy } = req.body;
    const id = crypto.randomUUID();
    const sentAt = new Date().toISOString();

    try {
      await db.transaction(async () => {
        // Create transfer record
        await db.run(`
          INSERT INTO goldTransfers (id, branchId, materialIds, totalWeight, totalGrams100, sentBy, sentAt, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, branchId, JSON.stringify(materialIds), totalWeight, totalGrams100, sentBy, sentAt, 'en_transito']);

        // Update purchase items
        const placeholders = materialIds.map(() => "?").join(",");
        await db.run(`
          UPDATE goldPurchaseItems 
          SET isTransferred = 1, transferId = ? 
          WHERE id IN (${placeholders})
        `, [id, ...materialIds]);
      });
      res.json({ id, sentAt });
    } catch (error) {
      console.error("Failed to process gold transfer:", error);
      res.status(500).json({ error: "Failed to process gold transfer" });
    }
  });

  apiRouter.put("/gold-transfers/:id/receive", async (req, res) => {
    const { id } = req.params;
    const { receivedBy } = req.body;
    const receivedAt = new Date().toISOString();

    try {
      await db.run(`
        UPDATE goldTransfers 
        SET status = 'recibido', receivedBy = ?, receivedAt = ? 
        WHERE id = ?
      `, [receivedBy, receivedAt, id]);
      res.json({ success: true, receivedAt });
    } catch (error) {
      console.error("Failed to receive gold transfer:", error);
      res.status(500).json({ error: "Failed to receive gold transfer" });
    }
  });

  apiRouter.post("/gold-transfers/verify-item", async (req, res) => {
    const { itemId, validatedData, verifiedBy } = req.body;
    const verifiedAt = new Date().toISOString();

    try {
      await db.transaction(async () => {
        // 1. Update purchase item as verified
        await db.run(`
          UPDATE goldPurchaseItems 
          SET isVerifiedInCentral = 1 
          WHERE id = ?
        `, [itemId]);

        // 2. Insert into central inventory (materials table)
        await db.run(`
          INSERT INTO materials (
            id, receiptNumber, client, initialWeight, finalWeight, marketPrice,
            loss, purity, usdToBs, pricePerGram, pricePerGram100, lossPercentage, registrationDate,
            total, type, status, createdBy
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          crypto.randomUUID(),
          validatedData.receiptNumber,
          validatedData.clientName,
          validatedData.initialWeight,
          validatedData.finalWeight,
          validatedData.marketPrice,
          validatedData.loss || 0,
          validatedData.purity,
          validatedData.usdToBs,
          validatedData.pricePerGram,
          validatedData.pricePerGram100 || null,
          validatedData.lossPercentage || 0,
          verifiedAt,
          validatedData.total,
          validatedData.type,
          'disponible',
          verifiedBy
        ]);
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to verify gold item:", error);
      res.status(500).json({ error: "Failed to verify gold item" });
    }
  });

  // Branch Cash Management
  apiRouter.get("/branches/:branchId/cash-moves", async (req, res) => {
    const { branchId } = req.params;
    const { all, closureId } = req.query; // If 'all' is passed, return everything, otherwise only pending
    
    let query = "SELECT * FROM branchCashMoves WHERE branchId = ?";
    let params: any[] = [branchId];
    if (closureId) {
      query += " AND closureId = ?";
      params.push(closureId);
    } else if (all !== 'true') {
      query += " AND closureId IS NULL";
    }
    query += " ORDER BY `date` DESC";
    
    const moves = await db.all(query, params);
    res.json(moves);
  });

  apiRouter.post("/branches/:branchId/cash-moves", async (req, res) => {
    const { branchId } = req.params;
    const { amount, type, concept, category, paymentType, bankAccountId, date, createdBy, referenceId } = req.body;
    const id = crypto.randomUUID();
    await db.run(`
      INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, \`date\`, createdBy, referenceId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, branchId, amount, type, concept, category, paymentType, bankAccountId || null, date || new Date().toISOString(), createdBy, referenceId || null]);
    res.json({ id, branchId, amount, type, concept, category, paymentType, bankAccountId, date: date || new Date().toISOString(), createdBy, referenceId });
  });

  apiRouter.put("/branches/:branchId/cash-moves/:moveId", async (req, res) => {
    const { branchId, moveId } = req.params;
    const updateData = req.body;
    const { id, branchId: bId, ...fieldsToUpdate } = updateData;

    try {
      const fields = Object.keys(fieldsToUpdate).map(k => `\`${k}\` = ?`).join(", ");
      const values = Object.values(fieldsToUpdate);
      await db.run(`UPDATE branchCashMoves SET ${fields} WHERE id = ? AND branchId = ?`, [...values, moveId, branchId]);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to update cash move:", error);
      res.status(500).json({ error: "Error al actualizar el movimiento" });
    }
  });

  apiRouter.get("/branches/:branchId/closures", async (req, res) => {
    const closures = await db.all("SELECT * FROM branchClosures WHERE branchId = ? ORDER BY `date` DESC", [req.params.branchId]);
    res.json(closures);
  });

  apiRouter.post("/branches/:branchId/closures", async (req, res) => {
    const { branchId } = req.params;
    const { notes, createdBy } = req.body;
    const closureDate = new Date().toISOString().split('T')[0];
    const closedAt = new Date().toISOString();
    const closureId = crypto.randomUUID();

    try {
      // Calculate balances ONLY from pending moves (closureId IS NULL) and ONLY effective cash
      await db.transaction(async () => {
        const moves = await db.all("SELECT * FROM branchCashMoves WHERE branchId = ? AND closureId IS NULL", [branchId]);
        const cashMoves = moves.filter((m: any) => m.paymentType === 'efectivo');
        const incomes = cashMoves.filter((m: any) => m.type === 'ingreso').reduce((acc: number, m: any) => acc + (Number(m.amount) || 0), 0);
        const expenses = cashMoves.filter((m: any) => m.type === 'egreso').reduce((acc: number, m: any) => acc + (Number(m.amount) || 0), 0);
        const cycleBalance = incomes - expenses;

        const lastClosure = await db.get("SELECT finalBalance FROM branchClosures WHERE branchId = ? ORDER BY \`date\` DESC LIMIT 1", [branchId]) as any;
        const initialBalance = lastClosure ? lastClosure.finalBalance : 0;
        const finalBalance = initialBalance + cycleBalance;

        // Insert closure record
        await db.run(`
          INSERT INTO branchClosures (id, branchId, \`date\`, initialBalance, totalCashIn, totalCashOut, finalBalance, status, createdBy, closedAt, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [closureId, branchId, closureDate, initialBalance, incomes, expenses, finalBalance, 'cerrado', createdBy, closedAt, notes || null]);

        // Link pending moves to this closure
        await db.run("UPDATE branchCashMoves SET closureId = ? WHERE branchId = ? AND closureId IS NULL", [closureId, branchId]);

        // Link pending purchases to this closure
        await db.run(`
          UPDATE goldPurchases
          SET closureId = ?
          WHERE id IN (
            SELECT DISTINCT referenceId 
            FROM branchCashMoves 
            WHERE closureId = ? AND (category = 'compra' OR category = 'adelanto')
          )
        `, [closureId, closureId]);
      });
      res.json({ success: true, id: closureId });
    } catch (error) {
      console.error("Closure failed:", error);
      res.status(500).json({ error: "Failed to create closure" });
    }
  });

  // Mount API router FIRST
  app.use("/api", apiRouter);

  // API 404 handler: if a request starts with /api but didn't match any route
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
  }).on('error', (err: any) => {
    const errorMsg = `Server error: ${err.message}`;
    fs.appendFileSync("startup_log.txt", `${new Date().toISOString()} - ${errorMsg}\n`);
    if (err.code === 'EADDRINUSE') {
      console.error(`Error: Port ${PORT} is already in use. Please close the process using it and try again.`);
    } else {
      console.error(errorMsg, err);
    }
    process.exit(1);
  });

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Global error handler caught:", err);
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
