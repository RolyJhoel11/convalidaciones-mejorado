const DATA = window.CONVALIDATION_DATA;
const STORAGE_KEY = "convalidaciones-umsa-v1";
const $ = (id) => document.getElementById(id);
const OLD_MENTIONS = {
  sistemas_informaticos: "Ingeniería de Sistemas Informáticos",
  ciencias_computacion: "Ciencias de la Computación"
};

const state = { career: "", oldMention: "", name: "", ci: "", ru: "", selectedByCareer: {}, electiveChoices: {}, search: "" };
const selectedSet = () => state.career ? (state.selectedByCareer[state.career] || (state.selectedByCareer[state.career] = new Set())) : new Set();
const choiceMap = () => state.electiveChoices[state.career] || (state.electiveChoices[state.career] = {});
const isGenericElective = (row) => !row.finalCode && row.finalName.toLocaleLowerCase("es").startsWith("electiva del plan");
const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]);
const courseName = (value) => String(value || "").toLocaleUpperCase("es");
const originalDocumentTitle = document.title;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved) return;
    state.name = saved.name || "";
    state.ci = saved.ci || "";
    state.ru = saved.ru || "";
    state.oldMention = OLD_MENTIONS[saved.oldMention] ? saved.oldMention : "";
    if (saved.selectedByCareer) {
      for (const [career, ids] of Object.entries(saved.selectedByCareer)) state.selectedByCareer[career] = new Set(ids);
    } else if (Array.isArray(saved.selected) && DATA[saved.career]) {
      state.selectedByCareer[saved.career] = new Set(saved.selected);
    }
    if (saved.electiveChoices && typeof saved.electiveChoices === "object") state.electiveChoices = saved.electiveChoices;
  } catch (_) {}
}

let saveTimer;
function saveState() {
  clearTimeout(saveTimer);
  $("saveState").innerHTML = "<i></i> Guardando…";
  saveTimer = setTimeout(() => {
    const selectedByCareer = Object.fromEntries(Object.entries(state.selectedByCareer).map(([career, ids]) => [career, [...ids]]));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({career: state.career, oldMention: state.oldMention, name: state.name, ci: state.ci, ru: state.ru, selectedByCareer, electiveChoices:state.electiveChoices}));
    $("saveState").innerHTML = "<i></i> Guardado en este dispositivo";
  }, 180);
}

function groupKey(row, plan = "final") {
  const code = plan === "middle" ? row.middleCode : row.finalCode;
  const name = plan === "middle" ? row.middleName : row.finalName;
  if (!code && name.toLocaleLowerCase("es").startsWith("electiva del plan")) return `${plan}|electiva|${row.id}`;
  return `${code}|${name}`;
}

function requirements(row) {
  if (!row.finalName) return [];
  const key = groupKey(row);
  return DATA[state.career].rows.filter((item) => groupKey(item) === key);
}

function groupComplete(row) {
  if (isGenericElective(row)) return selectedSet().has(row.id) && Boolean(choiceMap()[row.id]);
  const required = requirements(row);
  return required.length > 0 && required.some((item) => selectedSet().has(item.id));
}

function selectedElective(row) {
  const code = choiceMap()[row.id];
  return DATA[state.career].electives.find((elective) => elective.finalCode === code) || null;
}

// Códigos de electivas que ya quedaron convalidadas por una materia normal (no electiva genérica).
// Se compara por el código del plan final, que es único; así no hay falsos positivos por
// nombres abreviados ni por códigos repetidos del plan 2023.
function convalidatedElectiveCodes() {
  const codes = new Set();
  if (!state.career || !DATA[state.career]) return codes;
  DATA[state.career].rows.forEach((row) => {
    if (!row.finalCode || !row.finalName || isGenericElective(row)) return;
    if (groupComplete(row)) codes.add(row.finalCode);
  });
  return codes;
}

