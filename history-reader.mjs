const fileInput = typeof document !== "undefined" ? document.getElementById("historyFile") : null;
const feedback = typeof document !== "undefined" ? document.getElementById("readerFeedback") : null;
const progress = typeof document !== "undefined" ? document.getElementById("readerProgress") : null;
const status = typeof document !== "undefined" ? document.getElementById("readerStatus") : null;
const resultBox = typeof document !== "undefined" ? document.getElementById("readerResult") : null;
const dropZone = typeof document !== "undefined" ? document.getElementById("historyDropZone") : null;
const fileName = typeof document !== "undefined" ? document.getElementById("readerFileName") : null;
let isReading = false;
let pendingFile = null;

const normalizeText = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[‐‑‒–—]/g, "-").replace(/[^A-Z0-9()/:.\-\n ]+/g, " ").replace(/[ \t]+/g, " ");
const digitsOnly = (value) => String(value || "").replace(/\D/g, "");
const ignoredTokens = new Set(["DE", "DEL", "LA", "LAS", "EL", "LOS", "PARA", "Y", "E", "I", "II", "III", "IV"]);
const approvalPattern = /\b(?:APR[O0]B(?:ADO|ADA)?|CONV(?:ALIDADO|ALIDADA)?\.?|VALIDAD[AO])\b/;
const nonApprovalPattern = /\b(?:REPR[O0]B(?:ADO|ADA)?|ABANDON(?:O|ADO|ADA)?|RETIRAD[AO])\b/;

function uppercaseClean(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("es");
}

function extractIdentity(text) {
  const compact = normalizeText(text).replace(/[ \t]+/g, " ");
  const nameMatch = compact.match(/(?:NOMBRE(?:\s*\(\s*S\s*\)|S)?|APELLIDOS?\s+Y\s+NOMBRES?)\s*[:\-]?\s*([A-ZÑ ]{5,}?)(?=\s+(?:FECHA|NRO\.?\s*(?:C\s*\.?\s*[I1]\.?|CI)|C\s*\.?\s*[I1]\.?|CI|CEDULA|CARNET|MATRICULA|REG(?:ISTRO)?\.?\s*UNIV|R\.?\s*U\.?|CARRERA|PLAN|NIVEL)\b|\n|$)/i);
  const ciMatch = compact.match(/(?:\bC\s*\.?\s*[I1]\.?|\bCI\b|CEDULA(?:\s+DE\s+IDENTIDAD)?|CARNET(?:\s+DE\s+IDENTIDAD)?|NRO\.?\s*C\s*\.?\s*[I1]\.?)\s*[:\-]?\s*(\d[\d. ]{4,14})/i);
  const ruMatch = compact.match(/(?:REG(?:ISTRO)?\.?\s*UNIV(?:ERSITARIO)?\.?|R\.?\s*U\.?)\s*[:\-]?\s*(\d[\d. ]{4,14})/i) || compact.match(/MATRICULA\s*[:\-]?\s*(\d[\d. ]{4,14})/i);
  return {
    name: nameMatch ? uppercaseClean(nameMatch[1]) : "",
    ci: ciMatch ? digitsOnly(ciMatch[1]) : "",
    ru: ruMatch ? digitsOnly(ruMatch[1]) : ""
  };
}

function courseTokens(name) {
  return [...new Set(normalizeText(name).split(/\s+/).filter((token) => token.length >= 4 && !ignoredTokens.has(token)))];
}

function canonicalCode(value) {
  return normalizeText(value).replace(/[^A-Z0-9]/g, "");
}

function tokenPresent(haystack, token) {
  if (haystack.includes(token)) return true;
  const compactToken = canonicalCode(token);
  if (compactToken.length >= 4 && canonicalCode(haystack).includes(compactToken)) return true;
  if (token.length < 6) return false;
  const stem = token.slice(0, Math.max(5, token.length - 2));
  return haystack.includes(stem);
}

