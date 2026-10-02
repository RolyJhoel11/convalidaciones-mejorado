import json
import re
import unicodedata
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "work" / "matrices"
ADJUSTED_SOURCE = ROOT / "work" / "adjusted"
OUTPUT = Path(__file__).resolve().parents[1] / "data.js"

FILES = {
    "desarrollo": ("Desarrollo de Software e Innovación Tecnológica", "COMISION MATRIZ CONV Y COMP DE 1998 A DESARROLLO DE SOFTWARE.xlsx"),
    "sistemas": ("Ingeniería de Sistemas", "COMISION MATRIZ CONV Y COMP DE 1998 A INGENIERIA.xlsx"),
    "computacion": ("Ciencias de la Computación", "CONVALIDACION RESOLUCION - Ciencias de la Computacion.xlsx"),
    "ia": ("Inteligencia Artificial y Ciencia de Datos", "COMISION MATRIZ CONV Y COMP DE 1998 A IA.xlsx"),
    "seguridad": ("Seguridad de la Información", "COMISION MATRIZ CONV Y COMP DE 1998 A SEGURIDAD.xlsx"),
    "redes": ("Redes y Tecnologías de la Información y Comunicación", "COMISION MATRIZ CONV Y COMP DE 1998 A REDES.xlsx"),
    "industrial": ("Informática Industrial", "COMISION CONVALIDACION INF INDUSTRIAL.xlsx"),
}

ADJUSTED_FILES = {
    "desarrollo": "DESARROLLO_DE_SOFTWARE_E_INNOVACION_TECNOLOGICA.xlsx",
    "sistemas": "INGENIERIA_DE_SISTEMAS.xlsx",
    "computacion": "CIENCIAS DE LA COMPUTACION.xlsx",
    "ia": "INTELIGENCIA_ARTIFICIAL_Y_CIENCIA_DE_DATOS.xlsx",
    "seguridad": "SEGURIDAD_DE_LA_INFORMACIÓN.xlsx",
    "redes": "REDES_Y_TECNOLOGIAS_DE_LA_INFORMACION_Y_COMUNICACION_TIC.xlsx",
    "industrial": "INFORMÁTICA INDUSTRIAL.xlsx",
}