// Quita las elecciones que ya no son válidas (la materia se desmarcó, o la electiva
// elegida pasó a estar convalidada por otra materia).
function pruneElectiveChoices() {
  if (!state.career || !DATA[state.career]) return;
  const taken = convalidatedElectiveCodes();
  const choices = choiceMap();
  const removed = [];
  Object.entries(choices).forEach(([rowId, code]) => {
    if (!selectedSet().has(rowId)) { delete choices[rowId]; return; }
    if (taken.has(code)) { removed.push(code); delete choices[rowId]; }
  });
  if (removed.length) {
    saveState();
    toast(`${removed.join(", ")} ya está convalidada por otra materia; elige otra electiva.`);
  }
}

function electiveCell(row, plan) {
  const chosen = selectedElective(row);
  if (plan === "middle") {
    const usedByAnother = new Set(Object.entries(choiceMap()).filter(([rowId]) => rowId !== row.id && selectedSet().has(rowId)).map(([, code]) => code));
    convalidatedElectiveCodes().forEach((code) => usedByAnother.add(code));
    const options = DATA[state.career].electives.map((elective) => `<option value="${escapeHtml(elective.finalCode)}" ${chosen?.finalCode === elective.finalCode ? "selected" : ""} ${usedByAnother.has(elective.finalCode) ? "disabled" : ""}>${escapeHtml(elective.finalCode)} · ${escapeHtml(courseName(elective.finalName))}</option>`).join("");
    return `<div class="cell cell-result ${chosen ? "ready" : "pending"}"><label class="elective-field"><span class="status-label">Electiva a convalidar</span><select class="elective-select" data-elective-id="${row.id}" aria-label="Elegir electiva para ${escapeHtml(row.oldCode)}"><option value="">Selecciona una materia electiva</option>${options}</select>${chosen ? `<span class="elective-preview"><b>${escapeHtml(chosen.middleCode)}</b> ${escapeHtml(courseName(chosen.middleName))}</span>` : ""}</label></div>`;
  }
  if (!chosen) return `<div class="cell cell-result pending"><span class="status-label">Elige la electiva en la columna 2023</span></div>`;
  return `<div class="cell cell-result ready"><div><span class="code">${escapeHtml(chosen.finalCode)}</span><span class="name">${escapeHtml(courseName(chosen.finalName))}</span></div></div>`;
}

function resultCell(row, plan) {
  if (!selectedSet().has(row.id)) return `<div class="cell cell-result"><span>—</span></div>`;
  if (!row.finalName) return `<div class="cell cell-result"><span class="status-label">Sin equivalencia directa</span></div>`;
  if (isGenericElective(row)) return electiveCell(row, plan);
  const required = requirements(row);
  const complete = groupComplete(row);
  if (!complete) {
    const missing = required.filter((item) => !selectedSet().has(item.id));
    const missingCount = missing.length === 1 ? "Te falta 1 materia:" : `Te faltan ${missing.length} materias:`;
    return `<div class="cell cell-result pending"><div><span class="status-label">${missingCount}</span><span class="name">${missing.map((m) => `${m.oldCode} ${courseName(m.oldName)}`).join(" · ")}</span></div></div>`;
  }
  const code = plan === "middle" ? row.middleCode : row.finalCode;
  const name = plan === "middle" ? row.middleName : row.finalName;
  return `<div class="cell cell-result ready"><div>${code ? `<span class="code">${code}</span>` : ""}<span class="name">${escapeHtml(courseName(name))}</span></div></div>`;
}

function render() {
  const hasCareer = Boolean(state.oldMention && state.career && DATA[state.career]);
  $("workspaceSection").hidden = !hasCareer;
  $("summarySection").hidden = !hasCareer;
  if (!hasCareer) {
    $("matrixRows").innerHTML = "";
    $("selectedCount").textContent = "0";
    $("validatedCount").textContent = "0";
    return;
  }
  pruneElectiveChoices();
  const rows = DATA[state.career].rows;
  const query = state.search.trim().toLocaleLowerCase("es");
  const filtered = rows.filter((row) => !query || `${row.oldCode} ${row.oldName} ${row.middleCode} ${row.middleName} ${row.finalCode} ${row.finalName}`.toLocaleLowerCase("es").includes(query));
  $("matrixRows").innerHTML = filtered.map((row) => `
    <div class="course-row" role="row">
      <label class="cell cell-source" role="cell">
        <input type="checkbox" data-id="${row.id}" ${selectedSet().has(row.id) ? "checked" : ""} aria-label="Marcar ${escapeHtml(row.oldCode)} ${escapeHtml(courseName(row.oldName))} como aprobada">
        <span><span class="code">${escapeHtml(row.oldCode)}</span><span class="name">${escapeHtml(courseName(row.oldName))}</span></span>
      </label>
      ${resultCell(row, "middle")}
      ${resultCell(row, "final")}
    </div>`).join("");
  $("emptyState").hidden = filtered.length > 0;
  $("selectedCount").textContent = selectedSet().size;
  const completed = new Set(rows.filter((row) => selectedSet().has(row.id) && groupComplete(row)).map((row) => groupKey(row)));
  $("validatedCount").textContent = completed.size;
}

