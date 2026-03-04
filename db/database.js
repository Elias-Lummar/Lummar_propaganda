const Database = require("better-sqlite3");
const path = require("path");

let db;

function initDatabase() {
  try {
    const dbPath = path.join(__dirname, "advertisements.db");
    db = new Database(dbPath);

    // WAL mode – melhor performance em leituras concorrentes
    db.pragma("journal_mode = WAL");

    db.exec(`
      CREATE TABLE IF NOT EXISTS ads (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        title               TEXT    NOT NULL,
        file_path           TEXT    NOT NULL,
        start_time          DATETIME NOT NULL,
        end_time            DATETIME NOT NULL,
        transition_type     TEXT    NOT NULL DEFAULT 'fade',
        transition_duration INTEGER NOT NULL DEFAULT 3,
        screens             TEXT    NOT NULL DEFAULT '[]',
        display_order       INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Migrações: adiciona colunas novas sem quebrar banco existente
    const existingCols = db
      .prepare("PRAGMA table_info(ads)")
      .all()
      .map((c) => c.name);

    if (!existingCols.includes("screens")) {
      db.exec("ALTER TABLE ads ADD COLUMN screens TEXT NOT NULL DEFAULT '[]'");
    }
    if (!existingCols.includes("display_order")) {
      db.exec(
        "ALTER TABLE ads ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0",
      );
    }

    console.log("Database initialized (better-sqlite3)");
    return Promise.resolve();
  } catch (err) {
    console.error("Error initializing database:", err.message);
    return Promise.reject(err);
  }
}

function getDb() {
  return db;
}

module.exports = { initDatabase, getDb };
