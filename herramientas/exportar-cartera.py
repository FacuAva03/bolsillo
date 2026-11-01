"""Exporta las posiciones de la bóveda (Áreas/Inversiones/Posiciones) a cartera.json,
listo para importar en Bolsillo desde Ajustes → Importar archivo.

Uso: python herramientas/exportar-cartera.py [ruta de la bóveda] [archivo de salida]
"""
import datetime
import json
import sys
from pathlib import Path

from cartera_boveda import BOVEDA_POR_DEFECTO, leer_posiciones

BOVEDA = Path(sys.argv[1]) if len(sys.argv) > 1 else BOVEDA_POR_DEFECTO
SALIDA = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / 'cartera.json'

posiciones = leer_posiciones(BOVEDA)
SALIDA.write_text(json.dumps({
    'formato': 'bolsillo',
    'version': 1,
    'exportado': datetime.datetime.now().isoformat(timespec='seconds'),
    'origen': 'boveda',
    'posiciones': posiciones,
}, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'{len(posiciones)} posiciones -> {SALIDA}')