# Cambios de sigla identificados al contrastar malla2023.pdf con los planes 2023 ajustados.
# Los cursos que no aparecen aquí conservaron su sigla entre ambos planes.
OVERRIDES = {
    "desarrollo": {
        "INF-251":"INF-254","INF-254":"INF-251","INF-261":"INF-262","INF-262":"INF-261",
        "INF-311":"INF-312","INF-312":"INF-313","INF-313":"INF-311","INF-314":"INF-334",
        "INF-315":"INF-317","INF-316":"INF-314","INF-317":"INF-315","INF-318":"INF-331",
        "INF-320":"INF-316","INF-323":"INF-318","INF-324":"INF-319","INF-325":"INF-323",
        "INF-327":"INF-333","INF-328":"INF-324","INF-329":"INF-325","INF-331":"INF-328",
        "INF-332":"INF-329","INF-333":"INF-330","INF-334":"INF-332",
    },
    "sistemas": {
        "INF-241":"SIS-241","INF-242":"SIS-242","INF-243":"SIS-243","INF-244":"SIS-245",
        "SIS-245":"SIS-244","INF-251":"SIS-252","INF-261":"SIS-264","SEG-252":"SIS-251",
        "COM-254":"SIS-254","INF-264":"SIS-265","INF-265":"SIS-261","INF-381":"SIS-381",
        "SIS-382":"SIS-382","INF-311":"SIS-311","INF-312":"SIS-313","SIS-313":"SIS-320",
        "INF-314":"SIS-316","SIS-315":"SIS-321","INF-316":"SIS-314","INF-317":"SIS-315",
        "SIS-318":"SIS-322","INF-319":"SIS-317","SIS-320":"SIS-323","INF-321":"SIS-318",
        "INF-322":"SIS-319","INF-323":"SIS-325","SIS-324":"SIS-324","SIS-325":"SIS-329",
        "INF-326":"SIS-328","INF-327":"SIS-326","INF-335":"SIS-312","INF-336":"SIS-327",
    },
    "computacion": {
        "INF-241":"COM-242","INF-242":"COM-243","INF-243":"COM-244","COM-244":"COM-241",
        "INF-247":"COM-246","INF-251":"COM-251","INF-265":"COM-264","INF-384":"COM-383",
        "INF-333":"COM-319","COM-320":"COM-326","COM-321":"COM-322","INF-314":"COM-325",
        "COM-322":"COM-323","INF-315":"COM-314","COM-323":"COM-324","INF-324":"COM-315",
        "COM-317":"COM-318","INF-331":"COM-321","INF-318":"COM-320","INF-336":"COM-317",
    },
    "ia": {
        "DAT-242":"DAT-243","INF-243":"DAT-244","INF-244":"DAT-242","DAT-371":"DAT-372",
        "SIS-372":"DAT-371","INF-384":"DAT-383","DAT-318":"DAT-315","DAT-319":"DAT-321",
        "INF-320":"DAT-318","INF-314":"DAT-324","DAT-321":"DAT-322","INF-315":"DAT-319",
        "INF-325":"DAT-314","INF-316":"DAT-316","INF-336":"DAT-320","INF-317":"DAT-317",
        "INF-337":"DAT-323",
    },
    "seguridad": {
        "INF-241":"SEG-241","INF-242":"SEG-242","INF-243":"SEG-243","SEG-244":"SEG-245",
        "INF-245":"SEG-244","INF-251":"SEG-251","SIS-382":"SEG-383","SEG-383":"SEG-382",
        "INF-384":"SEG-384","SEG-311":"SEG-313","SEG-312":"SEG-314","SEG-313":"SEG-315",
        "INF-323":"SEG-312","INF-314":"SEG-321","INF-325":"SEG-320","INF-315":"SEG-316",
        "INF-335":"SEG-311","SEG-316":"SEG-317","SEG-317":"SEG-318","SEG-318":"SEG-319",
    },
    "redes": {
        "INF-241":"TIC-243","INF-243":"TIC-245","INF-244":"TIC-244","INF-245":"TIC-242",
        "TIC-246":"TIC-241","TIC-261":"TIC-261","COM-252":"TIC-252","INF-265":"TIC-264",
        "INF-384":"TIC-384","TIC-311":"TIC-311","INF-318":"TIC-317","TIC-312":"TIC-312",
        "TIC-319":"TIC-319","TIC-313":"TIC-313","INF-320":"TIC-315","INF-314":"TIC-324",
        "INF-321":"TIC-318","INF-315":"TIC-323","TIC-322":"TIC-322","TIC-316":"TIC-316",
        "TIC-323":"TIC-323","INF-317":"TIC-317","INF-337":"TIC-320",
    },
    "industrial": {
        "INF-241":"IID-241","INF-242":"IID-242","INF-243":"IID-243","INF-244":"IID-245",
        "INF-245":"IID-244","IID-247":"IID-247","IID-264":"IID-264","INF-384":"IID-383",
        "IID-311":"IID-311","IID-317":"IID-319","IID-312":"IID-314","INF-318":"IID-315",
        "IID-313":"IID-316","INF-319":"IID-320","INF-314":"IID-312","IID-320":"IID-321",
        "INF-315":"IID-313","INF-335":"IID-318","IID-316":"IID-317",
    },
}

# Corrección detectada al validar las matrices contra el plan ajustado oficial.
FINAL_CORRECTIONS = {
    ("ia", "EST-133"): ("INF-124", "Estadística I"),
    ("seguridad", "EST-145"): ("INF-134", "Estadística II"),
}

def clean_code(value):
    if not value:
        return ""
    code = str(value).upper().strip().replace(".", "-")
    code = re.sub(r"\s+", "", code)
    code = re.sub(r"^([A-Z]+)(\d{3})$", r"\1-\2", code)
    return code

def clean_text(value):
    return re.sub(r"\s+", " ", str(value or "").strip())

def key_text(value):
    value = unicodedata.normalize("NFD", clean_text(value).upper())
    return "".join(ch for ch in value if unicodedata.category(ch) != "Mn")

def semester_label(value):
    normalized = key_text(value)
    if "SEMESTRE" not in normalized:
        return ""
    words = {
        "PRIMER": 1, "SEGUNDO": 2, "TERCER": 3, "CUARTO": 4, "QUINTO": 5,
        "SEXTO": 6, "SEPTIMO": 7, "OCTAVO": 8, "NOVENO": 9,
    }
    for word, number in words.items():
        if word in normalized:
            return f"{number}.º semestre"
    return ""