function lineMatchesCode(line, code) {
  const compactLine = canonicalCode(line);
  if (compactLine.includes(code)) return true;
  const parts = code.match(/^([A-Z]+)(\d+)$/);
  if (!parts) return false;
  const substitutions = {"0":"[0OQ]","1":"[1ILT]","2":"[2Z]","3":"3","4":"[4A]","5":"[5S]","6":"[6G]","7":"[7T]","8":"[8B]","9":"[9G]"};
  const fuzzyDigits = [...parts[2]].map((digit) => substitutions[digit] || digit).join("");
  return new RegExp(`${parts[1]}${fuzzyDigits}`).test(compactLine);
}

function courseCodeOccurrences(text) {
  const matches = [];
  const pattern = /\b[A-Z]{2,4}\s*[- ]?\s*\d{3}\b/g;
  let match;
  while ((match = pattern.exec(text))) matches.push({index:match.index, end:pattern.lastIndex, code:canonicalCode(match[0])});
  return matches;
}

function matchingCourseBlocks(normalized, code) {
  const occurrences = courseCodeOccurrences(normalized);
  const blocks = [];
  for (let index = 0; index < occurrences.length; index += 1) {
    const occurrence = occurrences[index];
    if (occurrence.code !== code) continue;
    const next = occurrences[index + 1];
    const blockEnd = next ? Math.min(next.index, occurrence.index + 650) : Math.min(normalized.length, occurrence.index + 650);
    blocks.push(normalized.slice(occurrence.index, blockEnd));
  }
  return blocks;
}

function detectOldCourses(text, rows) {
  const normalized = normalizeText(text);
  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const detected = [];
  for (const row of rows || []) {
    const code = canonicalCode(row.code);
    const tokens = courseTokens(row.name);
    let found = false;

    // Primero analiza el registro completo comprendido entre una sigla y la siguiente.
    // Esto funciona aunque las columnas del PDF se extraigan separadas o desordenadas.
    for (const block of matchingCourseBlocks(normalized, code)) {
      const tokenMatches = tokens.filter((token) => tokenPresent(block, token)).length;
      const enoughName = tokens.length === 0 || tokenMatches >= Math.min(2, tokens.length);
      const strongName = tokens.length > 0 && tokenMatches >= Math.max(1, Math.ceil(tokens.length * 0.6));
      if (!nonApprovalPattern.test(block) && enoughName && (approvalPattern.test(block) || strongName)) {
        found = true;
        break;
      }
    }

    // Respaldo para PDFs cuyas celdas terminan repartidas en varias líneas.
    for (let index = 0; index < lines.length && !found; index += 1) {
      if (!lineMatchesCode(lines[index], code)) continue;
      if (nonApprovalPattern.test(lines[index])) continue;
      const nearby = lines.slice(Math.max(0, index - 3), Math.min(lines.length, index + 8)).join(" ");
      const tokenMatches = tokens.filter((token) => tokenPresent(nearby, token)).length;
      const enoughName = tokens.length === 0 || tokenMatches >= Math.min(2, tokens.length);
      const strongName = tokens.length > 0 && tokenMatches >= Math.max(1, Math.ceil(tokens.length * 0.6));
      if (!nonApprovalPattern.test(nearby) && enoughName && (approvalPattern.test(nearby) || strongName)) found = true;
    }
    if (found) detected.push(row);
  }
  return detected;
}

function parseHistoryText(text, rows) {
  return {...extractIdentity(text), courses:detectOldCourses(text, rows)};
}

function updateProgress(value, message) {
  if (!feedback) return;
  feedback.hidden = false;
  progress.value = Math.max(0, Math.min(100, Number(value) || 0));
  status.textContent = message;
}

function pdfItemsToText(items) {
  const lines = new Map();
  for (const item of items) {
    const y = Math.round((item.transform?.[5] || 0) / 3) * 3;
    if (!lines.has(y)) lines.set(y, []);
    lines.get(y).push({x:item.transform?.[4] || 0, text:item.str || ""});
  }
  return [...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, values]) => values.sort((a, b) => a.x - b.x).map((value) => value.text).join(" ")).join("\n");
}

async function loadPdf(file) {
  const pdfjs = await import("./assets/vendor/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("./assets/vendor/pdf.worker.min.mjs", import.meta.url).href;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({data}).promise;
  let text = "";
  const pageTexts = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    updateProgress(5 + (pageNumber / pdf.numPages) * 25, `Leyendo texto del PDF (${pageNumber}/${pdf.numPages})…`);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = pdfItemsToText(content.items);
    pageTexts.push(pageText);
    text += `${pageText}\n`;
  }
  return {pdf, text, pageTexts};
}

