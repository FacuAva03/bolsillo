"""Lee las posiciones de la bóveda (Áreas/Inversiones/Posiciones) con el formato de Bolsillo."""
import re
from pathlib import Path

import yaml

BOVEDA_POR_DEFECTO = Path.home() / 'OneDrive' / 'Desktop' / 'Obsidian Vault'


def carpeta_posiciones(boveda):
    return Path(boveda) / 'Áreas' / 'Inversiones' / 'Posiciones'


def _numero(valor):
    try:
        return float(valor) if valor not in (None, '') else None
    except (TypeError, ValueError):
        return None


def leer_posiciones(boveda=BOVEDA_POR_DEFECTO):
    posiciones = []
    for nota in sorted(carpeta_posiciones(boveda).glob('*.md')):
        m = re.match(r'^---\r?\n(.*?)\r?\n---', nota.read_text(encoding='utf-8'), re.S)
        if not m:
            continue
        fm = yaml.safe_load(m.group(1)) or {}
        if not fm.get('ticker'):
            continue
        nombre = nota.stem.split(' - ', 1)[1] if ' - ' in nota.stem else nota.stem
        fecha = fm.get('precio_actualizado')
        posiciones.append({
            'ticker': str(fm['ticker']).upper(),
            'nombre': nombre,
            'tipo': fm.get('tipo') or 'Otro',
            'moneda': fm.get('moneda') or 'ARS',
            'cantidad': _numero(fm.get('cantidad')),
            'precioCompra': _numero(fm.get('precio_compra')),
            'precioActual': _numero(fm.get('precio_actual')),
            'precioFecha': str(fecha) if fecha else None,
            'valorManual': _numero(fm.get('valor_manual')),
        })
    return posiciones
