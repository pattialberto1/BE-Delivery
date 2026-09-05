"""
Arma el resumen en PDF de qué hace el sistema de delivery.

Es el documento que se le pasa a quien no va a leer el README: dueño, contador,
alguien nuevo en el local. Se regenera con:

    pip install reportlab
    python3 scripts/resumen-pdf.py

Si cambia lo que hace la app, se edita este archivo y se vuelve a correr; así el
PDF no se desactualiza a escondidas.
"""

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from pathlib import Path

SALIDA = str(Path(__file__).resolve().parent.parent / 'Resumen-Sistema-Delivery.pdf')

ROJO = colors.HexColor('#B91C1C')
ROJO_CLARO = colors.HexColor('#FEF2F2')
GRIS = colors.HexColor('#475569')
GRIS_CLARO = colors.HexColor('#F1F5F9')
GRIS_BORDE = colors.HexColor('#CBD5E1')
TINTA = colors.HexColor('#0F172A')

base = getSampleStyleSheet()

E = {
    'titulo': ParagraphStyle(
        'titulo', parent=base['Title'], fontName='Helvetica-Bold',
        fontSize=22, leading=26, textColor=ROJO, alignment=0, spaceAfter=2,
    ),
    'subtitulo': ParagraphStyle(
        'subtitulo', parent=base['Normal'], fontName='Helvetica',
        fontSize=11, leading=15, textColor=GRIS, spaceAfter=16,
    ),
    'h': ParagraphStyle(
        'h', parent=base['Heading2'], fontName='Helvetica-Bold',
        fontSize=13.5, leading=17, textColor=ROJO, spaceBefore=16, spaceAfter=6,
        keepWithNext=True,
    ),
    'p': ParagraphStyle(
        'p', parent=base['Normal'], fontName='Helvetica',
        fontSize=9.8, leading=14.5, textColor=TINTA, alignment=TA_JUSTIFY, spaceAfter=7,
    ),
    'celda': ParagraphStyle(
        'celda', parent=base['Normal'], fontName='Helvetica',
        fontSize=9, leading=12.5, textColor=TINTA,
    ),
    'celdaneg': ParagraphStyle(
        'celdaneg', parent=base['Normal'], fontName='Helvetica-Bold',
        fontSize=9, leading=12.5, textColor=TINTA,
    ),
    'cabecera': ParagraphStyle(
        'cabecera', parent=base['Normal'], fontName='Helvetica-Bold',
        fontSize=9, leading=12.5, textColor=TINTA,
    ),
    'pie': ParagraphStyle(
        'pie', parent=base['Normal'], fontName='Helvetica',
        fontSize=8, leading=11, textColor=GRIS,
    ),
    'destacado': ParagraphStyle(
        'destacado', parent=base['Normal'], fontName='Helvetica',
        fontSize=9.8, leading=14.5, textColor=TINTA, alignment=TA_JUSTIFY,
        leftIndent=9, rightIndent=9, spaceBefore=3, spaceAfter=3,
    ),
}


def parrafo(texto):
    return Paragraph(texto, E['p'])


def seccion(texto):
    return Paragraph(texto, E['h'])


def tabla(filas, anchos, cabecera=True, junto=False):
    """
    Tabla de dos columnas con la cabecera sombreada.

    `junto` la mantiene entera en una página; las que no caben se parten pero
    repiten la cabecera arriba, para que la continuación se siga leyendo.
    """
    datos = []
    for i, fila in enumerate(filas):
        estilo = E['cabecera'] if (cabecera and i == 0) else E['celda']
        datos.append([Paragraph(c, estilo) for c in fila])

    t = Table(datos, colWidths=anchos, hAlign='LEFT', repeatRows=1 if cabecera else 0)
    estilos = [
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('LINEBELOW', (0, 0), (-1, -2), 0.4, GRIS_BORDE),
        ('BOX', (0, 0), (-1, -1), 0.4, GRIS_BORDE),
    ]
    if cabecera:
        estilos.append(('BACKGROUND', (0, 0), (-1, 0), GRIS_CLARO))
    t.setStyle(TableStyle(estilos))
    return KeepTogether(t) if junto else t


def recuadro(texto):
    """Un bloque destacado sobre fondo claro, para lo que no hay que perder."""
    t = Table([[Paragraph(texto, E['destacado'])]], colWidths=[16.4 * cm], hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), ROJO_CLARO),
        ('LINEBEFORE', (0, 0), (0, -1), 2.5, ROJO),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    return t