function populateCareers() {
  $("oldMentionSelect").innerHTML = `<option value="" disabled>Selecciona tu mención del plan antiguo</option>` + Object.entries(OLD_MENTIONS).map(([slug, name]) => `<option value="${slug}">${name}</option>`).join("");
  $("oldMentionSelect").value = state.oldMention;
  $("careerSelect").innerHTML = `<option value="" disabled>Selecciona la mención a la que te transferiste</option>` + Object.entries(DATA).map(([slug, item]) => `<option value="${slug}">${item.name}</option>`).join("");
  $("careerSelect").value = state.career;
  $("careerSelect").disabled = !state.oldMention;
  $("studentName").value = state.name;
  $("studentCi").value = state.ci;
  $("studentRu").value = state.ru;
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2600);
}

function printSectionRank(section) {
  const match = String(section || "").match(/^(\d+)/);
  if (match) return Number(match[1]);
  if (String(section).toLocaleLowerCase("es").includes("electiva")) return 100;
  if (String(section).toLocaleLowerCase("es").includes("otra")) return 110;
  return 120;
}

function printSectionKey(section) {
  const rank = printSectionRank(section);
  if (rank < 100) return `semester-${rank}`;
  if (rank === 100) return "electives";
  if (rank === 110) return "other";
  return "without-equivalence";
}

function printSectionLabel(key) {
  if (key.startsWith("semester-")) return `${key.slice(9)}.º SEMESTRE`;
  if (key === "electives") return "ELECTIVAS DE LA MENCIÓN";
  if (key === "other") return "OTRAS EQUIVALENCIAS";
  return "SIN EQUIVALENCIA DIRECTA";
}

function printSectionKeyRank(key) {
  if (key.startsWith("semester-")) return Number(key.slice(9));
  if (key === "electives") return 100;
  if (key === "other") return 110;
  return 120;
}

function printCourseEntry(row, plan, originalOrder) {
  if (plan === "old") {
    return {type:"course", section:row.oldSection, order:originalOrder, code:row.oldCode, name:courseName(row.oldName), pendingClass:""};
  }
  const complete = groupComplete(row);
  let code = "";
  let name = "Sin equivalencia directa";
  let pendingClass = "";
  if (row.finalName && complete && isGenericElective(row)) {
    const chosen = selectedElective(row);
    code = plan === "middle" ? chosen.middleCode : chosen.finalCode;
    name = courseName(plan === "middle" ? chosen.middleName : chosen.finalName);
  } else if (row.finalName && complete) {
    code = plan === "middle" ? row.middleCode : row.finalCode;
    name = courseName(plan === "middle" ? row.middleName : row.finalName);
  } else if (row.finalName) {
    const missing = requirements(row).filter((required) => !selectedSet().has(required.id));
    const missingLabel = missing.map((required) => `${required.oldCode} ${courseName(required.oldName)}`).join(" / ");
    name = `Falta: ${missingLabel}`;
    pendingClass = "print-pending";
  }
  const section = isGenericElective(row) ? "Electivas de la mención" : (row[`${plan}Section`] || "Otras equivalencias");
  const order = isGenericElective(row) ? 10000 + originalOrder : Number(row[`${plan}Order`] || 11000);
  return {type:"course", section, order, code, name, pendingClass, originalOrder};
}

