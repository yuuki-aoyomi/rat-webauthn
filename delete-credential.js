import db from "./database.js";

const result = db.prepare(`
  DELETE FROM credentials
  WHERE user_id = (
    SELECT id
    FROM users
    WHERE username = ?
  )
`).run("aoyomi");

console.log("deleted rows:", result.changes);

console.log(
  "users:",
  db.prepare("SELECT * FROM users").all()
);

console.log(
  "credentials:",
  db.prepare("SELECT * FROM credentials").all()
);
