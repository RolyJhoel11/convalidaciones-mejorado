// Extensión de gestión 2023 y prioridad de las equivalencias de 64 horas.
(() => {
  const themeButton = $('themeToggle');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  let themePreference = null;
  try { themePreference = localStorage.getItem('convalidaciones-theme'); } catch (_) {}
  function applyTheme() {
    const dark = themePreference === 'dark' || (themePreference !== 'light' && systemTheme.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    themeButton.setAttribute('aria-label', dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    themeButton.title = dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
    themeButton.setAttribute('aria-pressed', String(dark));
    themeButton.innerHTML = dark
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15a8 8 0 0 1-11-11A8.5 8.5 0 1 0 20 15Z"/></svg>';
  }
  themeButton.addEventListener('click', () => {
    themePreference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('convalidaciones-theme', themePreference); } catch (_) {}
    applyTheme();
  });
  systemTheme.addEventListener('change', applyTheme);
  applyTheme();
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
  // La gestión corresponde a la aprobación en 2023, no a una convalidación de 1998.
  const SEMESTER_KEY = KEY + '-semestres';
  let semesterByCareer = {};
  try { semesterByCareer = JSON.parse(localStorage.getItem(SEMESTER_KEY) || '{}') || {}; } catch (_) {}
  const specialCodes = ['INF-111','INF-121','INF-131'];
  const specialTargets = {
    desarrollo:['INF-319','INF-325','INF-326'], sistemas:['INF-319','SIS-313','INF-326'],
    ia:['DAT-312','INF-325','INF-336'], redes:['TIC-311','TIC-312','TIC-316'],
    seguridad:['SEG-316','INF-325','SEG-317'], industrial:['INF-319','IID-313','IID-312'],
    computacion:['COM-323','COM-317','INF-336']
  };
  const semesters = Array.from({length:8},(_,i)=>[ `I/${2023+i}`, `II/${2023+i}` ]).flat();
  const eligible = value => ['I/2023','II/2023','I/2024','II/2024'].includes(value);
  const semesterValues = () => semesterByCareer[state.career] || (semesterByCareer[state.career] = {});
  function specialCourses() {
    return specialCodes.flatMap((code,index) => {
      if (!manual().has(code) || inheritedCodes().has(code) || !eligible(semesterValues()[code])) return [];
      const source = catalog().find(course => course.middleCode === code);
      const target = catalog().find(course => course.finalCode === specialTargets[state.career]?.[index]);
      return source && target ? [{...target, id:`64-${code}`, middleCode:source.middleCode,
        middleName:`${source.middleName} · 64 HORAS · ${semesterValues()[code]}`}]:[];
    });
  }
  const reservedElectives = () => new Set(specialCourses().map(course => course.finalCode));
  function reconcileOldSelections() {
    const reserved = reservedElectives();
    let changed = false;
    for (const row of DATA[state.career]?.rows || []) {
      if (!selectedSet().has(row.id)) continue;
      const target = isGenericElective(row) ? selectedElective(row) : row;
      if (!reserved.has(target?.finalCode)) continue;
      // Una electiva genérica conserva su materia de origen aprobada.
      // Solo se libera el destino elegido para que seleccione otra electiva.
      if (!isGenericElective(row)) selectedSet().delete(row.id);
      delete choiceMap()[row.id];
      changed = true;
    }
    if (changed) saveState();
    return reserved;
  }
  // También bloquea estos destinos en los menús de electivas del plan antiguo.
  const originalConvalidatedElectiveCodes = convalidatedElectiveCodes;
  convalidatedElectiveCodes = function() {
    return new Set([...originalConvalidatedElectiveCodes(), ...reservedElectives()]);
  };
  const approved = () => {
    const inherited = inheritedCodes();
    return [...catalog().filter(course => inherited.has(course.finalCode) || manual().has(course.id)), ...specialCourses()];
  };
  const matrix = document.querySelector('.matrix');
  const oldHeader = document.querySelector('.matrix-header.plan-old');
  const middleHeader = document.querySelector('.matrix-header.plan-mid');
  const middleHeaderHtml = middleHeader.innerHTML;
  const help = document.querySelector('.workspace-head .help');
  const originalHelp = help.textContent;
  const summary = document.querySelector('#summarySection p:not(.step)');
  const originalSummary = summary.textContent;
  const pdfMenu = document.createElement('div');
  pdfMenu.id = 'gestionPdfMenu';
  pdfMenu.className = 'gestion-pdf-menu';
  pdfMenu.hidden = true;
  pdfMenu.setAttribute('aria-label', 'Tipo de informe PDF');
  $('pdfButton').before(pdfMenu);
  $('pdfButton').setAttribute('aria-expanded', 'false');
  $('pdfButton').setAttribute('aria-controls', pdfMenu.id);
  function closePdfMenu() {
    pdfMenu.hidden = true;
    $('pdfButton').setAttribute('aria-expanded', 'false');
  }
  function updatePdfMenu() {
    pdfMenu.innerHTML = '<button type="button" data-report="old">1998 → 2023</button>' +
      (mode === '2023' ? '<button type="button" data-report="modern">2023 → 2023 ajustado</button><button type="button" data-report="final">Informe final</button>' : '');
  }
  function positionPdfMenu() {
    if (pdfMenu.hidden) return;
    const button = $('pdfButton').getBoundingClientRect();
    const width = pdfMenu.getBoundingClientRect().width;
    pdfMenu.style.left = `${Math.max(12, Math.min(button.right - width, window.innerWidth - width - 12))}px`;
    pdfMenu.style.right = 'auto';
    pdfMenu.style.bottom = `${window.innerHeight - button.top + 8}px`;
    pdfMenu.style.maxHeight = `${Math.max(100, button.top - 20)}px`;
  }
  window.addEventListener('resize', positionPdfMenu);
  $('pdfButton').addEventListener('click', event => {
    event.stopImmediatePropagation();
    updatePdfMenu();
    pdfMenu.hidden = !pdfMenu.hidden;
    $('pdfButton').setAttribute('aria-expanded', String(!pdfMenu.hidden));
    if (!pdfMenu.hidden) { positionPdfMenu(); pdfMenu.querySelector('button')?.focus(); }
  }, true);
  pdfMenu.addEventListener('click', event => {
    const button = event.target.closest('button[data-report]');
    if (!button) return;
    closePdfMenu();
    if (buildPrintView(button.dataset.report)) setTimeout(() => window.print(), 50);
  });
  document.addEventListener('click', event => {
    if (!pdfMenu.contains(event.target) && !$('pdfButton').contains(event.target)) closePdfMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !pdfMenu.hidden) {
      closePdfMenu(); $('pdfButton').focus();
    }
  });
  const nextButton = document.createElement('button');
  nextButton.id = 'gestionNextButton';
  nextButton.type = 'button';
  nextButton.className = 'ghost gestion-next-button';
  nextButton.textContent = 'Siguiente →';
  nextButton.setAttribute('aria-label', 'Siguiente: convalidación del plan 2023');
  nextButton.hidden = true;
  $('pdfButton').before(nextButton);
  function switchMode(nextMode) {
    closePdfMenu();
    mode = nextMode;
    state.search = ''; $('searchInput').value = '';
    render();
  }
  nextButton.addEventListener('click', () => switchMode(mode === '1998' ? '2023' : '1998'));
  const originalRender = render;
  render = function() {
    const reserved = reconcileOldSelections();
    originalRender();
    const modern = mode === '2023';
    nextButton.hidden = $('summarySection').hidden;
    nextButton.textContent = modern ? '← Atrás' : 'Siguiente →';
    nextButton.setAttribute('aria-label', modern ? 'Atrás: plan 1998' : 'Siguiente: plan 2023');
    matrix.classList.toggle('gestion-matrix', modern);
    oldHeader.hidden = modern;
    middleHeader.innerHTML = modern ? '<span>Plan de estudios</span><strong>2023</strong><small>Selecciona aquí</small>' : middleHeaderHtml;
    $('materias-title').textContent = modern ? 'Selecciona las materias aprobadas del plan 2023' : 'Selecciona solo en el plan 1998';
    help.textContent = modern ? 'Las materias convalidadas desde 1998 están marcadas y bloqueadas. Marca las demás materias que aprobaste en 2023.' : originalHelp;
    summary.textContent = modern ? 'Elige el informe del plan 2023 o el informe final con los tres planes.' : originalSummary;
    if ($('workspaceSection').hidden) return;
    if (!modern) {
      // La equivalencia obligatoria desde 2023 tiene prioridad sobre la antigua.
      for (const input of $('matrixRows').querySelectorAll('input[data-id]')) {
        const row = DATA[state.career].rows.find(item => item.id === input.dataset.id);
        if (row && reserved.has(row.finalCode)) {
          input.checked = false;
          input.disabled = true;
        }
      }
      return;
    }
    const inherited = inheritedCodes();
    const from64Hours = new Set(specialCourses().map(course => course.finalCode));
    const query = state.search.trim().toLocaleLowerCase('es');
    const filtered = catalog().filter(course => !query || `${course.middleCode} ${course.middleName} ${course.finalCode} ${course.finalName}`.toLocaleLowerCase('es').includes(query));
    $('matrixRows').innerHTML = filtered.map(course => {
      const from1998 = inherited.has(course.finalCode);
      const locked = from1998 || from64Hours.has(course.finalCode);
      const checked = locked || manual().has(course.id);
      return `<div class="course-row" role="row"><label class="cell cell-source ${locked ? 'gestion-locked' : ''}" role="cell"><input type="checkbox" data-gestion-id="${escapeHtml(course.id)}" ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''} aria-label="${escapeHtml(course.middleCode+' '+courseName(course.middleName))}${from1998 ? ', convalidada desde 1998' : ''}"><span><span class="code">${escapeHtml(course.middleCode)}</span><span class="name">${escapeHtml(courseName(course.middleName))}${from1998 ? ' · CONV. 1998' : ''}</span></span></label><div class="cell cell-result ${checked ? 'ready' : ''}" role="cell">${checked ? `<div><span class="code">${escapeHtml(course.finalCode)}</span><span class="name">${escapeHtml(courseName(course.finalName))}</span></div>` : '<span>—</span>'}</div></div>`;
    }).join('');
    for (const input of $('matrixRows').querySelectorAll('input[data-gestion-id]')) {
      if (!specialCodes.includes(input.dataset.gestionId) || input.disabled || !input.checked) continue;
      const code = input.dataset.gestionId;
      const holder = document.createElement('div');
      holder.className = 'gestion-semester';
      const target = catalog().find(course => course.finalCode === specialTargets[state.career]?.[specialCodes.indexOf(code)]);
      holder.innerHTML = `<label>Gestión de aprobación (obligatoria)<select required data-semester-code="${code}" aria-label="Gestión de aprobación de ${code}"><option value="">Selecciona la gestión</option>${semesters.map(value => `<option value="${value}" ${semesterValues()[code] === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>${eligible(semesterValues()[code]) && target ? `<small>64 horas: también convalida ${escapeHtml(target.finalCode)} ${escapeHtml(courseName(target.finalName))}</small>` : ''}`;
      input.closest('.cell').append(holder);

    }
    $('emptyState').hidden = filtered.length > 0;
    $('selectedCount').textContent = approved().length;
    $('validatedCount').textContent = new Set(approved().map(course => course.finalCode)).size;
  };
  $('matrixRows').addEventListener('change',event => {
    const select = event.target.closest('select[data-semester-code]');
    if (select) {
      event.stopImmediatePropagation();
      semesterValues()[select.dataset.semesterCode] = select.value;
      localStorage.setItem(SEMESTER_KEY, JSON.stringify(semesterByCareer));
      render(); return;
    }
    const oldInput = event.target.closest('input[data-id]');
    if (oldInput) {
      const row = DATA[state.career]?.rows.find(item => item.id === oldInput.dataset.id);
      if (row && reservedElectives().has(row.finalCode)) {
        event.stopImmediatePropagation();
        render();
      }
      return;
    }
    const input = event.target.closest('input[data-gestion-id]');
    if (!input) return;
    event.stopImmediatePropagation();
    const course = catalog().find(item => item.id === input.dataset.gestionId);
    if (!course || inheritedCodes().has(course.finalCode) || specialCourses().some(item => item.finalCode === course.finalCode)) { render(); return; }
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
      const suffix = inherited.has(course.finalCode) ? ' · CONV. 1998' : '';
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
  function goToChoice(nextMode, selector) {
    switchMode(nextMode); // Limpia la búsqueda para que la materia pendiente sea visible.
    const select = $('matrixRows').querySelector(selector);
    if (!select) return;
    select.focus({preventScroll:true});
    select.scrollIntoView({behavior:'smooth', block:'center', inline:'nearest'});
  }
  buildPrintView = function(report = mode === '1998' ? 'old' : 'modern') {
    // Cada tipo de informe mantiene su contenido aunque cambie la pantalla.
    if (typeof report === 'boolean') report = report ? 'final' : (mode === '1998' ? 'old' : 'modern');
    const includeOld = report === 'final';
    if (report === 'old') {
      const pending = DATA[state.career]?.rows.find(row => selectedSet().has(row.id) && isGenericElective(row) && !selectedElective(row));
      if (pending) {
        goToChoice('1998', `[data-elective-id="${pending.id}"]`);
        toast(`Elige una electiva para ${pending.oldCode} antes de generar el PDF.`);
        return false;
      }
      $('printView').classList.toggle('gestion-print', false);
      printTable.querySelector('colgroup').innerHTML = originalColgroup;
      printTable.querySelector('thead').innerHTML = originalThead;
      printSubtitle.textContent = originalSubtitle;
      return originalBuildPrintView();
    }
    // Validación compartida: tampoco permite saltarse la gestión desde el PDF antiguo.
    const missing = specialCodes.find(code => manual().has(code) && !inheritedCodes().has(code) && !semesters.includes(semesterValues()[code]));
    if (missing) {
      goToChoice('2023', `[data-semester-code="${missing}"]`);
      toast(`Selecciona obligatoriamente la gestión de aprobación de ${missing}.`);
      return false;
    }
    reconcileOldSelections();
    // Todos los botones de PDF llevan a la primera elección pendiente del plan antiguo.
    const pending = DATA[state.career]?.rows.find(row => selectedSet().has(row.id) && isGenericElective(row) && !selectedElective(row));
    if (pending) {
      goToChoice('1998', `[data-elective-id="${pending.id}"]`);
      toast(`Elige una electiva para ${pending.oldCode} antes de generar el PDF.`);
      return false;
    }
    $('printView').classList.toggle('gestion-print', !includeOld);
    if (!state.career || !DATA[state.career]) { toast('Selecciona la mención de destino.'); return false; }
    for (const [field,id,message] of [['name','studentName','nombre'],['ci','studentCi','CI'],['ru','studentRu','RU']]) {
      if (!state[field].trim()) { $(id).focus(); toast(`Escribe el ${message} del estudiante antes de generar el PDF.`); return false; }
    }
    if (includeOld) {
      if (!state.oldMention || !OLD_MENTIONS[state.oldMention]) { toast('Selecciona la mención del plan 1998.'); return false; }
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
        rows.push(`<tr>${includeOld ? '<td colspan="2" class="print-empty"></td>' : ''}<td colspan="2" class="print-semester">${label}</td><td colspan="2" class="print-semester">${label}</td></tr>`);
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