function printEquivalenceGroups(rows) {
  const highlightedKeys = new Set(DATA[state.career].rows.filter((row) => row.highlight && row.finalName).map((row) => groupKey(row)));
  const groups = new Map();
  rows.forEach((row, index) => {
    const key = row.finalName && !isGenericElective(row) ? groupKey(row) : `${row.id}|${row.finalName || "sin-equivalencia"}`;
    if (!groups.has(key)) groups.set(key, {oldEntries:[], firstOrder:index});
    const group = groups.get(key);
    group.oldEntries.push(printCourseEntry(row, "old", index));
    if (!group.middleEntry) {
      group.middleEntry = printCourseEntry(row, "middle", index);
      group.finalEntry = printCourseEntry(row, "final", index);
      group.middleSectionKey = printSectionKey(group.middleEntry.section);
      group.finalSectionKey = printSectionKey(group.finalEntry.section);
    }
  });
  groups.forEach((group, key) => {
    if (highlightedKeys.has(key) && !group.finalEntry.pendingClass) {
      group.middleEntry.highlightClass = "print-highlight";
      group.finalEntry.highlightClass = "print-highlight";
    }
  });
  return [...groups.values()].sort((a, b) =>
    printSectionKeyRank(a.middleSectionKey) - printSectionKeyRank(b.middleSectionKey) ||
    a.middleEntry.order - b.middleEntry.order ||
    printSectionKeyRank(a.finalSectionKey) - printSectionKeyRank(b.finalSectionKey) ||
    a.finalEntry.order - b.finalEntry.order ||
    a.firstOrder - b.firstOrder
  );
}

function printPlanCells(item) {
  if (!item) return `<td class="print-empty"></td><td class="print-empty"></td>`;
  if (item.skip) return "";
  const rowspan = item.rowspan > 1 ? ` rowspan="${item.rowspan}"` : "";
  const entry = item.entry || item;
  const highlight = entry.highlightClass ? ` ${entry.highlightClass}` : "";
  return `<td class="print-code ${entry.pendingClass}${highlight}"${rowspan}>${escapeHtml(entry.code)}</td><td class="${entry.pendingClass}${highlight}"${rowspan}>${escapeHtml(entry.name)}</td>`;
}

function buildPrintView() {
  if (!state.oldMention || !OLD_MENTIONS[state.oldMention]) {
    $("oldMentionSelect").focus();
    toast("Selecciona primero la mención del plan 1998.");
    return false;
  }
  if (!state.career || !DATA[state.career]) {
    $("careerSelect").focus();
    toast("Selecciona primero la mención de destino.");
    return false;
  }
  if (!state.name.trim()) {
    $("studentName").focus();
    toast("Escribe el nombre del estudiante antes de generar el PDF.");
    return false;
  }
  if (!state.ci.trim()) {
    $("studentCi").focus();
    toast("Escribe el CI del estudiante antes de generar el PDF.");
    return false;
  }
  if (!state.ru.trim()) {
    $("studentRu").focus();
    toast("Escribe el RU del estudiante antes de generar el PDF.");
    return false;
  }
  const selectedRows = DATA[state.career].rows.filter((row) => selectedSet().has(row.id));
  if (!selectedRows.length) {
    toast("Selecciona al menos una materia aprobada.");
    return false;
  }
  pruneElectiveChoices();
  const missingElective = selectedRows.find((row) => isGenericElective(row) && !selectedElective(row));
  if (missingElective) {
    toast(`Elige una electiva para ${missingElective.oldCode} antes de generar el PDF.`);
    document.querySelector(`[data-elective-id="${missingElective.id}"]`)?.focus();
    return false;
  }
  const electiveCodes = selectedRows.filter(isGenericElective).map((row) => selectedElective(row)?.finalCode).filter(Boolean);
  if (new Set(electiveCodes).size !== electiveCodes.length) {
    toast("Cada materia antigua debe usar una electiva diferente.");
    return false;
  }
  const groups = printEquivalenceGroups(selectedRows);
  const html = [];
  let printRowCount = 0;
  let activeMiddleSection = "";
  let activeFinalSection = "";
  for (const group of groups) {
    if (group.middleSectionKey !== activeMiddleSection || group.finalSectionKey !== activeFinalSection) {
      activeMiddleSection = group.middleSectionKey;
      activeFinalSection = group.finalSectionKey;
      html.push(`<tr><td colspan="2" class="print-empty"></td><td colspan="2" class="print-semester">${escapeHtml(printSectionLabel(activeMiddleSection))}</td><td colspan="2" class="print-semester">${escapeHtml(printSectionLabel(activeFinalSection))}</td></tr>`);
      printRowCount += 1;
    }
    const rowspan = group.oldEntries.length;
    group.oldEntries.forEach((oldEntry, index) => {
      const middleCell = index === 0 ? {entry:group.middleEntry, rowspan} : {skip:true};
      const finalCell = index === 0 ? {entry:group.finalEntry, rowspan} : {skip:true};
      html.push(`<tr>${printPlanCells({entry:oldEntry, rowspan:1})}${printPlanCells(middleCell)}${printPlanCells(finalCell)}</tr>`);
      printRowCount += 1;
    });
  }
  $("printRows").innerHTML = html.join("");
  $("printCount").textContent = new Set(selectedRows.filter((row) => groupComplete(row)).map((row) => groupKey(row))).size;
  $("printName").textContent = state.name.trim();
  $("printCi").textContent = state.ci.trim();
  $("printRu").textContent = state.ru.trim();
  $("printCareer").textContent = DATA[state.career].name;
  $("printDate").textContent = new Intl.DateTimeFormat("es-BO").format(new Date());
  $("printPlan1998").textContent = OLD_MENTIONS[state.oldMention];
  $("printPlan2023").textContent = DATA[state.career].name;
  $("printPlanAdjusted").textContent = DATA[state.career].name;
  $("printView").classList.toggle("dense", printRowCount > 42);
  const safeStudentName = state.name.trim().replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ");
  document.title = `${safeStudentName} - Materias convalidadas`;
  return true;
}

