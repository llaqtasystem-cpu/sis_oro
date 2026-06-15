import express from "express";
console.log("SERVER SCRIPT LOADING...");
import { WebSocketServer, WebSocket } from "ws";
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
  let db = await initDatabase();
  const app = express();
  let broadcast: (event: string, payload?: any) => void = () => {};

  async function getCompanyTimezone(): Promise<string> {
    try {
      const settings = await db.get("SELECT timezone FROM companySettings LIMIT 1");
      return settings?.timezone || "America/La_Paz";
    } catch (e) {
      return "America/La_Paz";
    }
  }

  function getCurrentDateInTimezone(timezone: string): string {
    const d = new Date();
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const parts = formatter.formatToParts(d);
      const m: Record<string, string> = {};
      parts.forEach(p => m[p.type] = p.value);
      return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}:${m.second}.000Z`;
    } catch (e) {
      return d.toISOString();
    }
  }

  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      console.log(`[API] ${req.method} ${req.url}`);
    }
    next();
  });

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
      loginBgUrl VARCHAR(255),
      inactivityTimeout INTEGER DEFAULT 10,
      timezone VARCHAR(255) DEFAULT 'America/La_Paz',
      maxStayMinutes INTEGER DEFAULT 2880,
      maxStayMinutes_pieza INTEGER DEFAULT 2880,
      maxStayMinutes_barra INTEGER DEFAULT 2880,
      notifyVisual_pieza INTEGER DEFAULT 1,
      notifyVisual_barra INTEGER DEFAULT 1,
      notifySound_pieza INTEGER DEFAULT 1,
      notifySound_barra INTEGER DEFAULT 1,
      cashDenominations TEXT,
      lowPurityThreshold_pieza DOUBLE DEFAULT 50.0,
      lowPurityThreshold_barra DOUBLE DEFAULT 50.0,
      updatedAt VARCHAR(255) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS branches (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      abbreviation VARCHAR(255) NOT NULL,
      location VARCHAR(255),
      phone VARCHAR(255),
      phoneCountryCode VARCHAR(10) DEFAULT '591',
      referentialPhone VARCHAR(255),
      referentialCountryCode VARCHAR(10) DEFAULT '591',
      managerId VARCHAR(255),
      active INTEGER DEFAULT 1,
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
      documentPhotoBack TEXT,
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
      phone1CountryCode VARCHAR(10) DEFAULT '591',
      phone2 VARCHAR(255),
      phone2CountryCode VARCHAR(10) DEFAULT '591',
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
      openEstimateFactor DOUBLE DEFAULT 90,
      expirationDays INTEGER DEFAULT 15,
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
      advances LONGTEXT,
      photo TEXT,
      closeSignature TEXT,
      payments LONGTEXT,
      isHistoric INTEGER DEFAULT 0
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
      notes TEXT,
      physicalBalance DOUBLE,
      differenceAmount DOUBLE,
      differenceJustification TEXT,
      cashCountBreakdown TEXT
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
      closePricePerGram100 DOUBLE,
      closeTotal DOUBLE,
      otherQuotation DOUBLE,
      otherPurity DOUBLE,
      material100 DOUBLE,
      isTransferred INTEGER DEFAULT 0,
      isVerifiedInCentral INTEGER DEFAULT 0,
      transferId VARCHAR(255),
      photo TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id VARCHAR(255) PRIMARY KEY,
      userId VARCHAR(255) NOT NULL,
      credentialId TEXT NOT NULL,
      publicKey TEXT,
      createdAt VARCHAR(255) NOT NULL
    )`
  ];

  async function applySchemaAndMigrations(targetDb: DB) {
    try {
      for (const tableSql of tables) {
        await targetDb.exec(tableSql);
      }
      console.log("[Db Schema] Master tables loaded/verified successfully.");
    } catch (err: any) {
      console.error("[Db Schema] Error initializing master tables:", err);
    }

    try {
      if (!await columnExists(targetDb, 'goldTransfers', 'totalGrams100')) {
        await targetDb.exec("ALTER TABLE goldTransfers ADD COLUMN totalGrams100 DOUBLE");
      }
      
      // Migrate status 'en_camino' to 'en_transito'
      await targetDb.run("UPDATE goldTransfers SET status = 'en_transito' WHERE status = 'en_camino'");

      if (!await columnExists(targetDb, 'goldPurchaseItems', 'otherQuotation')) {
        if (await columnExists(targetDb, 'goldPurchaseItems', 'otherWeight')) {
          await targetDb.exec("ALTER TABLE goldPurchaseItems RENAME COLUMN otherWeight TO otherQuotation");
        } else {
          await targetDb.exec("ALTER TABLE goldPurchaseItems ADD COLUMN otherQuotation DOUBLE");
        }
      }
      if (!await columnExists(targetDb, 'goldPurchaseItems', 'otherPurity')) {
        await targetDb.exec("ALTER TABLE goldPurchaseItems ADD COLUMN otherPurity DOUBLE");
      }

      if (!await columnExists(targetDb, 'goldPurchaseItems', 'material100')) {
        await targetDb.exec("ALTER TABLE goldPurchaseItems ADD COLUMN material100 DOUBLE");
      }

      if (!await columnExists(targetDb, 'goldPurchaseItems', 'pricePerGram100')) {
        await targetDb.exec("ALTER TABLE goldPurchaseItems ADD COLUMN pricePerGram100 DOUBLE");
      }

      if (!await columnExists(targetDb, 'materials', 'pricePerGram100')) {
        await targetDb.exec("ALTER TABLE materials ADD COLUMN pricePerGram100 DOUBLE");
      }

      // Clients migrations
      if (!await columnExists(targetDb, 'clients', 'ci')) await targetDb.exec("ALTER TABLE clients ADD COLUMN ci VARCHAR(255)");
      if (!await columnExists(targetDb, 'clients', 'workplace')) await targetDb.exec("ALTER TABLE clients ADD COLUMN workplace VARCHAR(255)");
      if (!await columnExists(targetDb, 'clients', 'isMineCooperative')) await targetDb.exec("ALTER TABLE clients ADD COLUMN isMineCooperative INTEGER DEFAULT 0");
      if (!await columnExists(targetDb, 'clients', 'branchName')) await targetDb.exec("ALTER TABLE clients ADD COLUMN branchName VARCHAR(255)");
      if (!await columnExists(targetDb, 'clients', 'registeredBy')) await targetDb.exec("ALTER TABLE clients ADD COLUMN registeredBy VARCHAR(255)");
      if (!await columnExists(targetDb, 'clients', 'referentialPhone')) await targetDb.exec("ALTER TABLE clients ADD COLUMN referentialPhone VARCHAR(255)");
      if (!await columnExists(targetDb, 'clients', 'phoneCountryCode')) await targetDb.exec("ALTER TABLE clients ADD COLUMN phoneCountryCode VARCHAR(10) DEFAULT '591'");
      if (!await columnExists(targetDb, 'clients', 'referentialCountryCode')) await targetDb.exec("ALTER TABLE clients ADD COLUMN referentialCountryCode VARCHAR(10) DEFAULT '591'");

      if (!await columnExists(targetDb, 'branches', 'abbreviation')) {
        await targetDb.exec("ALTER TABLE branches ADD COLUMN abbreviation VARCHAR(255) NOT NULL DEFAULT 'S'");
      }

      if (!await columnExists(targetDb, 'branches', 'active')) {
        await targetDb.exec("ALTER TABLE branches ADD COLUMN active INTEGER DEFAULT 1");
      }

      if (!await columnExists(targetDb, 'branches', 'phoneCountryCode')) {
        await targetDb.exec("ALTER TABLE branches ADD COLUMN phoneCountryCode VARCHAR(10) DEFAULT '591'");
      }

      if (!await columnExists(targetDb, 'branches', 'referentialPhone')) {
        await targetDb.exec("ALTER TABLE branches ADD COLUMN referentialPhone VARCHAR(255)");
      }

      if (!await columnExists(targetDb, 'branches', 'referentialCountryCode')) {
        await targetDb.exec("ALTER TABLE branches ADD COLUMN referentialCountryCode VARCHAR(10) DEFAULT '591'");
      }

      // Purchase migrations
      if (!await columnExists(targetDb, 'goldPurchases', 'referrerName')) await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN referrerName VARCHAR(255)");
      if (!await columnExists(targetDb, 'goldPurchases', 'commission')) await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN commission DOUBLE DEFAULT 0");
      if (!await columnExists(targetDb, 'goldPurchases', 'commissionPaid')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN commissionPaid INTEGER DEFAULT 0");
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN commissionPaidAt VARCHAR(255)");
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN commissionPaidBy VARCHAR(255)");
      }
      if (!await columnExists(targetDb, 'goldPurchases', 'advancePayment')) await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN advancePayment DOUBLE DEFAULT 0");
      if (!await columnExists(targetDb, 'goldPurchases', 'closedAt')) await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN closedAt VARCHAR(255)");
      if (!await columnExists(targetDb, 'goldPurchases', 'closedBy')) await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN closedBy VARCHAR(255)");
      if (!await columnExists(targetDb, 'goldPurchases', 'closeMarketPrice')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN closeMarketPrice DOUBLE");
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN closeUsdToBs DOUBLE");
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN closeTotal DOUBLE");
      }

      if (!await columnExists(targetDb, 'goldPurchaseItems', 'closeMarketPrice')) {
        await targetDb.exec("ALTER TABLE goldPurchaseItems ADD COLUMN closeMarketPrice DOUBLE");
        await targetDb.exec("ALTER TABLE goldPurchaseItems ADD COLUMN closeUsdToBs DOUBLE");
        await targetDb.exec("ALTER TABLE goldPurchaseItems ADD COLUMN closePricePerGram DOUBLE");
        await targetDb.exec("ALTER TABLE goldPurchaseItems ADD COLUMN closeTotal DOUBLE");
      }

      if (!await columnExists(targetDb, 'goldPurchaseItems', 'closePricePerGram100')) {
        await targetDb.exec("ALTER TABLE goldPurchaseItems ADD COLUMN closePricePerGram100 DOUBLE");
      }

      if (!await columnExists(targetDb, 'goldPurchaseItems', 'isTransferred')) {
        await targetDb.exec("ALTER TABLE goldPurchaseItems ADD COLUMN isTransferred INTEGER DEFAULT 0");
        await targetDb.exec("ALTER TABLE goldPurchaseItems ADD COLUMN transferId VARCHAR(255)");
      }

      if (!await columnExists(targetDb, 'goldPurchaseItems', 'isVerifiedInCentral')) {
        await targetDb.exec("ALTER TABLE goldPurchaseItems ADD COLUMN isVerifiedInCentral INTEGER DEFAULT 0");
      }

      // New Bank and Payment fields
      if (!await columnExists(targetDb, 'goldPurchases', 'advancePaymentType')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN advancePaymentType VARCHAR(50) DEFAULT 'efectivo'");
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN advanceSourceBankAccountId VARCHAR(255)");
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN advanceClientBank VARCHAR(255)");
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN advanceClientAccountNumber VARCHAR(255)");
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN isFullPayment INTEGER DEFAULT 0");
      }

      if (!await columnExists(targetDb, 'goldPurchases', 'advanceCashAmount')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN advanceCashAmount DOUBLE DEFAULT 0");
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN advanceBankAmount DOUBLE DEFAULT 0");
      }
      
      if (!await columnExists(targetDb, 'goldPurchases', 'advances')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN advances LONGTEXT");
      }

      if (!await columnExists(targetDb, 'goldPurchases', 'closePaymentType')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN closePaymentType VARCHAR(50) DEFAULT 'efectivo'");
      }
      if (!await columnExists(targetDb, 'goldPurchases', 'closeCashAmount')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN closeCashAmount DOUBLE DEFAULT 0");
      }
      if (!await columnExists(targetDb, 'goldPurchases', 'closeBankAmount')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN closeBankAmount DOUBLE DEFAULT 0");
      }
      if (!await columnExists(targetDb, 'goldPurchases', 'closeSourceBankAccountId')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN closeSourceBankAccountId VARCHAR(255)");
      }
      if (!await columnExists(targetDb, 'goldPurchases', 'closeClientBank')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN closeClientBank VARCHAR(255)");
      }
      if (!await columnExists(targetDb, 'goldPurchases', 'closeClientAccountNumber')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN closeClientAccountNumber VARCHAR(255)");
      }
      if (!await columnExists(targetDb, 'goldPurchases', 'closureId')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN closureId VARCHAR(255)");
      }
      if (!await columnExists(targetDb, 'goldPurchases', 'openEstimateFactor')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN openEstimateFactor DOUBLE DEFAULT 90");
      }
      if (!await columnExists(targetDb, 'goldPurchases', 'expirationDays')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN expirationDays INTEGER DEFAULT 15");
      }
      if (!await columnExists(targetDb, 'goldPurchases', 'payments')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN payments LONGTEXT");
      }

      // Branch management migrations
      if (!await columnExists(targetDb, 'branchClosures', 'date')) {
        await targetDb.exec("ALTER TABLE branchClosures ADD COLUMN date VARCHAR(255)");
      }
      if (!await columnExists(targetDb, 'branchClosures', 'physicalBalance')) {
        await targetDb.exec("ALTER TABLE branchClosures ADD COLUMN physicalBalance DOUBLE");
      }
      if (!await columnExists(targetDb, 'branchClosures', 'differenceAmount')) {
        await targetDb.exec("ALTER TABLE branchClosures ADD COLUMN differenceAmount DOUBLE");
      }
      if (!await columnExists(targetDb, 'branchClosures', 'differenceJustification')) {
        await targetDb.exec("ALTER TABLE branchClosures ADD COLUMN differenceJustification TEXT");
      }
      if (!await columnExists(targetDb, 'branchCashMoves', 'date')) {
        await targetDb.exec("ALTER TABLE branchCashMoves ADD COLUMN date VARCHAR(255)");
      }
      if (!await columnExists(targetDb, 'branchCashMoves', 'closureId')) {
        await targetDb.exec("ALTER TABLE branchCashMoves ADD COLUMN closureId VARCHAR(255)");
      }
      if (!await columnExists(targetDb, 'branchCashMoves', 'bankAccountId')) {
        await targetDb.exec("ALTER TABLE branchCashMoves ADD COLUMN bankAccountId VARCHAR(255)");
      }
      if (!await columnExists(targetDb, 'users', 'photo')) {
        await targetDb.exec("ALTER TABLE users ADD COLUMN photo TEXT");
      }
      if (!await columnExists(targetDb, 'clients', 'photo')) {
        await targetDb.exec("ALTER TABLE clients ADD COLUMN photo TEXT");
      }
      if (!await columnExists(targetDb, 'clients', 'documentPhoto')) {
        await targetDb.exec("ALTER TABLE clients ADD COLUMN documentPhoto TEXT");
      }
      if (!await columnExists(targetDb, 'clients', 'documentPhotoBack')) {
        await targetDb.exec("ALTER TABLE clients ADD COLUMN documentPhotoBack TEXT");
      }
      if (!await columnExists(targetDb, 'referrers', 'photo')) {
        await targetDb.exec("ALTER TABLE referrers ADD COLUMN photo TEXT");
      }
      if (!await columnExists(targetDb, 'referrers', 'documentPhoto')) {
        await targetDb.exec("ALTER TABLE referrers ADD COLUMN documentPhoto TEXT");
      }
      if (!await columnExists(targetDb, 'referrers', 'phone1CountryCode')) {
        await targetDb.exec("ALTER TABLE referrers ADD COLUMN phone1CountryCode VARCHAR(10) DEFAULT '591'");
      }
      if (!await columnExists(targetDb, 'referrers', 'phone2CountryCode')) {
        await targetDb.exec("ALTER TABLE referrers ADD COLUMN phone2CountryCode VARCHAR(10) DEFAULT '591'");
      }
      if (!await columnExists(targetDb, 'goldPurchases', 'photo')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN photo TEXT");
      }
      if (!await columnExists(targetDb, 'goldPurchaseItems', 'photo')) {
        await targetDb.exec("ALTER TABLE goldPurchaseItems ADD COLUMN photo TEXT");
      }
      if (!await columnExists(targetDb, 'companySettings', 'inactivityTimeout')) {
        await targetDb.exec("ALTER TABLE companySettings ADD COLUMN inactivityTimeout INTEGER DEFAULT 10");
      }
      if (!await columnExists(targetDb, 'companySettings', 'loginBgUrl')) {
        await targetDb.exec("ALTER TABLE companySettings ADD COLUMN loginBgUrl VARCHAR(255)");
      }
      if (!await columnExists(targetDb, 'companySettings', 'timezone')) {
        await targetDb.exec("ALTER TABLE companySettings ADD COLUMN timezone VARCHAR(255) DEFAULT 'America/La_Paz'");
      }
      if (!await columnExists(targetDb, 'companySettings', 'maxStayMinutes')) {
        await targetDb.exec("ALTER TABLE companySettings ADD COLUMN maxStayMinutes INTEGER DEFAULT 2880");
      }
      if (!await columnExists(targetDb, 'companySettings', 'maxStayMinutes_pieza')) {
        await targetDb.exec("ALTER TABLE companySettings ADD COLUMN maxStayMinutes_pieza INTEGER DEFAULT 2880");
      }
      if (!await columnExists(targetDb, 'companySettings', 'maxStayMinutes_barra')) {
        await targetDb.exec("ALTER TABLE companySettings ADD COLUMN maxStayMinutes_barra INTEGER DEFAULT 2880");
      }
      if (!await columnExists(targetDb, 'companySettings', 'notifyVisual_pieza')) {
        await targetDb.exec("ALTER TABLE companySettings ADD COLUMN notifyVisual_pieza INTEGER DEFAULT 1");
      }
      if (!await columnExists(targetDb, 'companySettings', 'notifyVisual_barra')) {
        await targetDb.exec("ALTER TABLE companySettings ADD COLUMN notifyVisual_barra INTEGER DEFAULT 1");
      }
      if (!await columnExists(targetDb, 'companySettings', 'notifySound_pieza')) {
        await targetDb.exec("ALTER TABLE companySettings ADD COLUMN notifySound_pieza INTEGER DEFAULT 1");
      }
      if (!await columnExists(targetDb, 'companySettings', 'notifySound_barra')) {
        await targetDb.exec("ALTER TABLE companySettings ADD COLUMN notifySound_barra INTEGER DEFAULT 1");
      }
      if (!await columnExists(targetDb, 'goldPurchases', 'closeSignature')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN closeSignature TEXT");
      }
      if (!await columnExists(targetDb, 'goldPurchases', 'voidedAt')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN voidedAt VARCHAR(255)");
      }
      if (!await columnExists(targetDb, 'goldPurchases', 'voidedBy')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN voidedBy VARCHAR(255)");
      }
      if (!await columnExists(targetDb, 'goldPurchases', 'voidReason')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN voidReason TEXT");
      }
      if (!await columnExists(targetDb, 'companySettings', 'cashDenominations')) {
        await targetDb.exec("ALTER TABLE companySettings ADD COLUMN cashDenominations TEXT");
      }
      if (!await columnExists(targetDb, 'companySettings', 'lowPurityThreshold_pieza')) {
        await targetDb.exec("ALTER TABLE companySettings ADD COLUMN lowPurityThreshold_pieza DOUBLE DEFAULT 50.0");
      }
      if (!await columnExists(targetDb, 'companySettings', 'lowPurityThreshold_barra')) {
        await targetDb.exec("ALTER TABLE companySettings ADD COLUMN lowPurityThreshold_barra DOUBLE DEFAULT 50.0");
      }
      if (!await columnExists(targetDb, 'branchClosures', 'cashCountBreakdown')) {
        await targetDb.exec("ALTER TABLE branchClosures ADD COLUMN cashCountBreakdown TEXT");
      }
      if (!await columnExists(targetDb, 'goldPurchases', 'isHistoric')) {
        await targetDb.exec("ALTER TABLE goldPurchases ADD COLUMN isHistoric INTEGER DEFAULT 0");
      }

      fs.appendFileSync("startup_log.txt", `${new Date().toISOString()} - Migrations successful\n`);
    } catch (err: any) {
      fs.appendFileSync("startup_log.txt", `${new Date().toISOString()} - Migrations warning: ${err.message}\n`);
      console.warn("Migration warning (might be expected on fresh DB):", err);
    }
  }

  async function bootstrapDefaultData(targetDb: DB) {
    // Bootstrap default admin
    try {
      const adminUsername = "admin";
      const adminEmail = "llaqtasystem@gmail.com";
      const existing = await targetDb.get("SELECT * FROM users WHERE LOWER(username) = LOWER(?) OR (email IS NOT NULL AND LOWER(email) = LOWER(?))", [adminUsername, adminEmail]);
      if (!existing) {
        await targetDb.run("INSERT INTO users (id, name, username, email, pin, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)", 
          [crypto.randomUUID(), "Super Administrador", adminUsername, adminEmail, "1234", "superadmin", new Date().toISOString()]);
        console.log("[Db Bootstrap] Default superadmin user successfully created/verified.");
      }
    } catch (err: any) {
      fs.appendFileSync("startup_log.txt", `${new Date().toISOString()} - Bootstrap (users) error: ${err.message}\n`);
      console.error("Bootstrap error (users):", err);
    }

    // Bootstrap default settings
    try {
      const existing = await targetDb.get("SELECT * FROM companySettings LIMIT 1");
      if (!existing) {
        await targetDb.run("INSERT INTO companySettings (id, name, updatedAt) VALUES (?, ?, ?)", [crypto.randomUUID(), "Aurum Manager - Almacén", new Date().toISOString()]);
        console.log("[Db Bootstrap] Default company settings successfully created/verified.");
      }
    } catch (err: any) {
      fs.appendFileSync("startup_log.txt", `${new Date().toISOString()} - Bootstrap (settings) error: ${err.message}\n`);
      console.error("Bootstrap error (settings):", err);
    }
  }

  // Apply schema & migrations to startup database
  await applySchemaAndMigrations(db);
  await bootstrapDefaultData(db);

  const PORT = 3000;
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Directorio estático para archivos cargados del sistema (imágenes, documentos)
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Funciones de ayuda para registrar y guardar imágenes base64 en archivos físicos del sistema
  function getFolderNameForReq(reqPath: string, fieldName: string): string {
    const pathLower = reqPath.toLowerCase();
    const fieldLower = fieldName.toLowerCase();
    
    if (pathLower.includes('/users') || fieldLower.includes('user')) return 'usuarios';
    if (pathLower.includes('/clients') || fieldLower.includes('client')) return 'clientes';
    if (pathLower.includes('/referrers') || fieldLower.includes('referrer')) return 'referidos';
    if (pathLower.includes('/settings') || fieldLower.includes('logo') || fieldLower.includes('setting')) return 'empresa';
    if (pathLower.includes('/gold-purchases') || fieldLower.includes('purchase') || fieldLower.includes('material')) return 'compras';
    return 'general';
  }

  function saveBase64Image(base64Str: string, folderName: string): string {
    const commaIndex = base64Str.indexOf(',');
    if (commaIndex === -1 || !base64Str.startsWith('data:image/')) {
      throw new Error('Formato base64 inválido');
    }
    
    const header = base64Str.substring(0, commaIndex);
    const data = base64Str.substring(commaIndex + 1);
    
    let ext = 'jpg';
    const match = header.match(/data:image\/([a-zA-Z0-9+]+);/);
    if (match) {
      ext = match[1];
      if (ext === 'jpeg') ext = 'jpg';
    }
    
    const buffer = Buffer.from(data, 'base64');
    
    const uploadDir = path.join(process.cwd(), 'uploads', folderName);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, buffer);
    
    return `/uploads/${folderName}/${fileName}`;
  }

  function processBase64Fields(body: any, reqPath: string): any {
    if (!body || typeof body !== 'object') return body;
    
    const newBody = Array.isArray(body) ? [...body] : { ...body };
    
    for (const key of Object.keys(newBody)) {
      const val = newBody[key];
      if (typeof val === 'string' && val.startsWith('data:image/')) {
        try {
          const folder = getFolderNameForReq(reqPath, key);
          const relativeUrl = saveBase64Image(val, folder);
          newBody[key] = relativeUrl;
          console.log(`[Sistema de Archivos] Éxito al guardar base64 de campo '${key}' en ruta física: ${relativeUrl}`);
        } catch (err: any) {
          console.error(`[Sistema de Archivos] Fallo al guardar archivo de campo '${key}':`, err.message || err);
        }
      } else if (val && typeof val === 'object') {
        newBody[key] = processBase64Fields(val, reqPath);
      }
    }
    return newBody;
  }

  // Interceptar conversiones de campos base64 en peticiones POST y PUT
  app.use((req, res, next) => {
    if (req.body && (req.method === 'POST' || req.method === 'PUT')) {
      req.body = processBase64Fields(req.body, req.path);
    }
    next();
  });

  const apiRouter = express.Router();

  // Health check
  apiRouter.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Bulk data sync endpoint to prevent rate limits from excessive parallel HTTP fetches
  apiRouter.get("/bulk-data", async (req, res) => {
    try {
      const branchId = req.query.branchId as string || null;

      const [
        materials,
        users,
        smelting,
        exportOps,
        settings,
        branches,
        clients,
        purchases,
        purchaseItems,
        referrers,
        referrerPayouts,
        transfers
      ] = await Promise.all([
        db.all("SELECT * FROM materials"),
        db.all("SELECT * FROM users"),
        db.all("SELECT * FROM smeltingOperations ORDER BY date DESC"),
        db.all("SELECT * FROM exportOperations ORDER BY date DESC"),
        db.get("SELECT * FROM companySettings LIMIT 1"),
        db.all("SELECT b.*, (SELECT MAX(COALESCE(closedAt, date)) FROM branchClosures WHERE branchId = b.id) AS lastClosedAt FROM branches b"),
        db.all("SELECT * FROM clients"),
        db.all("SELECT * FROM goldPurchases ORDER BY createdAt DESC"),
        db.all("SELECT * FROM goldPurchaseItems"),
        db.all("SELECT * FROM referrers"),
        db.all("SELECT * FROM referrerPayouts"),
        db.all("SELECT * FROM goldTransfers ORDER BY sentAt DESC")
      ]);

      const parsedMaterials = (materials || []).map((m: any) => {
        try {
          return {
            ...m,
            sourceMaterials: m.sourceMaterials ? JSON.parse(m.sourceMaterials) : [],
            history: m.history ? JSON.parse(m.history) : []
          };
        } catch {
          return { ...m, sourceMaterials: [], history: [] };
        }
      });

      const parsedSmelting = (smelting || []).map((o: any) => {
        try {
          return { ...o, sourceMaterialIds: o.sourceMaterialIds ? JSON.parse(o.sourceMaterialIds) : [] };
        } catch {
          return { ...o, sourceMaterialIds: [] };
        }
      });

      const parsedExport = (exportOps || []).map((o: any) => {
        try {
          return { ...o, sourceMaterialIds: o.sourceMaterialIds ? JSON.parse(o.sourceMaterialIds) : [] };
        } catch {
          return { ...o, sourceMaterialIds: [] };
        }
      });

      const itemsMap = new Map<string, any[]>();
      (purchaseItems || []).forEach((item: any) => {
        const pid = item.purchaseId;
        if (!itemsMap.has(pid)) {
          itemsMap.set(pid, []);
        }
        itemsMap.get(pid)!.push(item);
      });

      const parsedPurchases = (purchases || []).map((p: any) => {
        try {
          return {
            ...p,
            items: itemsMap.get(p.id) || [],
            advances: p.advances ? JSON.parse(p.advances) : [],
            payments: p.payments ? JSON.parse(p.payments) : []
          };
        } catch {
          return { ...p, items: itemsMap.get(p.id) || [], advances: [], payments: [] };
        }
      });

      const parsedReferrerPayouts = (referrerPayouts || []).map((p: any) => {
        try {
          return {
            ...p,
            purchaseIds: p.purchaseIds ? JSON.parse(p.purchaseIds) : [],
            purchaseReceipts: p.purchaseReceipts ? JSON.parse(p.purchaseReceipts) : []
          };
        } catch {
          return { ...p, purchaseIds: [], purchaseReceipts: [] };
        }
      });

      const parsedTransfers = (transfers || []).map((t: any) => {
        try {
          return {
            ...t,
            materialIds: t.materialIds ? JSON.parse(t.materialIds) : [],
            verifiedItems: t.verifiedItems ? JSON.parse(t.verifiedItems) : []
          };
        } catch {
          return { ...t, materialIds: [], verifiedItems: [] };
        }
      });

      let branchCashMoves = [];
      let branchClosures = [];
      let branchBankAccounts = [];

      if (branchId) {
        const [moves, closures, accounts] = await Promise.all([
          db.all("SELECT * FROM branchCashMoves WHERE branchId = ? ORDER BY date DESC", [branchId]),
          db.all("SELECT * FROM branchClosures WHERE branchId = ? ORDER BY date DESC", [branchId]),
          db.all("SELECT * FROM branchBankAccounts WHERE branchId = ?", [branchId])
        ]);
        branchCashMoves = moves;
        branchClosures = closures;
        branchBankAccounts = accounts;
      } else {
        branchBankAccounts = await db.all("SELECT * FROM branchBankAccounts");
      }

      res.json({
        materials: parsedMaterials,
        users,
        smelting: parsedSmelting,
        export: parsedExport,
        settings,
        branches,
        clients,
        purchases: parsedPurchases,
        referrers,
        referrerPayouts: parsedReferrerPayouts,
        transfers: parsedTransfers,
        branchCashMoves,
        branchClosures,
        branchBankAccounts
      });
    } catch (e: any) {
      console.error("Bulk sync error:", e);
      res.status(500).json({ error: "Bulk sync error", message: e.message });
    }
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

  // WebAuthn Credentials list
  apiRouter.get("/auth/webauthn/credentials/:userId", async (req, res) => {
    try {
      const credentials = await db.all("SELECT id, credentialId, createdAt FROM webauthn_credentials WHERE userId = ?", [req.params.userId]);
      res.json(credentials);
    } catch (e: any) {
      console.error("WebAuthn credentials list error:", e);
      res.status(500).json({ error: "No se pudieron obtener las credenciales biométricas" });
    }
  });

  // WebAuthn register
  apiRouter.post("/auth/webauthn/register", async (req, res) => {
    const { userId, credentialId, publicKey, pin } = req.body;
    try {
      const user = await db.get("SELECT * FROM users WHERE id = ?", [userId]);
      if (!user) {
        return res.status(404).json({ error: "Usuario no registrado" });
      }
      if (pin && String(user.pin) !== String(pin)) {
        return res.status(401).json({ error: "PIN de seguridad incorrecto" });
      }

      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      await db.run("INSERT INTO webauthn_credentials (id, userId, credentialId, publicKey, createdAt) VALUES (?, ?, ?, ?, ?)",
        [id, userId, credentialId, publicKey || null, createdAt]);

      res.json({ success: true, id, credentialId });
    } catch (e: any) {
      console.error("WebAuthn registration error:", e);
      res.status(400).json({ error: "Error al registrar credencial biométrica" });
    }
  });

  // WebAuthn login assertion
  apiRouter.post("/auth/webauthn/login", async (req, res) => {
    const { credentialId, userId } = req.body;
    try {
      let cred;
      if (credentialId) {
        cred = await db.get("SELECT * FROM webauthn_credentials WHERE credentialId = ?", [credentialId]);
      } else if (userId) {
        cred = await db.get("SELECT * FROM webauthn_credentials WHERE userId = ? ORDER BY createdAt DESC LIMIT 1", [userId]);
      }

      if (!cred) {
        return res.status(401).json({ error: "Dispositivo de biometría no registrado para este usuario" });
      }

      const user = await db.get("SELECT * FROM users WHERE id = ?", [cred.userId]);
      if (!user) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      res.json(user);
    } catch (e: any) {
      console.error("WebAuthn login validation error:", e);
      res.status(500).json({ error: "Error de validación biométrica en servidor" });
    }
  });

  // WebAuthn delete credential
  apiRouter.delete("/auth/webauthn/credentials/:id", async (req, res) => {
    try {
      await db.run("DELETE FROM webauthn_credentials WHERE id = ?", [req.params.id]);
      res.json({ success: true });
    } catch (e: any) {
      console.error("WebAuthn credential delete error:", e);
      res.status(400).json({ error: "No se pudo eliminar la credencial biométrica" });
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
      // Check if PIN already exists
      const existingPin = await db.get("SELECT id, name FROM users WHERE pin = ?", [pin]);
      if (existingPin) {
        return res.status(400).json({ error: `El PIN ya está registrado para el usuario: ${existingPin.name}` });
      }

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
      // Check if PIN already exists on other users
      const existingPin = await db.get("SELECT id, name FROM users WHERE pin = ? AND id != ?", [pin, req.params.id]);
      if (existingPin) {
        return res.status(400).json({ error: `El PIN ya está registrado para el usuario: ${existingPin.name}` });
      }

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
      const branches = await db.all("SELECT b.*, (SELECT MAX(COALESCE(closedAt, date)) FROM branchClosures WHERE branchId = b.id) AS lastClosedAt FROM branches b");
      res.json(branches);
    } catch (e) {
      console.error("Failed to fetch branches:", e);
      res.status(500).json({ error: "Failed to fetch branches" });
    }
  });

  apiRouter.post("/branches", async (req, res) => {
    const { name, abbreviation, location, phone, phoneCountryCode, referentialPhone, referentialCountryCode, managerId, active } = req.body;
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const activeValue = active !== undefined ? active : 1;
    await db.run("INSERT INTO branches (id, name, abbreviation, location, phone, phoneCountryCode, referentialPhone, referentialCountryCode, managerId, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, name, abbreviation || 'S', location, phone, phoneCountryCode || '591', referentialPhone || null, referentialCountryCode || '591', managerId || null, activeValue, createdAt]);
    res.json({ id, name, abbreviation, location, phone, phoneCountryCode, referentialPhone, referentialCountryCode, managerId, active: activeValue, createdAt });
  });

  apiRouter.put("/branches/:id", async (req, res) => {
    const { name, abbreviation, location, phone, phoneCountryCode, referentialPhone, referentialCountryCode, managerId, active } = req.body;
    const currentBranch = await db.get("SELECT * FROM branches WHERE id = ?", [req.params.id]) as any;
    if (!currentBranch) {
      return res.status(404).json({ error: "Sucursal no encontrada" });
    }
    const newActive = active !== undefined ? active : (currentBranch.active !== undefined ? currentBranch.active : 1);
    await db.run("UPDATE branches SET name = ?, abbreviation = ?, location = ?, phone = ?, phoneCountryCode = ?, referentialPhone = ?, referentialCountryCode = ?, managerId = ?, active = ? WHERE id = ?",
      [
        name || currentBranch.name,
        abbreviation || currentBranch.abbreviation || 'S',
        location !== undefined ? location : currentBranch.location,
        phone !== undefined ? phone : currentBranch.phone,
        phoneCountryCode !== undefined ? phoneCountryCode : (currentBranch.phoneCountryCode || '591'),
        referentialPhone !== undefined ? referentialPhone : currentBranch.referentialPhone,
        referentialCountryCode !== undefined ? referentialCountryCode : (currentBranch.referentialCountryCode || '591'),
        managerId !== undefined ? managerId : currentBranch.managerId,
        newActive,
        req.params.id
      ]);
    res.json({ success: true });
  });

  apiRouter.delete("/branches/:id", async (req, res) => {
    try {
      const branchId = req.params.id;

      // Check if there is any data referencing this branch in related tables
      const checks = await Promise.all([
        db.get("SELECT COUNT(*) as count FROM users WHERE branchId = ?", [branchId]),
        db.get("SELECT COUNT(*) as count FROM clients WHERE branchId = ?", [branchId]),
        db.get("SELECT COUNT(*) as count FROM referrers WHERE branchId = ?", [branchId]),
        db.get("SELECT COUNT(*) as count FROM goldPurchases WHERE branchId = ?", [branchId]),
        db.get("SELECT COUNT(*) as count FROM goldTransfers WHERE branchId = ?", [branchId]),
        db.get("SELECT COUNT(*) as count FROM branchBankAccounts WHERE branchId = ?", [branchId]),
        db.get("SELECT COUNT(*) as count FROM branchCashMoves WHERE branchId = ?", [branchId]),
        db.get("SELECT COUNT(*) as count FROM branchClosures WHERE branchId = ?", [branchId]),
        db.get("SELECT COUNT(*) as count FROM referrerPayouts WHERE branchId = ?", [branchId])
      ]);

      const hasData = checks.some((r: any) => r && r.count > 0);

      if (hasData) {
        // Soft delete / Hide
        await db.run("UPDATE branches SET active = 0 WHERE id = ?", [branchId]);
        res.json({ 
          success: true, 
          softDeleted: true, 
          message: "La sucursal tiene datos registrados, por lo que ha sido ocultada del sistema para mantener la integridad de los datos históricos." 
        });
      } else {
        // Hard delete
        await db.run("DELETE FROM branches WHERE id = ?", [branchId]);
        res.json({ 
          success: true, 
          softDeleted: false, 
          message: "La sucursal no tenía datos registrados y ha sido eliminada permanentemente del sistema." 
        });
      }
    } catch (e: any) {
      console.error("Error al eliminar la sucursal:", e);
      res.status(500).json({ error: "No se pudo eliminar la sucursal", message: e.message });
    }
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
    const tz = await getCompanyTimezone();
    const registrationDate = getCurrentDateInTimezone(tz);
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
    const tz = await getCompanyTimezone();
    const date = getCurrentDateInTimezone(tz);

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
    
    // Normalize boolean settings to integers for database compatibility
    const booleanFields = ['notifyVisual_pieza', 'notifyVisual_barra', 'notifySound_pieza', 'notifySound_barra'];
    booleanFields.forEach(f => {
      if (data[f] !== undefined) {
        data[f] = data[f] === true || data[f] === 1 || data[f] === "true" ? 1 : 0;
      }
    });

    // Get the existing settings ID
    const existing = await db.get("SELECT id FROM companySettings LIMIT 1");
    const settingsId = existing ? existing.id : crypto.randomUUID();
    
    const allowedFields = [
      'name', 'address', 'phone', 'email', 'taxId', 'logoUrl', 'loginBgUrl', 'inactivityTimeout', 'timezone', 'maxStayMinutes',
      'maxStayMinutes_pieza', 'maxStayMinutes_barra', 'notifyVisual_pieza', 'notifyVisual_barra', 'notifySound_pieza', 'notifySound_barra',
      'cashDenominations', 'lowPurityThreshold_pieza', 'lowPurityThreshold_barra'
    ];
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

    // Normalize boolean settings to integers for database compatibility
    const booleanFields = ['notifyVisual_pieza', 'notifyVisual_barra', 'notifySound_pieza', 'notifySound_barra'];
    booleanFields.forEach(f => {
      if (updateData[f] !== undefined) {
        updateData[f] = updateData[f] === true || updateData[f] === 1 || updateData[f] === "true" ? 1 : 0;
      }
    });
    
    // Sanitize updateData to avoid extra-properties SQL errors
    const allowedColumns = [
      'name', 'address', 'phone', 'email', 'taxId', 'logoUrl', 'loginBgUrl', 
      'inactivityTimeout', 'timezone', 'maxStayMinutes', 
      'maxStayMinutes_pieza', 'maxStayMinutes_barra', 'notifyVisual_pieza', 'notifyVisual_barra', 'notifySound_pieza', 'notifySound_barra',
      'cashDenominations', 'lowPurityThreshold_pieza', 'lowPurityThreshold_barra', 'updatedAt'
    ];
    for (const key of Object.keys(updateData)) {
      if (!allowedColumns.includes(key)) {
        delete updateData[key];
      }
    }
    
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
      
      // Instantly recompute active database dynamic instance
      console.log("[Db Realtime Switcher] Re-initializing active database on demand...");
      db = await initDatabase();
      
      // Synchronously execute full table setup & column alterations on new target database
      await applySchemaAndMigrations(db);
      await bootstrapDefaultData(db);
      
      res.json({ 
        success: true, 
        message: "Configuración guardada y base de datos inicializada correctamente en tiempo real." 
      });
    } catch (e: any) {
      console.error("[Db Realtime Switcher] Fail:", e);
      res.status(500).json({ error: `Error al aplicar la configuración de la base de datos: ${e.message || e}` });
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
        let errorMsg = `Error de conexión: ${err.message}`;
        const hostName = mysqlConfig.host || 'localhost';
        
        if (err.code === 'ETIMEDOUT' || err.message?.includes('ETIMEDOUT')) {
          errorMsg = `Tiempo de espera agotado (ETIMEDOUT) para '${hostName}'. La base de datos externa parece estar offline o tiene un firewall bloqueando el puerto ${mysqlConfig.port || 3306}. Verifique que el servidor acepte conexiones remotas y que esté activo.`;
        } else if (err.code === 'ENOTFOUND' || err.message?.includes('ENOTFOUND')) {
          errorMsg = `Host no encontrado (ENOTFOUND): '${hostName}' no es un dominio válido o no se pudo resolver. Ingrese una IP o dominio real.`;
        } else if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
          errorMsg = `Conexión rechazada (ECONNREFUSED) por '${hostName}'. El servidor MySQL no está escuchando en el puerto ${mysqlConfig.port || 3306} o rechaza conexiones de este cliente.`;
        } else if (hostName.includes('example.com')) {
          errorMsg = `El host '${hostName}' es un marcador de posición de ejemplo. Reemplácelo con la IP o host real de su MySQL de pruebas o producción en .env o db-config.json.`;
        }
        
        return res.status(400).json({ success: false, error: errorMsg });
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

  async function getTableColumns(targetDb: any, tableName: string): Promise<string[]> {
    try {
      if (targetDb.isMySQL) {
        const rows = await targetDb.all(`DESCRIBE \`${tableName}\``);
        return rows.map((r: any) => r.Field || r.field).filter(Boolean);
      } else {
        const rows = await targetDb.all(`PRAGMA table_info(\`${tableName}\`)`);
        return rows.map((r: any) => r.name).filter(Boolean);
      }
    } catch (err) {
      console.error(`Error getting columns for table ${tableName}:`, err);
      return [];
    }
  }

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
        "goldTransfers",
        "webauthn_credentials"
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
            "branchBankAccounts", "materials", "smeltingOperations", "exportOperations",
            "webauthn_credentials"
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
        "goldTransfers",
        "webauthn_credentials"
      ];

      for (const tableName of tableOrder) {
        const rows = tables[tableName];
        if (!Array.isArray(rows)) continue;

        // Dynamically retrieve actual column names for this table in the target database
        const allowedCols = await getTableColumns(db, tableName);
        if (allowedCols.length === 0) {
          console.warn(`Could not fetch columns for table ${tableName}, skipping or proceeding with caution...`);
        }

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

          // Sanitize the row keys to avoid non-existent SQL properties
          const sanitizedRow: Record<string, any> = {};
          for (const key of Object.keys(row)) {
            if (allowedCols.length === 0 || allowedCols.includes(key)) {
              sanitizedRow[key] = row[key];
            }
          }

          const columns = Object.keys(sanitizedRow);
          const values = Object.values(sanitizedRow);
          const idValue = sanitizedRow.id;
          if (!idValue) continue;

          const existing = await db.get(`SELECT id FROM ${tableName} WHERE id = ?`, [idValue]);
          if (existing) {
            const updateColumns = columns.filter(c => c !== 'id');
            if (updateColumns.length === 0) continue;
            const setClause = updateColumns.map(c => `\`${c}\` = ?`).join(", ");
            const updateValues = updateColumns.map(c => {
              const val = sanitizedRow[c];
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
      if (finalCI && client.branchId) {
        const existing = await db.get(
          "SELECT id FROM clients WHERE branchId = ? AND LOWER(TRIM(ci)) = LOWER(TRIM(?))",
          [client.branchId, finalCI]
        );
        if (existing) {
          return res.status(400).json({ error: "Ya existe un cliente con este número de CI registrado en esta sucursal." });
        }
      }

      await db.run(`
        INSERT INTO clients (
          id, name, phone, phoneCountryCode, email, ci, workplace, isMineCooperative, 
          recommendedBy, referentialPhone, referentialCountryCode, branchId, branchName, registeredBy, createdAt,
          photo, documentPhoto, documentPhotoBack
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, client.name, client.phone, client.phoneCountryCode, client.email, finalCI, client.workplace, 
        client.isMineCooperative ? 1 : 0, client.recommendedBy, client.referentialPhone, 
        client.referentialCountryCode, client.branchId, client.branchName, client.registeredBy, createdAt,
        client.photo || null, client.documentPhoto || null, client.documentPhotoBack || null
      ]);
      res.json({ ...client, id, createdAt, ci: finalCI });
    } catch (error: any) {
      console.error("Error creating client:", error);
      res.status(500).json({ error: `Error al crear el cliente: ${error.message || error}` });
    }
  });

  apiRouter.put("/clients/:id", async (req, res) => {
    const client = req.body;
    const { id, ...updateData } = client;
    
    // Sanitize updateData to avoid extra-properties SQL errors
    const allowedFields = [
      'name', 'phone', 'phoneCountryCode', 'email', 'ci', 'workplace', 
      'isMineCooperative', 'recommendedBy', 'referentialPhone', 'referentialCountryCode', 
      'branchId', 'branchName', 'registeredBy', 'createdAt', 'photo', 
      'documentPhoto', 'documentPhotoBack'
    ];
    for (const key of Object.keys(updateData)) {
      if (!allowedFields.includes(key)) {
        delete updateData[key];
      }
    }
    
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
      if (updateData.ci) {
        const existingClient = await db.get("SELECT branchId FROM clients WHERE id = ?", [req.params.id]);
        const branchId = updateData.branchId || (existingClient ? existingClient.branchId : null);
        if (branchId) {
          const existing = await db.get(
            "SELECT id FROM clients WHERE branchId = ? AND LOWER(TRIM(ci)) = LOWER(TRIM(?)) AND id != ?",
            [branchId, updateData.ci, req.params.id]
          );
          if (existing) {
            return res.status(400).json({ error: "Ya existe un cliente con este número de CI registrado en esta sucursal." });
          }
        }
      }

      const fields = Object.keys(updateData).map(k => `${k} = ?`).join(", ");
      const values = Object.values(updateData);
      await db.run(`UPDATE clients SET ${fields} WHERE id = ?`, [...values, req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating client:", error);
      res.status(500).json({ error: `Error al actualizar el cliente: ${error.message || error}` });
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
        INSERT INTO referrers (id, name, phone1, phone1CountryCode, phone2, phone2CountryCode, ci, branchId, createdAt, photo, documentPhoto)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, 
        referrer.name || '', 
        referrer.phone1 || '', 
        referrer.phone1CountryCode || '591',
        referrer.phone2 || null, 
        referrer.phone2CountryCode || '591',
        finalCI, 
        referrer.branchId || '', 
        createdAt, 
        referrer.photo || null, 
        referrer.documentPhoto || null
      ]);
      res.json({ ...referrer, id, createdAt, ci: finalCI });
    } catch (error: any) {
      console.error("Error creating referrer:", error);
      res.status(500).json({ error: "Error al crear el referido" });
    }
  });

  apiRouter.put("/referrers/:id", async (req, res) => {
    const referrer = req.body;
    const { id, ...updateData } = referrer;
    
    // Sanitize updateData to avoid extra-properties SQL errors
    const allowedColumns = [
      'name', 'phone1', 'phone1CountryCode', 'phone2', 'phone2CountryCode', 
      'ci', 'branchId', 'createdAt', 'photo', 'documentPhoto'
    ];
    for (const key of Object.keys(updateData)) {
      if (!allowedColumns.includes(key)) {
        delete updateData[key];
      }
    }
    
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
    const { referrerId, referrerName, purchaseIds, purchaseReceipts, totalAmount, paidBy, branchId, notes, editedCommissions } = req.body;
    const id = crypto.randomUUID();
    const paidAt = new Date().toISOString();

    try {
      await db.transaction(async () => {
        // Update commissions in goldPurchases if edited
        if (editedCommissions) {
          for (const [purchaseId, customComm] of Object.entries(editedCommissions)) {
            await db.run(`
              UPDATE goldPurchases 
              SET commission = ?
              WHERE id = ?
            `, [customComm, purchaseId]);
          }
        }

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
        advances: p.advances ? JSON.parse(p.advances) : [],
        payments: p.payments ? JSON.parse(p.payments) : []
      };
    }));
    
    res.json(purchasesWithItems);
  });

  apiRouter.post("/gold-purchases", async (req, res) => {
    const { 
      branchId, clientId, total, type, referrerName, commission, 
      advancePayment, createdBy, items, date,
      advancePaymentType, advanceSourceBankAccountId, advanceClientBank, advanceClientAccountNumber, isFullPayment,
      advanceCashAmount, advanceBankAmount, advances, openEstimateFactor, expirationDays, isHistoric
    } = req.body;
    const purchaseId = crypto.randomUUID();
    const tz = await getCompanyTimezone();
    const createdAt = date ? new Date(date).toISOString() : getCurrentDateInTimezone(tz);
    const closedAt = type === 'cerrado' ? createdAt : null;
    const closedBy = type === 'cerrado' ? createdBy : null;
    const isHistoricNum = isHistoric ? 1 : 0;
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
            advanceCashAmount, advanceBankAmount, advances, closedAt, closedBy, openEstimateFactor, expirationDays, photo, isHistoric
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          purchaseId, receiptNumber, branchId, clientId, total, type, referrerName || null, 
          commission || 0, advancePayment || 0, createdBy, createdAt,
          advancePaymentType || 'efectivo', advanceSourceBankAccountId || null,
          advanceClientBank || null, advanceClientAccountNumber || null,
          isFullPayment ? 1 : 0,
          advanceCashAmount || 0,
          advanceBankAmount || 0,
          advances ? JSON.stringify(advances) : '[]',
          closedAt, closedBy,
          openEstimateFactor !== undefined ? openEstimateFactor : 90,
          expirationDays !== undefined ? expirationDays : 15,
          req.body.photo || null,
          isHistoricNum
        ]);
        
        // Insert items
        if (items && Array.isArray(items)) {
          let clientName = 'Cliente Histórico';
          if (isHistoricNum === 1 && clientId) {
            const clientRow = await db.get("SELECT name FROM clients WHERE id = ?", [clientId]) as any;
            if (clientRow) {
              clientName = clientRow.name;
            }
          }

          for (const item of items) {
            const itemId = crypto.randomUUID();
            await db.run(`
              INSERT INTO goldPurchaseItems (
                id, purchaseId, initialWeight, finalWeight, marketPrice, 
                purity, pricePerGram, pricePerGram100, total, usdToBs, loss, lossPercentage, type, createdBy,
                otherQuotation, otherPurity, material100, photo, isVerifiedInCentral
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              itemId, purchaseId, item.initialWeight, item.finalWeight, 
              item.marketPrice, item.purity, item.pricePerGram, item.pricePerGram100 || null, item.total, 
              item.usdToBs, item.loss, item.lossPercentage || 0, item.type || 'pieza', createdBy,
              item.otherQuotation || null, item.otherPurity || null, item.material100 || null, item.photo || null,
              isHistoricNum === 1 ? 1 : 0
            ]);

            // Note: We do NOT insert into Sede Central's materials table directly.
            // Items must go through the transfer and verification flow to enter Central.
          }
        }
        // Register initial advances (ONLY if NOT historic!)
        if (advancePayment > 0 && isHistoricNum === 0) {
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
        advanceCashAmount, advanceBankAmount, openEstimateFactor: openEstimateFactor !== undefined ? openEstimateFactor : 90,
        expirationDays: expirationDays !== undefined ? expirationDays : 15,
        isHistoric: isHistoricNum
      });
      broadcast("purchase_created", { id: purchaseId, receiptNumber });
    } catch (error) {
      console.error("Failed to save gold purchase:", error);
      res.status(500).json({ error: "Failed to save gold purchase" });
    }
  });

  apiRouter.post("/gold-purchases/:id/close", async (req, res) => {
    const { id } = req.params;
    const { 
      closedBy, closeMarketPrice, closeUsdToBs, closeTotal, items,
      closePaymentType, closeCashAmount, closeBankAmount, closeSourceBankAccountId, closeClientBank, closeClientAccountNumber,
      closeSignature, closedAt: reqClosedAt
    } = req.body;
    const closedAt = reqClosedAt ? new Date(reqClosedAt).toISOString() : new Date().toISOString();

    try {
      await db.transaction(async () => {
        const purchase = await db.get("SELECT branchId, receiptNumber, advancePayment, advances, isHistoric FROM goldPurchases WHERE id = ?", [id]) as any;
        if (!purchase) throw new Error("Compra no encontrada");

        const initialPayments = [];
        if ((closeCashAmount || 0) > 0 || (closeBankAmount || 0) > 0) {
          initialPayments.push({
            id: 'initial',
            amount: (closeCashAmount || 0) + (closeBankAmount || 0),
            paymentType: closePaymentType || 'efectivo',
            cashAmount: closeCashAmount || 0,
            bankAmount: closeBankAmount || 0,
            sourceBankAccountId: closeSourceBankAccountId || '',
            clientBank: closeClientBank || '',
            clientAccountNumber: closeClientAccountNumber || '',
            date: closedAt,
            createdBy: closedBy || 'sistema',
            isInitial: true
          });
        }

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
              closeClientAccountNumber = ?,
              closeSignature = ?,
              payments = ?
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
          closeSignature || null,
          JSON.stringify(initialPayments),
          id
        ]);

        // Register liquidation cash move based directly on actually paid amounts (ONLY IF NOT HISTORIC)
        const isHistoricNum = purchase.isHistoric === 1 || purchase.isHistoric === true || parseInt(purchase.isHistoric + '') === 1;
        if (!isHistoricNum) {
          const concept = `Liquidación Compra: ${purchase.receiptNumber}`;
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

        // Update items if provided
        if (items && Array.isArray(items)) {
          for (const item of items) {
            await db.run(`
              UPDATE goldPurchaseItems 
              SET closeMarketPrice = ?, 
                  closeUsdToBs = ?, 
                  closePricePerGram = ?, 
                  closePricePerGram100 = ?, 
                  closeTotal = ? 
              WHERE id = ?
            `, [
              item.closeMarketPrice, 
              item.closeUsdToBs, 
              item.closePricePerGram, 
              item.closePricePerGram100 || null, 
              item.closeTotal, 
              item.id
            ]);
          }
        }
      });
      res.json({ success: true, closedAt, closedBy });
      broadcast("purchase_closed", { id });
    } catch (error) {
      console.error("Failed to close gold purchase:", error);
      res.status(500).json({ error: "Failed to close gold purchase" });
    }
  });

  apiRouter.post("/gold-purchases/:id/pay-liquid-balance", async (req, res) => {
    const { id } = req.params;
    const {
      amount,
      paymentType,
      cashAmount,
      bankAmount,
      sourceBankAccountId,
      clientBank,
      clientAccountNumber,
      createdBy
    } = req.body;
    const date = new Date().toISOString();

    try {
      await db.transaction(async () => {
        const purchase = await db.get("SELECT branchId, receiptNumber, closeCashAmount, closeBankAmount, closePaymentType, payments, isHistoric FROM goldPurchases WHERE id = ?", [id]) as any;
        if (!purchase) throw new Error("Compra no encontrada");

        const existingPayments = purchase.payments ? JSON.parse(purchase.payments) : [];
        const newPaymentObj = {
          id: crypto.randomUUID(),
          amount: amount || 0,
          paymentType: paymentType,
          cashAmount: cashAmount || 0,
          bankAmount: bankAmount || 0,
          sourceBankAccountId: sourceBankAccountId || '',
          clientBank: clientBank || '',
          clientAccountNumber: clientAccountNumber || '',
          date: date,
          createdBy: createdBy || 'sistema'
        };
        existingPayments.push(newPaymentObj);

        const newCloseCashAmount = (purchase.closeCashAmount || 0) + (cashAmount || 0);
        const newCloseBankAmount = (purchase.closeBankAmount || 0) + (bankAmount || 0);
        
        let newClosePaymentType = purchase.closePaymentType || 'efectivo';
        if (newCloseCashAmount > 0 && newCloseBankAmount > 0) {
          newClosePaymentType = 'mixto';
        } else if (newCloseBankAmount > 0) {
          newClosePaymentType = 'transferencia';
        } else if (newCloseCashAmount > 0) {
          newClosePaymentType = 'efectivo';
        }

        // Update close values
        await db.run(`
          UPDATE goldPurchases
          SET closeCashAmount = ?,
              closeBankAmount = ?,
              closePaymentType = ?,
              closeSourceBankAccountId = COALESCE(?, closeSourceBankAccountId),
              closeClientBank = COALESCE(?, closeClientBank),
              closeClientAccountNumber = COALESCE(?, closeClientAccountNumber),
              payments = ?
          WHERE id = ?
        `, [
          newCloseCashAmount,
          newCloseBankAmount,
          newClosePaymentType,
          sourceBankAccountId || null,
          clientBank || null,
          clientAccountNumber || null,
          JSON.stringify(existingPayments),
          id
        ]);

        // Register cash moves (ONLY IF NOT HISTORIC)
        const isHistoricNum = purchase.isHistoric === 1 || purchase.isHistoric === true || parseInt(purchase.isHistoric + '') === 1;
        if (!isHistoricNum) {
          const concept = `Pago Balance Liquidación: ${purchase.receiptNumber}`;
          if (paymentType === 'efectivo' || paymentType === 'mixto') {
            if ((cashAmount || 0) > 0) {
              await db.run(`
                INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, date, createdBy, referenceId)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [crypto.randomUUID(), purchase.branchId, cashAmount, 'egreso', `${concept} (Efectivo)`, 'compra', 'efectivo', null, date, createdBy, id]);
            }
          }
          if (paymentType === 'transferencia' || paymentType === 'mixto') {
            if ((bankAmount || 0) > 0) {
              await db.run(`
                INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, date, createdBy, referenceId)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [crypto.randomUUID(), purchase.branchId, bankAmount, 'egreso', `${concept} (Transferencia)`, 'compra', 'transferencia', sourceBankAccountId || null, date, createdBy, id]);
            }
          }
        }
      });

      res.json({ success: true });
      broadcast("purchase_closed", { id });
    } catch (error) {
      console.error("Failed to pay liquidation balance:", error);
      res.status(500).json({ error: "Failed to pay liquidation balance" });
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

        // Update items photos if available
        if (items && Array.isArray(items)) {
          for (const item of items) {
            if (item.id) {
              await db.run(
                "UPDATE goldPurchaseItems SET photo = ? WHERE id = ? AND purchaseId = ?",
                [item.photo || null, item.id, id]
              );
            }
          }
        }

        const oldAdvances = existingPurchase.advances ? JSON.parse(existingPurchase.advances) : [];
        const newAdvances = purchaseData.advances || [];

        // 2. Detect NEW advances
        const newItems = newAdvances.slice(oldAdvances.length);
        const isHistoricPurchase = existingPurchase.isHistoric === 1 || existingPurchase.isHistoric === true || parseInt(existingPurchase.isHistoric + '') === 1;

        if (!isHistoricPurchase) {
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
        }

        // 3. Update the purchase record
        if (updateData.advances) {
          updateData.advances = JSON.stringify(updateData.advances);
        }

        // Sanitize updateData to avoid extra-properties SQL errors
        const allowedPurchaseColumns = [
          'receiptNumber', 'branchId', 'clientId', 'total', 'type', 'openEstimateFactor', 
          'expirationDays', 'referrerName', 'commission', 'advancePayment', 'createdBy', 'createdAt', 
          'closedAt', 'closedBy', 'closeMarketPrice', 'closeUsdToBs', 'closeTotal', 'commissionPaid', 
          'commissionPaidAt', 'commissionPaidBy', 'advancePaymentType', 'advanceCashAmount', 
          'advanceBankAmount', 'advanceSourceBankAccountId', 'advanceClientBank', 'advanceClientAccountNumber', 
          'isFullPayment', 'advances', 'photo', 'closeSignature', 'closePaymentType', 'closeCashAmount', 
          'closeBankAmount', 'closeSourceBankAccountId', 'closeClientBank', 'closeClientAccountNumber', 
          'closureId'
        ];
        for (const key of Object.keys(updateData)) {
          if (!allowedPurchaseColumns.includes(key)) {
            delete updateData[key];
          }
        }

        const fields = Object.keys(updateData).map(k => `${k} = ?`).join(", ");
        const values = Object.values(updateData);
        await db.run(`UPDATE goldPurchases SET ${fields} WHERE id = ?`, [...values, id]);
      });

      res.json({ success: true });
      broadcast("purchase_updated", { id });
    } catch (error) {
      console.error("Failed to update gold purchase:", error);
      res.status(500).json({ error: "Failed to update gold purchase" });
    }
  });

  apiRouter.delete("/gold-purchases/:id", async (req, res) => {
    await db.run("DELETE FROM goldPurchases WHERE id = ?", [req.params.id]);
    res.json({ success: true });
    broadcast("purchase_deleted", { id: req.params.id });
  });

  // Toggle historic status (allows validator to mark purchase as historic which pulls from petty cash / inventory)
  apiRouter.post("/gold-purchases/:id/toggle-historic", async (req, res) => {
    const { id } = req.params;
    const { validatedBy, reason } = req.body;

    if (!validatedBy) {
      return res.status(400).json({ error: "Debe especificar el validador / auditor que autoriza esta operación." });
    }

    try {
      await db.transaction(async () => {
        // 1. Get purchase info
        const purchase = await db.get("SELECT * FROM goldPurchases WHERE id = ?", [id]) as any;
        if (!purchase) {
          throw new Error("Compra de oro no encontrada");
        }

        const isCurrentlyHistoric = purchase.isHistoric === 1 || purchase.isHistoric === true || parseInt(purchase.isHistoric + '') === 1;
        const newIsHistoric = isCurrentlyHistoric ? 0 : 1;

        // 2. Update status of the purchase
        await db.run("UPDATE goldPurchases SET isHistoric = ? WHERE id = ?", [newIsHistoric, id]);

        if (newIsHistoric === 1) {
          // Transitions from Normal to Historic
          // a. Delete cash moves related to this purchase so it doesn't affect petty cash
          await db.run("DELETE FROM branchCashMoves WHERE referenceId = ?", [id]);

          // b. Update materials in inventory to be "no disponible" if already transferred & verified
          const existingMaterials = await db.all("SELECT id FROM materials WHERE receiptNumber = ?", [purchase.receiptNumber]);
          if (existingMaterials.length > 0) {
            await db.run("UPDATE materials SET status = 'no disponible' WHERE receiptNumber = ?", [purchase.receiptNumber]);
          } else {
            // Since they are not in Sede Central's inventory yet (have not been transferred and verified),
            // we do nothing to the materials table. They will stay in the sucursal's items domain.
          }
        } else {
          // Transitions from Historic to Normal
          // a. Update materials in inventory to be "disponible" (so they show up as active or available)
          await db.run("UPDATE materials SET status = 'disponible' WHERE receiptNumber = ?", [purchase.receiptNumber]);

          // b. Let's delete any previously created cash moves just to avoid duplicates
          await db.run("DELETE FROM branchCashMoves WHERE referenceId = ?", [id]);

          // c. Re-insert initial advances cash moves
          if (purchase.advancePayment > 0) {
            const concept = purchase.isFullPayment ? `Pago Total Compra: ${purchase.receiptNumber}` : `Adelanto de la compra: ${purchase.receiptNumber}`;
            if (purchase.advancePaymentType === 'efectivo') {
              await db.run(`
                INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, \`date\`, createdBy, referenceId)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [crypto.randomUUID(), purchase.branchId, purchase.advancePayment, 'egreso', concept, 'adelanto', 'efectivo', null, purchase.createdAt, purchase.createdBy, id]);
            } else if (purchase.advancePaymentType === 'transferencia') {
              await db.run(`
                INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, \`date\`, createdBy, referenceId)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [crypto.randomUUID(), purchase.branchId, purchase.advancePayment, 'egreso', concept, 'adelanto', 'transferencia', purchase.advanceSourceBankAccountId || null, purchase.createdAt, purchase.createdBy, id]);
            } else if (purchase.advancePaymentType === 'mixto') {
              if ((purchase.advanceCashAmount || 0) > 0) {
                await db.run(`
                  INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, \`date\`, createdBy, referenceId)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [crypto.randomUUID(), purchase.branchId, purchase.advanceCashAmount, 'egreso', `${concept} (Efectivo)`, 'adelanto', 'efectivo', null, purchase.createdAt, purchase.createdBy, id]);
              }
              if ((purchase.advanceBankAmount || 0) > 0) {
                await db.run(`
                  INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, \`date\`, createdBy, referenceId)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [crypto.randomUUID(), purchase.branchId, purchase.advanceBankAmount, 'egreso', `${concept} (Banco)`, 'adelanto', 'transferencia', purchase.advanceSourceBankAccountId || null, purchase.createdAt, purchase.createdBy, id]);
              }
            }
          }

          // d. Re-insert any other mid-way advances
          const advancesList = purchase.advances ? JSON.parse(purchase.advances) : [];
          for (const adv of advancesList) {
            if (adv.amount > 0) {
              const concept = `Adelanto de la compra: ${purchase.receiptNumber}`;
              if (adv.paymentType === 'efectivo') {
                await db.run(`
                  INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, \`date\`, createdBy, referenceId)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [crypto.randomUUID(), purchase.branchId, adv.amount, 'egreso', concept, 'adelanto', 'efectivo', null, adv.date || purchase.createdAt, adv.createdBy || 'system', id]);
              } else if (adv.paymentType === 'transferencia') {
                await db.run(`
                  INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, \`date\`, createdBy, referenceId)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [crypto.randomUUID(), purchase.branchId, adv.amount, 'egreso', concept, 'adelanto', 'transferencia', adv.bankAccountId || null, adv.date || purchase.createdAt, adv.createdBy || 'system', id]);
              } else if (adv.paymentType === 'mixto') {
                if ((adv.cashAmount || 0) > 0) {
                  await db.run(`
                    INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, \`date\`, createdBy, referenceId)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  `, [crypto.randomUUID(), purchase.branchId, adv.cashAmount, 'egreso', `${concept} (Efectivo)`, 'adelanto', 'efectivo', null, adv.date || purchase.createdAt, adv.createdBy || 'system', id]);
                }
                if ((adv.bankAmount || 0) > 0) {
                  await db.run(`
                    INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, \`date\`, createdBy, referenceId)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  `, [crypto.randomUUID(), purchase.branchId, adv.bankAmount, 'egreso', `${concept} (Banco)`, 'adelanto', 'transferencia', adv.bankAccountId || null, adv.date || purchase.createdAt, adv.createdBy || 'system', id]);
                }
              }
            }
          }

          // e. If purchase is closed ('cerrado'), restore close-liquidating cash moves
          if (purchase.type === 'cerrado') {
            const conceptPrefix = `Liquidación Compra: ${purchase.receiptNumber}`;
            const closedDate = purchase.closedAt || purchase.createdAt;
            const closedUser = purchase.closedBy || purchase.createdBy;

            if ((purchase.closeCashAmount || 0) > 0) {
              await db.run(`
                INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, \`date\`, createdBy, referenceId)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [crypto.randomUUID(), purchase.branchId, purchase.closeCashAmount, 'egreso', `${conceptPrefix} (Efectivo)`, 'compra', 'efectivo', null, closedDate, closedUser, id]);
            }
            if ((purchase.closeBankAmount || 0) > 0) {
              await db.run(`
                INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, \`date\`, createdBy, referenceId)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [crypto.randomUUID(), purchase.branchId, purchase.closeBankAmount, 'egreso', `${conceptPrefix} (Banco)`, 'compra', 'transferencia', purchase.closeSourceBankAccountId || null, closedDate, closedUser, id]);
            }

            // Also restore any subsequent payments on liquidation balance
            const liquidationPayments = purchase.payments ? JSON.parse(purchase.payments) : [];
            for (const p of liquidationPayments) {
              const liqConcept = `Pago Balance Liquidación: ${purchase.receiptNumber}`;
              const pDate = p.date || closedDate;
              const pUser = p.createdBy || closedUser;
              
              if (p.paymentType === 'efectivo' || p.paymentType === 'mixto') {
                if ((p.cashAmount || 0) > 0) {
                  await db.run(`
                    INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, \`date\`, createdBy, referenceId)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  `, [crypto.randomUUID(), purchase.branchId, p.cashAmount, 'egreso', `${liqConcept} (Efectivo)`, 'compra', 'efectivo', null, pDate, pUser, id]);
                }
              }
              if (p.paymentType === 'transferencia' || p.paymentType === 'mixto') {
                if ((p.bankAmount || 0) > 0) {
                  await db.run(`
                    INSERT INTO branchCashMoves (id, branchId, amount, type, concept, category, paymentType, bankAccountId, \`date\`, createdBy, referenceId)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  `, [crypto.randomUUID(), purchase.branchId, p.bankAmount, 'egreso', `${liqConcept} (Transferencia)`, 'compra', 'transferencia', p.bankAccountId || null, pDate, pUser, id]);
                }
              }
            }
          }
        }
      });

      res.json({ success: true });
      broadcast("purchase_historic_toggled", { id });
    } catch (error: any) {
      console.error("Failed to toggle purchase historic status:", error);
      res.status(500).json({ error: error.message || "Failed to toggle purchase historic status" });
    }
  });

  // Void/Annul Gold Purchase Analysis
  apiRouter.get("/gold-purchases/:id/void-analysis", async (req, res) => {
    const { id } = req.params;
    try {
      const purchase = await db.get(`
        SELECT gp.*, c.name as clientName 
        FROM goldPurchases gp 
        LEFT JOIN clients c ON gp.clientId = c.id 
        WHERE gp.id = ?
      `, [id]) as any;

      if (!purchase) {
        return res.status(404).json({ error: "Compra no encontrada" });
      }

      // Fetch related cash moves
      const cashMoves = await db.all("SELECT * FROM branchCashMoves WHERE referenceId = ?", [id]);

      // Fetch related referrer payouts
      const referrerPayouts = await db.all("SELECT * FROM referrerPayouts WHERE purchaseIds LIKE ?", [`%"${id}"%`]);

      res.json({
        purchase,
        cashMoves,
        referrerPayouts
      });
    } catch (error) {
      console.error("Failed to fetch void analysis:", error);
      res.status(500).json({ error: "No se pudo obtener la información de anulación" });
    }
  });

  // Void/Annul Gold Purchase Action
  apiRouter.post("/gold-purchases/:id/void", async (req, res) => {
    const { id } = req.params;
    const { voidedBy, voidReason } = req.body;
    const voidedAt = new Date().toISOString();

    if (!voidedBy || !voidReason) {
      return res.status(400).json({ error: "Debe especificar quién anula y la justificación obligatoria." });
    }

    try {
      await db.transaction(async () => {
        // Validate existence
        const purchase = await db.get("SELECT type, receiptNumber FROM goldPurchases WHERE id = ?", [id]) as any;
        if (!purchase) throw new Error("Compra no encontrada");
        if (purchase.type === 'anulado') throw new Error("La compra ya se encuentra anulada");

        // Set type to 'anulado'
        await db.run(`
          UPDATE goldPurchases 
          SET type = 'anulado', 
              voidedAt = ?, 
              voidedBy = ?, 
              voidReason = ? 
          WHERE id = ?
        `, [voidedAt, voidedBy, voidReason, id]);

        // Revert related cash moves by deleting them so petty cash is restored
        await db.run("DELETE FROM branchCashMoves WHERE referenceId = ?", [id]);

        // Delete any verified materials from central inventory with this receipt number
        await db.run("DELETE FROM materials WHERE receiptNumber = ?", [purchase.receiptNumber]);

        // Revert items' close price details just in case
        await db.run(`
          UPDATE goldPurchaseItems 
          SET closeMarketPrice = NULL, 
              closeUsdToBs = NULL, 
              closePricePerGram = NULL, 
              closePricePerGram100 = NULL, 
              closeTotal = NULL 
          WHERE purchaseId = ?
        `, [id]);
      });

      res.json({ success: true, voidedAt, voidedBy });
      broadcast("purchase_updated", { id });
    } catch (error: any) {
      console.error("Failed to void gold purchase:", error);
      res.status(500).json({ error: error.message || "Error al anular la compra" });
    }
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
      const existingMove = await db.get("SELECT * FROM branchCashMoves WHERE id = ?", [moveId]);
      if (existingMove) {
        const isProtected = existingMove.category === 'adelanto' || existingMove.category === 'compra' || fieldsToUpdate.category === 'adelanto' || fieldsToUpdate.category === 'compra';
        if (isProtected) {
          const userRole = req.headers['x-user-role'];
          if (userRole !== 'superadmin') {
            return res.status(403).json({ error: "Permiso denegado. Solo un Súper Administrador puede modificar movimientos de adelanto o compra." });
          }
        }
      }

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
    const { notes, createdBy, physicalBalance, differenceAmount, differenceJustification, cashCountBreakdown } = req.body;
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
          INSERT INTO branchClosures (id, branchId, \`date\`, initialBalance, totalCashIn, totalCashOut, finalBalance, status, createdBy, closedAt, notes, physicalBalance, differenceAmount, differenceJustification, cashCountBreakdown)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          closureId, 
          branchId, 
          closureDate, 
          initialBalance, 
          incomes, 
          expenses, 
          finalBalance, 
          'cerrado', 
          createdBy, 
          closedAt, 
          notes || null,
          physicalBalance !== undefined && physicalBalance !== null ? Number(physicalBalance) : null,
          differenceAmount !== undefined && differenceAmount !== null ? Number(differenceAmount) : null,
          differenceJustification || null,
          cashCountBreakdown || null
        ]);

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

  const activeDrafts = new Map<string, any>();

  apiRouter.get("/branches/:branchId/customer-display", (req, res) => {
    const username = req.query.username as string || '';
    const key = username ? `${req.params.branchId}_${username}` : req.params.branchId;
    const data = activeDrafts.get(key) || { cart: [], header: null, updatedAt: null };
    res.json(data);
  });

  apiRouter.post("/branches/:branchId/customer-display", (req, res) => {
    const { cart, header } = req.body;
    const username = req.query.username as string || '';
    const key = username ? `${req.params.branchId}_${username}` : req.params.branchId;
    activeDrafts.set(key, {
      cart: cart || [],
      header: header || null,
      updatedAt: new Date().toISOString()
    });
    res.json({ success: true });
  });

  // Mount API router FIRST
  app.use("/api", apiRouter);

  // API 404 handler: if a request starts with /api but didn't match any route
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: "Route not found", path: req.url });
  });

  // Vite middleware for development (with fallback if dist directory is missing)
  if (process.env.NODE_ENV !== "production" || !fs.existsSync(path.join(process.cwd(), "dist"))) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  httpServer.on('error', (err: any) => {
    const errorMsg = `Server error: ${err.message}`;
    fs.appendFileSync("startup_log.txt", `${new Date().toISOString()} - ${errorMsg}\n`);
    if (err.code === 'EADDRINUSE') {
      console.error(`Error: Port ${PORT} is already in use. Please close the process using it and try again.`);
    } else {
      console.error(errorMsg, err);
    }
    process.exit(1);
  });

  // WebSocket Server Setup sharing the HTTP port
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws) => {
    console.log("WebSocket client connected.");

    // Keep connection alive with heartbeat pings
    let isAlive = true;
    ws.on("pong", () => {
      isAlive = true;
    });

    const pingInterval = setInterval(() => {
      if (!isAlive) {
        console.log("WebSocket client inactive. Terminating connection.");
        ws.terminate();
        return;
      }
      isAlive = false;
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);

    ws.on("close", () => {
      console.log("WebSocket client disconnected.");
      clearInterval(pingInterval);
    });

    ws.on("error", (err) => {
      console.error("WebSocket socket error:", err);
      clearInterval(pingInterval);
    });
  });

  // Concrete broadcast implementation using the active connections in the wss server
  broadcast = (event: string, payload?: any) => {
    const message = JSON.stringify({ event, payload });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  };

  // Background interval check for materials stay limit in inventory
  setInterval(async () => {
    try {
      const settings = await db.get("SELECT maxStayMinutes, maxStayMinutes_pieza, maxStayMinutes_barra, notifyVisual_pieza, notifyVisual_barra, notifySound_pieza, notifySound_barra FROM companySettings LIMIT 1");
      const defaultLimit = (settings && settings.maxStayMinutes !== undefined && settings.maxStayMinutes !== null) ? Number(settings.maxStayMinutes) : 2880;
      
      const limitPieza = (settings && settings.maxStayMinutes_pieza !== undefined && settings.maxStayMinutes_pieza !== null) ? Number(settings.maxStayMinutes_pieza) : defaultLimit;
      const limitBarra = (settings && settings.maxStayMinutes_barra !== undefined && settings.maxStayMinutes_barra !== null) ? Number(settings.maxStayMinutes_barra) : defaultLimit;
      
      const notifyVisualPieza = (settings && settings.notifyVisual_pieza !== undefined && settings.notifyVisual_pieza !== null) ? Number(settings.notifyVisual_pieza) !== 0 : true;
      const notifyVisualBarra = (settings && settings.notifyVisual_barra !== undefined && settings.notifyVisual_barra !== null) ? Number(settings.notifyVisual_barra) !== 0 : true;
      const notifySoundPieza = (settings && settings.notifySound_pieza !== undefined && settings.notifySound_pieza !== null) ? Number(settings.notifySound_pieza) !== 0 : true;
      const notifySoundBarra = (settings && settings.notifySound_barra !== undefined && settings.notifySound_barra !== null) ? Number(settings.notifySound_barra) !== 0 : true;

      const materials = await db.all("SELECT id, receiptNumber, registrationDate, initialWeight, type FROM materials WHERE status = 'disponible'");
      const now = new Date();
      
      const expiredList = [];
      for (const m of materials) {
        if (!m.registrationDate) continue;
        const regDate = new Date(m.registrationDate);
        const diffMs = now.getTime() - regDate.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        
        let limit = defaultLimit;
        let visualAllowed = true;
        let soundAllowed = true;
        
        if (m.type === 'pieza') {
          limit = limitPieza;
          visualAllowed = notifyVisualPieza;
          soundAllowed = notifySoundPieza;
        } else if (m.type === 'barra') {
          limit = limitBarra;
          visualAllowed = notifyVisualBarra;
          soundAllowed = notifySoundBarra;
        }
        
        // Skip alerting if both visual and sound are disabled for this type
        if (!visualAllowed && !soundAllowed) continue;
        
        if (diffMin > limit) {
          expiredList.push({
            id: m.id,
            receiptNumber: m.receiptNumber,
            registrationDate: m.registrationDate,
            initialWeight: m.initialWeight,
            type: m.type,
            elapsedMinutes: diffMin,
            limit: limit,
            notifyVisual: visualAllowed,
            notifySound: soundAllowed
          });
        }
      }
      
      if (expiredList.length > 0) {
        broadcast("material_stay_limit_warning", {
          expiredMaterials: expiredList,
          settings: {
            defaultLimit,
            limitPieza,
            limitBarra,
            notifyVisualPieza,
            notifyVisualBarra,
            notifySoundPieza,
            notifySoundBarra
          }
        });
      }
    } catch (err) {
      console.error("Error in background material stay check:", err);
    }
  }, 30000); // Check every 30 seconds for immediate responsiveness in demonstration and operations

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