def pie_de_pagina(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(GRIS)
    canvas.drawString(2.3 * cm, 1.3 * cm, 'Broaster Express La Candelaria · Sistema de Delivery')
    canvas.drawRightString(A4[0] - 2.3 * cm, 1.3 * cm, f'Página {doc.page}')
    canvas.setStrokeColor(GRIS_BORDE)
    canvas.setLineWidth(0.4)
    canvas.line(2.3 * cm, 1.7 * cm, A4[0] - 2.3 * cm, 1.7 * cm)
    canvas.restoreState()


historia = []
A = historia.append

A(Paragraph('Sistema de Delivery', E['titulo']))
A(Paragraph(
    'Broaster Express La Candelaria &nbsp;·&nbsp; qué hace y para qué sirve',
    E['subtitulo'],
))

# --- El problema -------------------------------------------------------------

A(seccion('El problema que resuelve'))
A(parrafo(
    'Antes, el mismo dato se escribía <b>tres veces</b>: la cajera lo anotaba a mano en una hoja al '
    'confirmar el pago móvil, alguien lo pasaba a un Excel y lo imprimía, y la administradora '
    'cotejaba comanda por comanda que factura, referencia y cuenta coincidieran. Al final armaba '
    '<b>otro</b> cuadro, también a mano, con las carreras de cada repartidor y cuánto se le debía.'
))
A(parrafo(
    'Ese triple tecleo era donde nacían los errores —referencias repetidas, facturas saltadas, '
    'montos que no cuadran— y donde se iba el tiempo de la administradora, que hacía de validador '
    'humano.'
))
A(recuadro(
    'Con el sistema, el dato se teclea <b>una sola vez</b>, en la tablet, en el momento en que se '
    'confirma el pago. De ahí sale todo lo demás solo: la tarifa según la zona, el cuadre del '
    'día, la verificación y la liquidación de repartidores.'
))

# --- Las pantallas -----------------------------------------------------------

A(seccion('Las pantallas'))
A(tabla([
    ['Pantalla', 'Qué hace'],
    ['<b>Nueva orden</b>',
     'Se carga la comanda desde la tablet: factura, cliente, zona y los pagos con su captura. '
     'Arriba dice <b>por cuál comanda del día va</b>. La tarifa del delivery sale sola al elegir '
     'la zona —nunca se teclea— y el cuadre entre lo cobrado y el total se calcula en vivo.'],
    ['<b>Asignar</b>',
     'Dos toques: se toca al repartidor que subió y después las comandas que se lleva. Cada '
     'toque asigna al instante, con Deshacer. Es el momento real en que se sabe quién lleva qué.'],
    ['<b>Órdenes del día</b>',
     'La lista de la jornada, con buscador y filtros. Desde ahí se corrige, se anula y se asignan '
     'varias de una vez. Cada fila lleva su número de comanda y su referencia.'],
    ['<b>Verificar</b>',
     'La administradora ve la captura del pago al lado de lo que se tecleó y aprueba con un '
     'botón. Reemplaza el cotejo contra papel impreso.'],
    ['<b>Cierre</b>',
     'Cómo cerró el día: totales por forma de pago, delivery cobrado, a pagar a repartidores, '
     'y la lista de pagos con sus referencias. Al cerrar, la jornada queda congelada.'],
    ['<b>Liquidación</b>',
     'Cuántas carreras hizo cada repartidor y cuánto se le debe, por día o por rango de fechas. '
     'Es el tercer cuadro que antes se armaba a mano.'],
    ['<b>Configuración</b>',
     'Zonas y tarifas, repartidores, cuentas, usuarios y la tasa del día.'],
], [3.4 * cm, 13 * cm]))

# --- Lo que revisa sola ------------------------------------------------------

A(seccion('Lo que el sistema revisa solo'))
A(parrafo(
    'Esto es lo que antes hacía la administradora comanda por comanda, movido al momento en que se '
    'teclea —cuando el cliente todavía está en línea y el error se puede corregir:'
))
A(tabla([
    ['Revisión', 'Para qué'],
    ['Referencia repetida',
     'Detecta la captura que el cliente mandó dos veces. Compara la referencia completa o los '
     'últimos 4 dígitos, indistintamente.'],
    ['Factura repetida', 'Avisa antes de guardar si ese número ya está cargado en la jornada.'],
    ['Saltos en el correlativo',
     'Dice qué números de factura faltan: suelen ser comandas que se facturaron pero nunca se '
     'cargaron.'],
    ['Descuadre de montos',
     'Marca la diferencia entre lo pagado y el total en el acto, no al día siguiente.'],
    ['Sin repartidor', 'No deja cerrar la jornada con carreras que no se le pagan a nadie.'],
], [4.6 * cm, 11.8 * cm], junto=True))

# --- Casos del día a día ----------------------------------------------------

A(seccion('Los casos del día a día que contempla'))
A(tabla([
    ['Caso', 'Cómo lo resuelve'],
    ['<b>Pagos partidos</b>',
     'El cliente manda una parte por pago móvil y trae el resto en dólares. El sistema detecta '
     'lo que falta y ofrece agregarlo con el monto ya calculado.'],
    ['<b>Pick Up</b>',
     'El cliente pide por teléfono y pasa a buscarlo. Entra en el cierre de caja —la plata la '
     'recibe la misma cajera— pero no cuenta como delivery ni va a la liquidación.'],
    ['<b>Facturadas aparte</b>',
     'La comanda que el cliente pide con factura fiscal se cobra por la caja del local. Se carga '
     'marcada y <b>no suma en ningún total del cierre</b>; lo único que genera es la carrera del '
     'repartidor. Se anota además con qué moneda cobró la otra caja —y si fue parte y parte, '
     'cuánto de cada una—, que es lo que dice de dónde sale la plata para esa carrera.'],
    ['<b>Comanda olvidada</b>',
     'Al día siguiente aparece alguna que se quedó sin anotar. Se elige la fecha y entra en el '
     'cierre de <b>ese</b> día, con la tasa de ese día.'],
    ['<b>Correcciones</b>',
     'Cualquier orden ya cargada se edita: factura, cliente, zona, montos, repartidor y pagos. '
     'Una orden ya verificada solo la modifica la administradora.'],
    ['<b>Dirección opcional</b>',
     'Muchos clientes mandan el location por WhatsApp y no escriben nada. Lo que define el cobro '
     'es la zona, y esa sí es obligatoria.'],
], [3.6 * cm, 12.8 * cm]))

# --- Reportes ----------------------------------------------------------------

A(seccion('Los reportes'))
A(parrafo(
    'Son dos Excel distintos porque responden preguntas distintas, y salen de los mismos datos que '
    'muestra la pantalla, así que no pueden diferir de ella.'
))
A(tabla([
    ['Reporte', 'Qué trae'],
    ['<b>Cierre</b>',
     'Cómo cerró el día: totales en dólares y bolívares, desglose por forma de pago y por zona, '
     'y lo que quedó por revisar. En hojas aparte, el detalle de las órdenes y un renglón por '
     'pago con <b>su número de referencia</b>, la cuenta que lo recibió y el banco del cliente — '
     'que es lo que se va tachando contra el banco.'],
    ['<b>Liquidación</b>',
     'A quién pagarle cuánto: agrupada por repartidor, con sus carreras listadas debajo y el '
     'subtotal de cada uno. La hoja de resumen trae una línea por persona con el monto <b>partido '
     'según con qué plata entró cada carrera</b> —dólares, bolívares, mixtas y facturadas '
     'aparte—, para saber cuánto sacar de cada caja.'],
], [3.6 * cm, 12.8 * cm]))

# --- Roles -------------------------------------------------------------------

A(seccion('Quién puede hacer qué'))
A(tabla([
    ['Rol', 'Permisos'],
    ['<b>Cajera</b>', 'Cargar órdenes, asignar repartidores y corregir las que aún no están verificadas.'],
    ['<b>Administradora</b>',
     'Todo: verificar, cerrar y reabrir la jornada, corregir lo verificado, y configurar zonas, '
     'tarifas, repartidores y usuarios.'],
    ['<b>Dueño</b>', 'Solo lectura de reportes y liquidaciones.'],
], [3.6 * cm, 12.8 * cm], junto=True))
A(Spacer(1, 6))
A(parrafo(
    '<b>Nadie se registra solo.</b> Los usuarios los crea la administradora, con un nombre de usuario '
    'y una clave. La cajera y los repartidores <b>no necesitan tener correo</b>: entran con algo como '
    '<font face="Courier">genesis</font> y su clave.'
))

# --- Cómo está hecho --------------------------------------------------------

A(seccion('Cómo está hecho'))
A(tabla([
    ['<b>Dónde corre</b>',
     'Aplicación web. Se instala en la tablet como si fuera una app —con su ícono, sin pasar '
     'por Play Store— y se abre igual en la computadora.'],
    ['<b>Dónde viven los datos</b>',
     'Supabase (base de datos Postgres, autenticación y las capturas de pago). Cada rol ve solo '
     'lo que le toca, impuesto por la base de datos y no solo por la pantalla.'],
    ['<b>Si se cae el internet</b>',
     'El formulario guarda un borrador en el navegador: lo tecleado no se pierde al recargar. Las '
     'capturas sí hay que volver a adjuntarlas.'],
    ['<b>Reglas históricas</b>',
     'Cada orden guarda la tarifa y la tasa que tenía el día que se cargó. Si mañana suben las '
     'tarifas, los reportes viejos no se alteran.'],
], [3.6 * cm, 12.8 * cm], cabecera=False, junto=True))

A(Spacer(1, 14))
A(Paragraph(
    'Documento generado el 5 de septiembre de 2026.',
    E['pie'],
))

doc = BaseDocTemplate(
    SALIDA, pagesize=A4,
    leftMargin=2.3 * cm, rightMargin=2.3 * cm, topMargin=2.1 * cm, bottomMargin=2.3 * cm,
    title='Sistema de Delivery — Broaster Express La Candelaria',
    author='Broaster Express La Candelaria',
    subject='Resumen del sistema de delivery',
)
marco = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='cuerpo')
doc.addPageTemplates([PageTemplate(id='normal', frames=[marco], onPage=pie_de_pagina)])
doc.build(historia)
print('Listo:', SALIDA)