loadState();
populateCareers();
render();

$("toggleHistoryButton").addEventListener("click", () => {
  const reader = $("historyReader");
  const willOpen = reader.hidden;
  reader.hidden = !willOpen;
  $("toggleHistoryButton").setAttribute("aria-expanded", String(willOpen));
  $("toggleHistoryButton").textContent = willOpen ? "OCULTAR LECTOR DEL HISTORIAL" : "SUBIR HISTORIAL EN PDF (SI TIENE)";
  if (willOpen) $("historyDropZone").focus({preventScroll:true});
});

$("studentName").addEventListener("input", (event) => { state.name = event.target.value; saveState(); });
$("studentCi").addEventListener("input", (event) => { event.target.value = event.target.value.replace(/\D/g, ""); state.ci = event.target.value; saveState(); });
$("studentRu").addEventListener("input", (event) => { event.target.value = event.target.value.replace(/\D/g, ""); state.ru = event.target.value; saveState(); });
$("oldMentionSelect").addEventListener("change", (event) => {
  state.oldMention = event.target.value;
  $("careerSelect").disabled = false;
  saveState();
  render();
});
$("careerSelect").addEventListener("change", (event) => {
  state.career = event.target.value;
  saveState();
  render();
});
$("searchInput").addEventListener("input", (event) => { state.search = event.target.value; render(); });
$("matrixRows").addEventListener("change", (event) => {
  const elective = event.target.closest("select[data-elective-id]");
  if (elective) {
    elective.value ? choiceMap()[elective.dataset.electiveId] = elective.value : delete choiceMap()[elective.dataset.electiveId];
    saveState(); render(); return;
  }
  const input = event.target.closest("input[data-id]");
  if (!input) return;
  if (input.checked) selectedSet().add(input.dataset.id);
  else { selectedSet().delete(input.dataset.id); delete choiceMap()[input.dataset.id]; }
  saveState();
  render();
});
$("clearButton").addEventListener("click", () => {
  if (!selectedSet().size || confirm("¿Limpiar todas las materias seleccionadas de esta mención?")) {
    selectedSet().clear(); state.electiveChoices[state.career] = {}; saveState(); render();
  }
});
$("pdfButton").addEventListener("click", () => { if (buildPrintView()) setTimeout(() => window.print(), 50); });
window.addEventListener("afterprint", () => { document.title = originalDocumentTitle; });

