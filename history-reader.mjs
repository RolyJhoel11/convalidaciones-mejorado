const fileInput = typeof document !== "undefined" ? document.getElementById("historyFile") : null;
const feedback = typeof document !== "undefined" ? document.getElementById("readerFeedback") : null;
const progress = typeof document !== "undefined" ? document.getElementById("readerProgress") : null;
const status = typeof document !== "undefined" ? document.getElementById("readerStatus") : null;
const resultBox = typeof document !== "undefined" ? document.getElementById("readerResult") : null;
const dropZone = typeof document !== "undefined" ? document.getElementById("historyDropZone") : null;
const fileName = typeof document !== "undefined" ? document.getElementById("readerFileName") : null;
const fileChip = typeof document !== "undefined" ? document.getElementById("readerFileChip") : null;
const readerActions = typeof document !== "undefined" ? document.getElementById("readerActions") : null;
const startReading = typeof document !== "undefined" ? document.getElementById("startHistoryReading") : null;
const removeFile = typeof document !== "undefined" ? document.getElementById("removeHistoryFile") : null;
let isReading = false;
let pendingFile = null;

const normalizeText = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[‐‑‒–—]/g, "-").replace(/[^A-Z0-9()/:.\-\n\f ]+/g, " ").replace(/[ \t]+/g, " ");
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

function historyRecords(text) {
  const records = [];
  let current = null, semester = '';
  for (const page of normalizeText(text).split('\f')) {
    current = null;
    for (const line of page.split(/\n+/)) {
      const term = line.match(/^\s*(20\d{2})\s+(PRIMERO|SEGUNDO|VERANO|INVIERNO|II|I)\s*$/);
      const reversedTerm = line.match(/^\s*(PRIMERO|SEGUNDO|VERANO|INVIERNO|II|I)\s*[/ -]?\s*(20\d{2})\s*$/);
      if (term || reversedTerm) {
        const year = term ? term[1] : reversedTerm[2];
        const period = term ? term[2] : reversedTerm[1];
        semester = `${['PRIMERO','I'].includes(period) ? 'I' : ['SEGUNDO','II'].includes(period) ? 'II' : period}/${year}`;
      }
      else if (/^\s*20\d{2}\s+(VERANO|INVIERNO)\s*$/.test(line)) semester = '';
      // Solo la sigla al inicio de la fila identifica la materia. Una sigla
      // dentro de su nombre (LABORATORIO DE INF 111) no crea otro registro.
      const start = line.match(/^\s*(?:\d+\s+)?([A-Z]{2,4}\s*[- ]?\s*\d{3})\b\s*(.*)$/);
      if (start) {
        current = {code:canonicalCode(start[1]), text:start[2], semester};
        records.push(current);
      } else if (/^\s*(?:NRO\.|INSCRITAS|MATRICULAS|UNIVERSIDAD|HISTORIAL|PENSUM|20\d{2}\b)/.test(line)) {
        current = null;
      } else if (current && line.trim()) current.text += ` ${line.trim()}`;
    }
  }
  return records;
}

function recordMatchesName(record, name) {
  const expected = normalizeText(name);
  const tokens = courseTokens(expected);
  const actual = normalizeText(record.text).split(/\b(?:APROB|REPROB|CONV|ABANDONO)/)[0];
  const matched = tokens.filter(token => tokenPresent(actual,token)).length;
  if (tokens.length && matched < Math.max(1,Math.ceil(tokens.length * 0.6))) return false;
  // Diferencia, por ejemplo, Física I de Física II y Programación I de Web II.
  const numerals = expected.match(/\b(?:I|II|III|IV|V)\b/g) || [];
  return numerals.every(token => new RegExp(`\\b${token}\\b`).test(actual));
}

function detectApprovedCourses(records, rows) {
  return (rows || []).flatMap(row => {
    const record = records.find(record => record.code === canonicalCode(row.code)
      && approvalPattern.test(record.text) && !nonApprovalPattern.test(record.text)
      && recordMatchesName(record,row.name));
    return record ? [{...row, semester:record.semester}] : [];
  });
}

function detectOldCourses(text, rows) {
  return detectApprovedCourses(historyRecords(text), rows);
}