def build_plan_catalog(slug):
    """Obtiene el semestre y el orden oficial de cada materia del plan ajustado."""
    ws = openpyxl.load_workbook(ADJUSTED_SOURCE / ADJUSTED_FILES[slug], data_only=True, read_only=True).active
    current = {0: "", 6: ""}
    catalog = {}
    order = 0
    in_elective_catalog = False
    for values in ws.iter_rows(values_only=True):
        joined = key_text(" ".join(clean_text(value) for value in values if value is not None))
        if "ELECTIVAS MENCION" in joined:
            in_elective_catalog = True
            continue
        if in_elective_catalog and "RESOLUCION" in joined:
            break
        if in_elective_catalog:
            for column in (0, 6):
                code = clean_code(values[column] if len(values) > column else "")
                if not re.fullmatch(r"[A-Z]{2,4}-\d{3}", code):
                    continue
                order += 1
                catalog.setdefault(code, {"section": "Electivas de la mención", "order": 10000 + order})
            continue
        for column in (0, 6):
            heading = semester_label(values[column] if len(values) > column else "")
            if heading:
                current[column] = heading
        for column in (0, 6):
            code = clean_code(values[column] if len(values) > column else "")
            if not re.fullmatch(r"[A-Z]{2,4}-\d{3}", code) or not current[column]:
                continue
            order += 1
            catalog.setdefault(code, {"section": current[column], "order": order})
    return catalog

def build_middle_plan_meta(code, final_meta=None):
    """Ubica una sigla del pénsum 2023 en su semestre real.

    La numeración oficial del plan 2023 identifica el semestre: 11x, 12x,
    13x, 24x, 25x, 26x, 37x, 38x y 39x. Las siglas 31x-33x pertenecen al
    catálogo de electivas de cada mención.
    """
    final_section = (final_meta or {}).get("section", "")
    if "ELECTIVA" in key_text(final_section):
        return {"section": "Electivas de la mención", "order": 10000}
    if not code:
        return {"section": "Sin equivalencia directa", "order": 12000}
    match = re.search(r"(\d{3})$", code)
    if not match:
        return {"section": "Otras equivalencias", "order": 11000}
    number = int(match.group(1))
    ranges = (
        (110, 120, 1), (120, 130, 2), (130, 140, 3),
        (240, 250, 4), (250, 260, 5), (260, 270, 6),
        (370, 380, 7), (380, 390, 8), (390, 400, 9),
    )
    for lower, upper, semester in ranges:
        if lower <= number < upper:
            return {"section": f"{semester}.º semestre", "order": semester * 1000 + number}
    return {"section": "Electivas de la mención", "order": 10000 + number}

def highlighted_rows(filename):
    """Filas de la matriz cuya materia nueva está marcada en rojo (texto) o en amarillo (relleno).

    Las filas cuya materia nueva es solo "ELECTIVA" se ignoran. Se usa en el PDF
    para resaltar en amarillo el recuadro de esas materias.
    """
    ws = openpyxl.load_workbook(SOURCE / filename).active
    def is_red(cell):
        color = cell.font.color
        return color is not None and color.type == "rgb" and color.rgb == "FFFF0000"
    def is_yellow(cell):
        fill = cell.fill
        return bool(fill and fill.fill_type and fill.fgColor.type == "rgb" and fill.fgColor.rgb == "FFFFFF00")
    marked = set()
    for row in ws.iter_rows():
        if len(row) < 4 or row[3].value is None or key_text(row[3].value) == "ELECTIVA":
            continue
        if any(is_red(cell) or is_yellow(cell) for cell in (row[2], row[3])):
            marked.add(row[0].row)
    return marked

