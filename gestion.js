// Extensión independiente: no altera las reglas ni los datos del flujo 1998.
(() => {
  const KEY = 'convalidaciones-umsa-gestion-2023-v1';
  let mode = '1998';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) {}
  const manualByCareer = Object.fromEntries(Object.entries(saved).filter(([,ids]) => Array.isArray(ids)).map(([career,ids]) => [career,new Set(ids)]));
  const manual = () => manualByCareer[state.career] || (manualByCareer[state.career] = new Set());
  const persist = () => localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(Object.entries(manualByCareer).map(([career,ids]) => [career,[...ids]]))));
  const catalog = () => window.GESTION_2023_DATA[state.career] || [];
  function inheritedCodes() {
    const codes = new Set();
    for (const row of DATA[state.career]?.rows || []) {
      if (!selectedSet().has(row.id) || !groupComplete(row)) continue;
      const target = isGenericElective(row) ? selectedElective(row) : row;
      if (target?.finalCode) codes.add(target.finalCode);
    }
    return codes;
  }
  const approved = () => {
    const inherited = inheritedCodes();
    return catalog().filter(course => inherited.has(course.finalCode) || manual().has(course.id));
  };
  const matrix = document.querySelector('.matrix');
  const oldHeader = document.querySelector('.matrix-header.plan-old');
  const middleHeader = document.querySelector('.matrix-header.plan-mid');
  const middleHeaderHtml = middleHeader.innerHTML;
  const help = document.querySelector('.workspace-head .help');
  const originalHelp = help.textContent;
  const summary = document.querySelector('#summarySection p:not(.step)');
  const originalSummary = summary.textContent;
  const tabs = document.createElement('div');
  tabs.className = 'gestion-tabs';
  tabs.setAttribute('role','group');
  tabs.setAttribute('aria-label','Gestión de convalidación');
  tabs.innerHTML = '<button type="button" data-gestion="1998" aria-pressed="true">Gestión 1998</button><button type="button" data-gestion="2023" aria-pressed="false">Gestión 2023 - 2025</button>';
  $('materias-title').before(tabs);
  const finalPdfButton = document.createElement('button');
  finalPdfButton.id = 'finalPdfButton';
  finalPdfButton.type = 'button';
  finalPdfButton.className = 'ghost gestion-final-button';
  finalPdfButton.textContent = 'Generar final (3 columnas)';
  finalPdfButton.hidden = true;
  $('pdfButton').before(finalPdfButton);
  finalPdfButton.addEventListener('click', () => { if (buildPrintView(true)) setTimeout(() => window.print(), 50); });
  const originalRender = render;
  render = function() {
    originalRender();
    const modern = mode === '2023';
    finalPdfButton.hidden = !modern || $('summarySection').hidden;
    matrix.classList.toggle('gestion-matrix', modern);
    oldHeader.hidden = modern;
    middleHeader.innerHTML = modern ? '<span>Plan de estudios</span><strong>2023</strong><small>Selecciona aquí</small>' : middleHeaderHtml;
    $('materias-title').textContent = modern ? 'Selecciona las materias aprobadas del plan 2023' : 'Selecciona solo en el plan 1998';
    help.textContent = modern ? 'Las materias convalidadas desde 1998 están marcadas y bloqueadas. Marca las demás materias que aprobaste en 2023.' : originalHelp;
    summary.textContent = modern ? 'Generar PDF: 2023 y ajustado. Generar final: 1998, 2023 y ajustado, incluyendo las materias heredadas y las nuevas aprobadas.' : originalSummary;
    tabs.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.gestion === mode)));
    if (!modern || $('workspaceSection').hidden) return;
    const inherited = inheritedCodes();
    const query = state.search.trim().toLocaleLowerCase('es');
    const filtered = catalog().filter(course => !query || `${course.middleCode} ${course.middleName} ${course.finalCode} ${course.finalName}`.toLocaleLowerCase('es').includes(query));
    $('matrixRows').innerHTML = filtered.map(course => {
      const locked = inherited.has(course.finalCode);
      const checked = locked || manual().has(course.id);
      return `<div class="course-row" role="row"><label class="cell cell-source ${locked ? 'gestion-locked' : ''}" role="cell"><input type="checkbox" data-gestion-id="${escapeHtml(course.id)}" ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''} aria-label="${escapeHtml(course.middleCode+' '+courseName(course.middleName))}${locked ? ', convalidada desde 1998' : ''}"><span><span class="code">${escapeHtml(course.middleCode)}</span><span class="name">${escapeHtml(courseName(course.middleName))}${locked ? ' · CONV. 1998' : ''}</span></span></label><div class="cell cell-result ${checked ? 'ready' : ''}" role="cell">${checked ? `<div><span class="code">${escapeHtml(course.finalCode)}</span><span class="name">${escapeHtml(courseName(course.finalName))}</span></div>` : '<span>—</span>'}</div></div>`;
    }).join('');
    $('emptyState').hidden = filtered.length > 0;
    $('selectedCount').textContent = approved().length;
    $('validatedCount').textContent = new Set(approved().map(course => course.finalCode)).size;
  };
  tabs.addEventListener('click',event => {
    const button = event.target.closest('button[data-gestion]');
    if (!button) return;
    mode = button.dataset.gestion;
    state.search = ''; $('searchInput').value = '';
    render();
  });
  $('matrixRows').addEventListener('change',event => {
    const input = event.target.closest('input[data-gestion-id]');
    if (!input) return;
    event.stopImmediatePropagation();
    const course = catalog().find(item => item.id === input.dataset.gestionId);
    if (!course || inheritedCodes().has(course.finalCode)) { render(); return; }
    input.checked ? manual().add(course.id) : manual().delete(course.id);
    persist(); render();
  },true);
  $('clearButton').addEventListener('click',event => {
    if (mode !== '2023') return;
    event.stopImmediatePropagation();
    if (!manual().size || confirm('¿Limpiar las materias marcadas en 2023? Las convalidadas desde 1998 se conservarán.')) {
      manual().clear(); persist(); render();
    }
  },true);
  const printTable = document.querySelector('#printView table');
  const originalColgroup = printTable.querySelector('colgroup').innerHTML;
  const originalThead = printTable.querySelector('thead').innerHTML;
  const printSubtitle = document.querySelector('.print-header div > p:last-child');
  const originalSubtitle = printSubtitle.textContent;
  const originalBuildPrintView = buildPrintView;
  // One group per adjusted course keeps all source subjects on its own row(s).
  function alignedGroups(courses, inherited, includeOld) {
    const groups = new Map();
    for (const course of courses) {
      if (!groups.has(course.finalCode)) groups.set(course.finalCode, {course, middle:[], old:[]});
      const suffix = inherited.has(course.finalCode) ? ' · CONV. 1998' : (includeOld ? ' · APROB. 2023' : '');
      groups.get(course.finalCode).middle.push({code:course.middleCode, name:courseName(course.middleName)+suffix, pendingClass:''});
    }
    const unmatched = [];
    if (includeOld) {
      for (const row of DATA[state.career].rows) {
        if (!selectedSet().has(row.id)) continue;
        const target = isGenericElective(row) ? selectedElective(row) : row;
        const entry = {code:row.oldCode, name:courseName(row.oldName), pendingClass:''};
        const group = groups.get(target?.finalCode);
        if (group) group.old.push(entry);
        else unmatched.push(entry);
      }
    }
    const ordered = [...groups.values()].sort((a,b) => printSectionRank(a.course.finalSection)-printSectionRank(b.course.finalSection) || a.course.finalOrder-b.course.finalOrder || a.course.finalCode.localeCompare(b.course.finalCode));
    return {ordered,unmatched};
  }
  // Merge a single result across all sources, without duplicating a destination.
  function alignedCells(entries, index, height) {
    if (!entries.length) return index === 0 ? printPlanCells({entry:{code:'',name:'',pendingClass:''},rowspan:height}) : '';
    if (index >= entries.length) return '';
    const rowspan = index === entries.length - 1 ? height - entries.length + 1 : 1;
    return printPlanCells({entry:entries[index],rowspan});
  }
  buildPrintView = function(includeOld = false) {
    $('printView').classList.toggle('gestion-print',mode === '2023' && !includeOld);
    if (mode !== '2023') {
      printTable.querySelector('colgroup').innerHTML = originalColgroup;
      printTable.querySelector('thead').innerHTML = originalThead;
      printSubtitle.textContent = originalSubtitle;
      return originalBuildPrintView();
    }
    if (!state.career || !DATA[state.career]) { toast('Selecciona la mención de destino.'); return false; }
    for (const [field,id,message] of [['name','studentName','nombre'],['ci','studentCi','CI'],['ru','studentRu','RU']]) {
      if (!state[field].trim()) { $(id).focus(); toast(`Escribe el ${message} del estudiante antes de generar el PDF.`); return false; }
    }
    if (includeOld) {
      if (!state.oldMention || !OLD_MENTIONS[state.oldMention]) { toast('Selecciona la mención del plan 1998.'); return false; }
      const pending = DATA[state.career].rows.find(row => selectedSet().has(row.id) && isGenericElective(row) && !selectedElective(row));
      if (pending) { toast(`Elige una electiva para ${pending.oldCode} en Gestión 1998 antes de generar el final.`); return false; }
    }
    const courses = approved();
    if (!courses.length) { toast('Selecciona al menos una materia aprobada.'); return false; }
    const mention = escapeHtml(DATA[state.career].name);
    printTable.querySelector('colgroup').innerHTML = '<col class="code-col"><col class="name-col">'.repeat(includeOld ? 3 : 2);
    const oldTitle = includeOld ? `<th colspan="2">PÉNSUM 1998<br><span>MENCIÓN <b>${escapeHtml(OLD_MENTIONS[state.oldMention])}</b></span><br><span>NIVEL LICENCIATURA</span></th>` : '';
    printTable.querySelector('thead').innerHTML = `<tr class="plan-title-row">${oldTitle}<th colspan="2">PÉNSUM 2023<br><span>MENCIÓN <b>${mention}</b></span><br><span>NIVEL LICENCIATURA</span></th><th colspan="2">PÉNSUM 2023 AJUSTADO<br><span>MENCIÓN <b>${mention}</b></span><br><span>NIVEL LICENCIATURA</span></th></tr><tr class="column-title-row">${'<th>SIGLA</th><th>ASIGNATURA</th>'.repeat(includeOld ? 3 : 2)}</tr>`;
    const inherited = inheritedCodes();
    const {ordered,unmatched} = alignedGroups(courses,inherited,includeOld);
    const rows = [];
    let previous = '';
    for (const group of ordered) {
      const section = printSectionKey(group.course.finalSection);
      if (section !== previous) {
        const label = escapeHtml(printSectionLabel(section));
        rows.push(`<tr>${includeOld ? '<td colspan="2" class="print-empty"></td>' : ''}<td colspan="2" class="print-semester">${label} (ORDEN AJUSTADO)</td><td colspan="2" class="print-semester">${label}</td></tr>`);
        previous = section;
      }
      const height = Math.max(group.middle.length,includeOld ? group.old.length : 0,1);
      const origin = inherited.has(group.course.finalCode) ? ' · CONV. 1998' : ' · CONV. 2023';
      const target = {code:group.course.finalCode,name:courseName(group.course.finalName)+(includeOld ? origin : ''),pendingClass:''};
      for (let index=0; index<height; index++) {
        rows.push(`<tr>${includeOld ? alignedCells(group.old,index,height) : ''}${alignedCells(group.middle,index,height)}${alignedCells([target],index,height)}</tr>`);
      }
    }
    if (unmatched.length) {
      rows.push('<tr><td colspan="2" class="print-semester">SIN EQUIVALENCIA DIRECTA</td><td colspan="4" class="print-empty"></td></tr>');
      unmatched.forEach(entry => rows.push(`<tr>${printPlanCells(entry)}${printPlanCells(null)}${printPlanCells(null)}</tr>`));
    }
    $('printRows').innerHTML = rows.join('');
    printSubtitle.textContent = includeOld ? 'FINAL · Plan 1998 - Plan 2023 - Plan 2023 ajustado · CONV. 1998 / CONV. 2023' : 'Gestión 2023 - 2025 · Materias alineadas según el plan 2023 ajustado';
    $('printName').textContent = state.name.trim(); $('printCi').textContent = state.ci.trim(); $('printRu').textContent = state.ru.trim();
    $('printCareer').textContent = DATA[state.career].name;
    $('printDate').textContent = new Intl.DateTimeFormat('es-BO').format(new Date());
    $('printCount').textContent = new Set(courses.map(course => course.finalCode)).size;
    $('printView').classList.toggle('dense',rows.length>42);
    document.title = `${state.name.trim().replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ')} - ${includeOld ? 'Convalidación final 1998 - 2023 - ajustado' : 'Materias convalidadas 2023 - 2025'}`;
    return true;
  };
  render();
})();
