import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import db from "./src/db.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/herbs", (req, res) => {
    const query = req.query.q as string;
    if (query) {
      const stmt = db.prepare("SELECT * FROM herbs WHERE name LIKE ? OR primary_uses LIKE ? LIMIT 20");
      const results = stmt.all(`%${query}%`, `%${query}%`);
      res.json(results);
    } else {
      const results = db.prepare("SELECT * FROM herbs LIMIT 50").all();
      res.json(results);
    }
  });

  app.get("/api/herbs/suggestions", (req, res) => {
    const query = req.query.q as string;
    if (!query) return res.json([]);
    const stmt = db.prepare("SELECT name FROM herbs WHERE name LIKE ? LIMIT 5");
    const results = stmt.all(`${query}%`);
    res.json(results.map((r: any) => r.name));
  });

  app.get("/api/herbs/:id", (req, res) => {
    const stmt = db.prepare("SELECT * FROM herbs WHERE id = ?");
    const result = stmt.get(req.params.id);
    if (result) res.json(result);
    else res.status(404).json({ error: "Herb not found" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