def build_rows(slug, filename):
    ws = openpyxl.load_workbook(SOURCE / filename, data_only=True, read_only=True).active
    highlighted = highlighted_rows(filename)
    plan_catalog = build_plan_catalog(slug)
    rows = []
    in_old_electives = False
    for idx, values in enumerate(ws.iter_rows(values_only=True), 1):
        row_text = " ".join(clean_text(value) for value in values if value is not None)
        if "ELECTIVA" in key_text(row_text) and "PLAN 1998" in key_text(row_text):
            in_old_electives = True
        old_code = clean_code(values[0] if len(values) > 0 else "")
        old_name = clean_text(values[1] if len(values) > 1 else "")
        if not re.fullmatch(r"[A-Z]{2,4}-\d{3}", old_code):
            continue
        final_code = clean_code(values[2] if len(values) > 2 else "")
        final_name = clean_text(values[3] if len(values) > 3 else "")
        if (slug, old_code) in FINAL_CORRECTIONS:
            final_code, final_name = FINAL_CORRECTIONS[(slug, old_code)]
        if key_text(final_name) == "ELECTIVA":
            final_code = ""
            final_name = "Electiva del plan 2023 ajustado"
        middle_code = OVERRIDES.get(slug, {}).get(final_code, final_code)
        middle_name = final_name
        if "TALLER DE PROYECTO" in key_text(final_name):
            middle_name = "Taller de Técnico Superior"
        plan_meta = plan_catalog.get(final_code, {})
        if key_text(final_name) == "ELECTIVA DEL PLAN 2023 AJUSTADO":
            plan_section = "Electivas de la mención"
            plan_order = 10000
        elif final_name and not plan_meta:
            plan_section = "Otras equivalencias"
            plan_order = 11000
        else:
            plan_section = plan_meta.get("section", "Sin equivalencia directa")
            plan_order = plan_meta.get("order", 12000)
        middle_meta = build_middle_plan_meta(middle_code, {"section": plan_section})
        number_match = re.search(r"(\d{3})$", old_code)
        semester = int(number_match.group(1)[1]) if number_match else 0
        old_section = "Electivas del plan 1998" if in_old_electives else f"{semester}.º semestre"
        rows.append({
            "id": f"{slug}-{idx}",
            **({"highlight": True} if idx in highlighted else {}),
            "oldCode": old_code,
            "oldName": old_name.title(),
            "middleCode": middle_code,
            "middleName": middle_name,
            "finalCode": final_code,
            "finalName": final_name,
            "oldSection": old_section,
            "middleSection": middle_meta["section"],
            "middleOrder": middle_meta["order"],
            "finalSection": plan_section,
            "finalOrder": plan_order,
        })
    return rows

def build_electives(slug):
    ws = openpyxl.load_workbook(ADJUSTED_SOURCE / ADJUSTED_FILES[slug], data_only=True, read_only=True).active
    electives = []
    in_catalog = False
    for values in ws.iter_rows(values_only=True):
        joined = key_text(" ".join(clean_text(value) for value in values if value is not None))
        if "ELECTIVAS MENCION" in joined:
            in_catalog = True
            continue
        if not in_catalog:
            continue
        if "RESOLUCION" in joined:
            break
        for pos, value in enumerate(values[:-1]):
            code = clean_code(value)
            if not re.fullmatch(r"[A-Z]{2,4}-\d{3}", code):
                continue
            name = clean_text(values[pos + 1])
            if not name or re.fullmatch(r"[A-Z]{2,4}-\d{3}", clean_code(name)):
                continue
            electives.append({
                "finalCode": code,
                "finalName": name.title(),
                "middleCode": OVERRIDES.get(slug, {}).get(code, code),
                "middleName": name.title(),
            })
    unique = {item["finalCode"]: item for item in electives}
    return list(unique.values())

payload = {
    slug: {"name": name, "rows": build_rows(slug, filename), "electives": build_electives(slug)}
    for slug, (name, filename) in FILES.items()
}

def validate_payload(data):
    issues = []
    if set(data) != set(FILES):
        issues.append("No se generaron las siete menciones esperadas")
    for slug, plan in data.items():
        for row in plan["rows"]:
            if row["finalName"] and row["finalName"] != "Electiva del plan 2023 ajustado" and row["finalSection"] == "Otras equivalencias":
                issues.append(f"{slug} {row['oldCode']}: {row['finalCode']} no aparece en el plan ajustado")
            if row["middleName"] and row["middleSection"] == "Otras equivalencias":
                issues.append(f"{slug} {row['oldCode']}: {row['middleCode']} no pudo ubicarse en el plan 2023")
    ia_statistics = {
        row["oldCode"]: (row["finalCode"], row["finalSection"])
        for row in data["ia"]["rows"] if row["oldCode"] in {"EST-133", "EST-145"}
    }
    if ia_statistics != {"EST-133": ("INF-124", "2.º semestre"), "EST-145": ("INF-134", "3.º semestre")}:
        issues.append(f"Estadística I/II de IA no quedó separada por semestre: {ia_statistics}")
    if issues:
        raise ValueError("\n".join(issues))

validate_payload(payload)
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text("window.CONVALIDATION_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"Generado {OUTPUT} con {sum(len(item['rows']) for item in payload.values())} filas")