async function createOcrWorker() {
  if (!globalThis.Tesseract) throw new Error("No se pudo iniciar el lector de imágenes.");
  const base = new URL("./assets/vendor/", import.meta.url).href.replace(/\/$/, "");
  const worker = await globalThis.Tesseract.createWorker("eng", 1, {
    workerPath: `${base}/tesseract-worker.min.js`,
    corePath: `${base}/tesseract-core.wasm.js`,
    langPath: base,
    logger(message) {
      if (message.status === "recognizing text") updateProgress(35 + message.progress * 60, `Reconociendo texto de la imagen (${Math.round(message.progress * 100)}%)…`);
    }
  });
  await worker.setParameters({
    tessedit_pageseg_mode:"6",
    preserve_interword_spaces:"1",
    user_defined_dpi:"300"
  });
  return worker;
}

function improveDocumentCanvas(canvas) {
  const context = canvas.getContext("2d", {willReadFrequently:true});
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const gray = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    const enhanced = gray > 242 ? 255 : Math.max(0, Math.min(255, (gray - 128) * 1.22 + 128));
    pixels[index] = enhanced;
    pixels[index + 1] = enhanced;
    pixels[index + 2] = enhanced;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

async function ocrPdf(pdf, requestedPages = null) {
  const worker = await createOcrWorker();
  let text = "";
  try {
    const pages = requestedPages?.length ? requestedPages : Array.from({length:Math.min(pdf.numPages, 12)}, (_, index) => index + 1);
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const pageNumber = pages[pageIndex];
      updateProgress(30 + (pageIndex / pages.length) * 65, `Preparando página escaneada (${pageIndex + 1}/${pages.length})…`);
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({scale:1});
      const scale = Math.max(3.4, Math.min(4.2, 3300 / baseViewport.height));
      const viewport = page.getViewport({scale});
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({canvasContext:canvas.getContext("2d", {willReadFrequently:true}), viewport}).promise;
      const response = await worker.recognize(improveDocumentCanvas(canvas));
      text += `${response.data.text}\n`;
    }
  } finally {
    await worker.terminate();
  }
  return text;
}

async function ocrImage(file) {
  const worker = await createOcrWorker();
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.max(1, Math.min(4, 2400 / bitmap.width));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d", {willReadFrequently:true});
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const response = await worker.recognize(improveDocumentCanvas(canvas));
    return response.data.text;
  } finally {
    await worker.terminate();
  }
}

function showResult(parsed, applied) {
  const identity = [parsed.name && `Nombre: ${parsed.name}`, parsed.ci && `CI: ${parsed.ci}`, parsed.ru && `RU: ${parsed.ru}`].filter(Boolean);
  const courses = parsed.courses || [];
  const courseList = courses.length ? `<ul>${courses.map((course) => `<li><b>${uppercaseClean(course.code)}</b> ${uppercaseClean(course.name)}</li>`).join("")}</ul>` : `<p class="reader-warning">No se reconocieron materias del plan antiguo. Puedes continuar marcándolas manualmente.</p>`;
  resultBox.innerHTML = `<strong>${courses.length} materia${courses.length === 1 ? "" : "s"} antigua${courses.length === 1 ? "" : "s"} marcada${courses.length === 1 ? "" : "s"}</strong>${identity.length ? `<p>${identity.join(" · ")}</p>` : ""}${courseList}<p>Puedes corregir cualquier dato o materia manualmente antes de generar el PDF.</p>`;
  resultBox.hidden = false;
  updateProgress(100, `Lectura terminada. Hay ${applied.selected} materias seleccionadas en total.`);
}

