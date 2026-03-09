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
                    screens TEXT NOT NULL DEFAULT '["presenter"]'
                )
            `,
        (err) => {
          if (err) {
            console.error("Error creating table:", err.message);
            reject(err);
            return;
          }

          // Migração: renomear coluna 'screen' para 'screens' se necessário
          db.all("PRAGMA table_info(ads)", [], (pragmaErr, columns) => {
            if (pragmaErr) {
              console.error("Error reading table info:", pragmaErr.message);
              reject(pragmaErr);
              return;
            }

            var hasScreen = columns.some(function (c) {
              return c.name === "screen";
            });
            var hasScreens = columns.some(function (c) {
              return c.name === "screens";
            });

            function afterScreensMigration() {
              // Adiciona coluna 'display_order' se não existir
              db.run(
                "ALTER TABLE ads ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0",
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

                  // Criar tabela de ordens por tela
                  db.run(
                    `CREATE TABLE IF NOT EXISTS ad_screen_orders (
                      ad_id INTEGER NOT NULL,
                      screen TEXT NOT NULL,
                      display_order INTEGER NOT NULL DEFAULT 0,
                      PRIMARY KEY (ad_id, screen)
                    )`,
                    (createErr) => {
                      if (createErr) {
                        console.error(
                          "Error creating ad_screen_orders:",
                          createErr.message,
                        );
                      }

                      // Migração: popular ad_screen_orders com dados existentes (apenas se vazia)
                      db.get(
                        "SELECT COUNT(*) AS cnt FROM ad_screen_orders",
                        [],
                        (countErr, countRow) => {
                          if (!countErr && countRow && countRow.cnt === 0) {
                            db.all(
                              "SELECT id, screens, display_order FROM ads",
                              [],
                              (selErr, adRows) => {
                                if (selErr || !adRows || !adRows.length) {
                                  console.log("Database table initialized");
                                  return resolve();
                                }
                                let total = 0;
                                adRows.forEach((row) => {
                                  try {
                                    const scrs = JSON.parse(
                                      row.screens || "[]",
                                    );
                                    total += scrs.length;
                                  } catch (e) {}
                                });
                                if (total === 0) {
                                  console.log("Database table initialized");
                                  return resolve();
                                }
                                let done = 0;
                                adRows.forEach((row) => {
                                  try {
                                    const scrs = JSON.parse(
                                      row.screens || "[]",
                                    );
                                    scrs.forEach((screen) => {
                                      db.run(
                                        "INSERT OR IGNORE INTO ad_screen_orders (ad_id, screen, display_order) VALUES (?, ?, ?)",
                                        [row.id, screen, row.display_order],
                                        () => {
                                          done++;
                                          if (done === total) {
                                            console.log(
                                              "Database table initialized",
                                            );
                                            resolve();
                                          }
                                        },
                                      );
                                    });
                                  } catch (e) {
                                    done++;
                                    if (done === total) {
                                      console.log("Database table initialized");
                                      resolve();
                                    }
                                  }
                                });
                              },
                            );
                          } else {
                            console.log("Database table initialized");
                            resolve();
                          }
                        },
                      );
                    },
                  );
                },
              );
            }

            if (hasScreen && !hasScreens) {
              // Renomear 'screen' para 'screens' via ALTER TABLE RENAME COLUMN (SQLite 3.25+)
              db.run(
                "ALTER TABLE ads RENAME COLUMN screen TO screens",
                (renameErr) => {
                  if (renameErr) {
                    console.error(
                      "Error renaming screen column, trying alternative:",
                      renameErr.message,
                    );
                    // Fallback: adicionar coluna screens e copiar dados
                    db.run(
                      "ALTER TABLE ads ADD COLUMN screens TEXT NOT NULL DEFAULT '[]'",
                      (addErr) => {
                        if (
                          addErr &&
                          !addErr.message.includes("duplicate column name")
                        ) {
                          console.error(
                            "Error adding screens column:",
                            addErr.message,
                          );
                        }
                        // Copiar dados de screen para screens
                        db.run(
                          "UPDATE ads SET screens = screen WHERE screens = '[]' AND screen IS NOT NULL AND screen != ''",
                          () => {
                            afterScreensMigration();
                          },
                        );
                      },
                    );
                  } else {
                    console.log(
                      "Column 'screen' renamed to 'screens' successfully",
                    );
                    afterScreensMigration();
                  }
                },
              );
            } else if (!hasScreens) {
              // Tabela não tem nem screen nem screens
              db.run(
                "ALTER TABLE ads ADD COLUMN screens TEXT NOT NULL DEFAULT '[]'",
                (addErr) => {
                  if (
                    addErr &&
                    !addErr.message.includes("duplicate column name")
                  ) {
                    console.error(
                      "Error adding screens column:",
                      addErr.message,
                    );
                  }
                  afterScreensMigration();
                },
              );
            } else {
              afterScreensMigration();
            }
          });
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