window.ConvalidationImportApi = {
  getContext() {
    if (!state.oldMention || !state.career || !DATA[state.career]) return null;
    return {
      oldMention: state.oldMention,
      career: state.career,
      rows: DATA[state.career].rows.map((row) => ({id:row.id, code:row.oldCode, name:row.oldName}))
    };
  },
  apply({name, ci, ru, rowIds}) {
    if (name) state.name = String(name).trim().replace(/\s+/g, " ").toLocaleUpperCase("es");
    if (ci) state.ci = String(ci).replace(/\D/g, "");
    if (ru) state.ru = String(ru).replace(/\D/g, "");
    const validIds = new Set(DATA[state.career].rows.map((row) => row.id));
    for (const rowId of rowIds || []) if (validIds.has(rowId)) selectedSet().add(rowId);
    $("studentName").value = state.name;
    $("studentCi").value = state.ci;
    $("studentRu").value = state.ru;
    saveState();
    render();
    return {name:state.name, ci:state.ci, ru:state.ru, selected:selectedSet().size};
  }
};

function registerWebMcpTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const validCareers = Object.keys(DATA);
  const validOldMentions = Object.keys(OLD_MENTIONS);
  Promise.resolve(context.registerTool({
    name: "configure_student",
    title: "Configurar estudiante",
    description: "Guarda apellidos y nombres, CI y RU del estudiante y selecciona sus menciones de origen y destino.",
    inputSchema: {type:"object",properties:{name:{type:"string",minLength:1},ci:{type:"string",pattern:"^[0-9]+$"},ru:{type:"string",pattern:"^[0-9]+$"},oldMention:{type:"string",enum:validOldMentions},career:{type:"string",enum:validCareers}},required:["name","ci","ru","oldMention","career"],additionalProperties:false},
    annotations: {readOnlyHint:false,untrustedContentHint:false},
    execute(input) {
      if (!input || typeof input.name !== "string" || !input.name.trim() || !/^\d+$/.test(input.ci) || !/^\d+$/.test(input.ru) || !validOldMentions.includes(input.oldMention) || !validCareers.includes(input.career)) throw new Error("Nombre, CI, RU o menciones no válidos");
      state.name = input.name.trim(); state.ci = input.ci; state.ru = input.ru; state.oldMention = input.oldMention; state.career = input.career;
      $("studentName").value = state.name; $("studentCi").value = state.ci; $("studentRu").value = state.ru; $("oldMentionSelect").value = state.oldMention; $("careerSelect").disabled = false; $("careerSelect").value = state.career;
      saveState(); render();
      return {name:state.name,ci:state.ci,ru:state.ru,oldMention:state.oldMention,oldMentionName:OLD_MENTIONS[state.oldMention],career:state.career,careerName:DATA[state.career].name};
    }
  })).catch(()=>{});
  Promise.resolve(context.registerTool({
    name: "set_approved_courses",
    title: "Marcar materias aprobadas",
    description: "Reemplaza la selección de materias aprobadas del plan 1998 para la mención activa usando sus siglas.",
    inputSchema: {type:"object",properties:{courseCodes:{type:"array",items:{type:"string"},uniqueItems:true}},required:["courseCodes"],additionalProperties:false},
    annotations: {readOnlyHint:false,untrustedContentHint:false},
    execute(input) {
      if (!input || !Array.isArray(input.courseCodes)) throw new Error("courseCodes debe ser una lista");
      const wanted = new Set(input.courseCodes.map((code)=>String(code).trim().toUpperCase()));
      const rows = DATA[state.career].rows;
      const known = new Set(rows.map((row)=>row.oldCode));
      const unknown = [...wanted].filter((code)=>!known.has(code));
      if (unknown.length) throw new Error(`Siglas no encontradas: ${unknown.join(", ")}`);
      state.selectedByCareer[state.career] = new Set(rows.filter((row)=>wanted.has(row.oldCode)).map((row)=>row.id));
      state.electiveChoices[state.career] = Object.fromEntries(Object.entries(choiceMap()).filter(([rowId])=>selectedSet().has(rowId)));
      saveState(); render();
      return {career:state.career,selected:selectedSet().size,validated:Number($("validatedCount").textContent)};
    }
  })).catch(()=>{});
}

registerWebMcpTools();