async function handleFile(file) {
  const api = globalThis.ConvalidationImportApi;
  const context = api?.getContext();
  if (!context) {
    updateProgress(0, "Archivo listo. Selecciona las dos menciones para iniciar la lectura automática.");
    return false;
  }
  resultBox.hidden = true;
  updateProgress(2, "Preparando el historial académico…");
  let text = "";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const loaded = await loadPdf(file);
    text = loaded.text;
    const initial = parseHistoryText(text, context.rows);
    const sparsePages = loaded.pageTexts.map((pageText, index) => ({page:index + 1, length:normalizeText(pageText).replace(/\s/g, "").length})).filter((item) => item.length < 180).map((item) => item.page);
    const needsFullOcr = normalizeText(text).replace(/\s/g, "").length < 250 || initial.courses.length === 0 || !initial.name || !initial.ci || !initial.ru;
    if (needsFullOcr || sparsePages.length) {
      updateProgress(30, "Completando la lectura del PDF mediante reconocimiento de imágenes…");
      const ocrText = await ocrPdf(loaded.pdf, needsFullOcr ? null : sparsePages);
      text = `${text}\n${ocrText}`;
    }
  } else if (/^image\/(png|jpeg)$/.test(file.type)) {
    text = await ocrImage(file);
  } else {
    throw new Error("Selecciona un archivo PDF, PNG o JPG.");
  }
  const parsed = parseHistoryText(text, context.rows);
  const applied = api.apply({name:parsed.name, ci:parsed.ci, ru:parsed.ru, rowIds:parsed.courses.map((course) => course.id)});
  showResult(parsed, applied);
  return true;
}

function isAcceptedFile(file) {
  return Boolean(file && (file.type === "application/pdf" || /^image\/(png|jpeg)$/.test(file.type) || /\.(pdf|png|jpe?g)$/i.test(file.name)));
}

async function processFile(file) {
  if (!file) return;
  if (isReading) {
    updateProgress(progress?.value || 0, "Espera a que termine la lectura actual.");
    return;
  }
  if (!isAcceptedFile(file)) {
    updateProgress(0, "Formato no compatible. Usa un archivo PDF, PNG o JPG.");
    return;
  }
  pendingFile = file;
  if (fileName) {
    fileName.textContent = file.name;
    fileName.hidden = false;
  }
  if (resultBox) resultBox.hidden = true;
  const context = globalThis.ConvalidationImportApi?.getContext();
  if (!context) {
    dropZone?.classList.add("is-pending");
    updateProgress(0, "Archivo cargado. Selecciona la mención antigua y la mención de destino; después se leerá automáticamente.");
    if (fileInput) fileInput.value = "";
    return;
  }
  isReading = true;
  dropZone?.classList.remove("is-pending");
  dropZone?.classList.add("is-reading");
  dropZone?.setAttribute("aria-busy", "true");
  try {
    const completed = await handleFile(file);
    if (completed) pendingFile = null;
    else dropZone?.classList.add("is-pending");
  } catch (error) {
    console.error(error);
    pendingFile = null;
    updateProgress(0, "No se pudo leer el archivo. Puedes continuar llenando los datos manualmente.");
  } finally {
    isReading = false;
    dropZone?.classList.remove("is-reading", "is-dragover");
    dropZone?.removeAttribute("aria-busy");
    if (fileInput) fileInput.value = "";
  }
}

function readPendingFileWhenReady() {
  if (!pendingFile || isReading || !globalThis.ConvalidationImportApi?.getContext()) return;
  processFile(pendingFile);
}

if (fileInput) fileInput.addEventListener("change", (event) => {
  processFile(event.target.files?.[0]);
});

if (typeof document !== "undefined") {
  for (const selectId of ["oldMentionSelect", "careerSelect"]) {
    document.getElementById(selectId)?.addEventListener("change", () => queueMicrotask(readPendingFileWhenReady));
  }
}

if (dropZone) {
  let dragDepth = 0;
  dropZone.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    fileInput?.click();
  });
  dropZone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dragDepth += 1;
    if (!isReading) dropZone.classList.add("is-dragover");
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = isReading ? "none" : "copy";
  });
  dropZone.addEventListener("dragleave", (event) => {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropZone.classList.remove("is-dragover");
  });
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    dropZone.classList.remove("is-dragover");
    processFile(event.dataTransfer?.files?.[0]);
  });
}

export {normalizeText, extractIdentity, detectOldCourses, parseHistoryText};
