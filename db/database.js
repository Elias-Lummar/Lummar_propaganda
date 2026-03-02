const sqlite3 = require("sqlite3").verbose();
const path = require("path");

let db;

function initDatabase() {
  return new Promise((resolve, reject) => {
    const dbPath = path.join(__dirname, "advertisements.db");
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error("Error opening database:", err.message);
        reject(err);
        return;
      }
      console.log("Connected to SQLite database");

      // Create ads table
      db.run(
        `
                CREATE TABLE IF NOT EXISTS ads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    start_time DATETIME NOT NULL,
                    end_time DATETIME NOT NULL,
                    transition_type TEXT NOT NULL DEFAULT 'fade',
                    transition_duration INTEGER NOT NULL DEFAULT 3,
                    screen TEXT NOT NULL DEFAULT 'presenter'
                )
            `,
        (err) => {
          if (err) {
            console.error("Error creating table:", err.message);
            reject(err);
            return;
          }
          // Adiciona coluna 'screen' se não existir
          db.run(
            `ALTER TABLE ads ADD COLUMN screen TEXT NOT NULL DEFAULT 'presenter'`,
            (alterErr) => {
              if (
                alterErr &&
                !alterErr.message.includes("duplicate column name")
              ) {
                console.error("Error adding screen column:", alterErr.message);
              }
              // Adiciona coluna 'display_order' se não existir
              db.run(
                `ALTER TABLE ads ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0`,
                (orderErr) => {
                  if (
                    orderErr &&
                    !orderErr.message.includes("duplicate column name")
                  ) {
                    console.error(
                      "Error adding display_order column:",
                      orderErr.message,
                    );
                  }
                  console.log("Database table initialized");
                  resolve();
                },
              );
            },
          );
        },
      );
    });
  });
}

function getDb() {
  return db;
}

module.exports = {
  initDatabase,
  getDb,
};
