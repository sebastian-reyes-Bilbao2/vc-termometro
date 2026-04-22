/**
 * git-sync.mjs
 * Sube data.json e index.html al repositorio de GitHub usando la API REST.
 * No requiere git instalado localmente.
 *
 * Credenciales: lee de scripts/.env o de variables de entorno del sistema.
 * Uso: node scripts/git-sync.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ── Cargar .env si existe ────────────────────────────────────────────────────
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
}

// ── Config ───────────────────────────────────────────────────────────────────
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER        = process.env.GITHUB_OWNER  || "sebastian-reyes-Bilbao2";
const REPO         = process.env.GITHUB_REPO   || "vc-termometro";
const BRANCH       = process.env.GITHUB_BRANCH || "main";
const FILES        = ["index.html", "data.json"];

if (!GITHUB_TOKEN) {
  console.error("❌ GITHUB_TOKEN no encontrado. Revisá scripts/.env");
  process.exit(1);
}
// ─────────────────────────────────────────────────────────────────────────────

const BASE = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;
const HEADERS = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept:        "application/vnd.github+json",
  "User-Agent":  "vc-termometro-sync/1.0",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function getFileSHA(filePath) {
  const res = await fetch(`${BASE}/${filePath}?ref=${BRANCH}`, { headers: HEADERS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${filePath}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.sha;
}

async function pushFile(filePath) {
  const localPath = path.join(ROOT, filePath);
  const content   = fs.readFileSync(localPath);
  const b64       = content.toString("base64");
  const sha       = await getFileSHA(filePath);

  const now  = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
  const body = {
    message: `auto: update ${filePath} — ${now}`,
    content: b64,
    branch:  BRANCH,
    ...(sha ? { sha } : {}),
  };

  const res = await fetch(`${BASE}/${filePath}`, {
    method:  "PUT",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`PUT ${filePath}: ${res