function parseHistoryText(text, rows, modernRows = []) {
  const records = historyRecords(text);
  return {...extractIdentity(text), courses:detectApprovedCourses(records, rows),
    modernCourses:detectApprovedCourses(records.filter(record => /^(?:I|II|VERANO|INVIERNO)\/202[34]$/.test(record.semester)),modernRows)};
}

function updateProgress(value, message) {
  if (!feedback) return;
  feedback.hidden = false;
  progress.value = Math.max(0, Math.min(100, Number(value) || 0));
  status.textContent = message;
}

function pdfItemsToText(items) {
  const lines = [];
  for (const item of items) {
    if (!item.str || !item.transform) continue;
    const x = item.transform[4], y = item.transform[5];
    const height = Math.abs(item.height || item.transform[3] || 10);
    let line = lines.find(line => Math.abs(line.y-y) <= Math.max(1, Math.min(line.height,height)*0.25));
    if (!line) { line = {y,height,items:[]}; lines.push(line); }
    line.items.push({x,width:item.width || 0,text:item.str});
  }
  return lines.sort((a,b)=>b.y-a.y).map(line => {
    const values = line.items.sort((a,b)=>a.x-b.x);
    return values.map((value,i) => {
      const previous = values[i-1];
      const gap = previous ? value.x-previous.x-previous.width : 0;
      return (i && gap > 1 && !/\s$/.test(previous.text) ? ' ' : '') + value.text;
    }).join('');
  }).join('\n');
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
    text += `${pageText}\n\f`;
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
    const pages = requestedPages?.length ? requestedPages : Array.from({length:pdf.numPages}, (_, index) => index + 1);
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
      text += `${response.data.text}\n\f`;
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
  const modernCourses = parsed.modernCourses || [];
  const courseList = courses.length ? `<ul>${courses.map((course) => `<li><b>${uppercaseClean(course.code)}</b> ${uppercaseClean(course.name)}</li>`).join("")}</ul>` : `<p class="reader-warning">No se reconocieron materias del plan antiguo. Puedes continuar marcándolas manualmente.</p>`;
  resultBox.innerHTML = `<strong>${courses.length} materia${courses.length === 1 ? "" : "s"} antigua${courses.length === 1 ? "" : "s"} marcada${courses.length === 1 ? "" : "s"}</strong>${identity.length ? `<p>${identity.join(" · ")}</p>` : ""}${courseList}${modernCourses.length ? `<p><b>${modernCourses.length} materias del plan 2023 ajustado reconocidas hasta el II/2024</b></p><ul>${modernCourses.map(course => `<li><b>${uppercaseClean(course.code)}</b> ${uppercaseClean(course.name)}</li>`).join("")}</ul>` : ""}<p>Puedes corregir cualquier dato o materia manualmente antes de generar el PDF.</p>`;
  resultBox.hidden = false;
  updateProgress(100, `Lectura terminada. Hay ${applied.selected} materias antiguas seleccionadas${modernCourses.length ? ` y ${modernCourses.length} materias del plan ajustado reconocidas` : ''}.`);
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
    try {
      // Un PDF con texto se lee directamente. La falta de CI/RU o de materias
      // aprobadas no convierte una página digital en una imagen para OCR.
      const scannedPages = loaded.pageTexts.map((pageText,index) => ({page:index+1,
        empty:normalizeText(pageText).replace(/\s/g,'').length < 20})).filter(page=>page.empty).map(page=>page.page);
      text = loaded.text;
      if (scannedPages.length) {
        updateProgress(30, 'Leyendo únicamente las páginas sin texto mediante OCR…');
        text += `\f${await ocrPdf(loaded.pdf, scannedPages)}`;
      }
    } finally {
      await loaded.pdf.destroy();
    }
  } else if (/^image\/(png|jpeg)$/.test(file.type)) {
    text = await ocrImage(file);
  } else {
    throw new Error("Selecciona un archivo PDF, PNG o JPG.");
  }
  const parsed = parseHistoryText(text, context.rows, context.modernRows);
  const applied = api.apply({name:parsed.name, ci:parsed.ci, ru:parsed.ru, rowIds:parsed.courses.map((course) => course.id), modernCourses:parsed.modernCourses});
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
  if (!globalThis.ConvalidationImportApi?.getContext()) {
    updateProgress(0, "Selecciona las menciones antes de iniciar la lectura.");
    updateReaderControls();
    return;
  }
  isReading = true;
  updateReaderControls();
  dropZone?.classList.remove("is-pending");
  dropZone?.classList.add("is-reading");
  dropZone?.setAttribute("aria-busy", "true");
  try {
    const completed = await handleFile(file);
    if (!completed) dropZone?.classList.add("is-pending");
  } catch (error) {
    console.error(error);
    updateProgress(0, "No se pudo leer el archivo. Puedes intentar de nuevo con Iniciar lectura o continuar manualmente.");
  } finally {
    isReading = false;
    updateReaderControls();
    dropZone?.classList.remove("is-reading", "is-dragover");
    dropZone?.removeAttribute("aria-busy");
    if (fileInput) fileInput.value = "";
  }
}

function updateReaderControls() {
  const ready = Boolean(globalThis.ConvalidationImportApi?.getContext());
  if (fileChip) fileChip.hidden = !pendingFile;
  if (readerActions) readerActions.hidden = !pendingFile;
  if (startReading) {
    startReading.disabled = isReading || !pendingFile || !ready;
    startReading.textContent = isReading ? 'Leyendo…' : 'Iniciar lectura';
  }
  if (removeFile) removeFile.disabled = isReading;
  if (fileInput) fileInput.disabled = isReading;
}

function selectHistoryFile(file) {
  if (!file || isReading) return;
  if (!isAcceptedFile(file)) {
    updateProgress(0, 'Formato no compatible. Usa un archivo PDF, PNG o JPG.');
    return;
  }
  pendingFile = file;
  if (fileName) { fileName.textContent = file.name; fileName.hidden = false; }
  if (resultBox) { resultBox.hidden = true; resultBox.innerHTML = ''; }
  dropZone?.classList.remove('is-pending', 'is-dragover');
  updateProgress(0, globalThis.ConvalidationImportApi?.getContext()
    ? 'Archivo listo. Pulsa Iniciar lectura.'
    : 'Archivo listo. Selecciona las menciones para iniciar la lectura automática.');
  updateReaderControls();
  if (fileInput) fileInput.value = '';
  if (globalThis.ConvalidationImportApi?.getContext()) processFile(pendingFile);
}

startReading?.addEventListener('click', () => processFile(pendingFile));
removeFile?.addEventListener('click', event => {
  event.preventDefault(); // Evita que el label abra el selector de archivos al quitarlo.
  event.stopPropagation();
  if (isReading) return;
  pendingFile = null;
  if (fileInput) fileInput.value = '';
  if (fileName) fileName.textContent = '';
  if (feedback) feedback.hidden = true;
  if (progress) progress.value = 0;
  if (status) status.textContent = '';
  if (resultBox) { resultBox.hidden = true; resultBox.innerHTML = ''; }
  dropZone?.classList.remove('is-pending', 'is-reading', 'is-dragover');
  updateReaderControls();
});

if (fileInput) fileInput.addEventListener('change', event => selectHistoryFile(event.target.files?.[0]));
if (typeof document !== 'undefined') {
  for (const selectId of ['oldMentionSelect', 'careerSelect']) {
    document.getElementById(selectId)?.addEventListener('change', () => queueMicrotask(() => {
      updateReaderControls();
      if (pendingFile && !isReading && progress?.value === 0 && globalThis.ConvalidationImportApi?.getContext()) { processFile(pendingFile); return; }
      if (pendingFile && !isReading && progress?.value === 0) updateProgress(0,
        globalThis.ConvalidationImportApi?.getContext() ? 'Archivo listo. Pulsa Iniciar lectura.' : 'Selecciona las menciones antes de iniciar la lectura.');
    }));
  }
}
updateReaderControls();

if (dropZone) {
  let dragDepth = 0;
  dropZone.addEventListener("keydown", (event) => {
    if (event.target !== dropZone) return;
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
    selectHistoryFile(event.dataTransfer?.files?.[0]);
  });
}

export {normalizeText, extractIdentity, detectOldCourses, parseHistoryText, pdfItemsToText};
