"""Sincroniza la cartera de la bóveda con Bolsillo (Firestore).

La bóveda manda: crea o actualiza cada posición (por ticker) y borra de la app las que
vinieron de la bóveda y ya no están o quedaron en cantidad 0. Las posiciones cargadas
a mano en la app, que no están en la bóveda, no se tocan.

Uso:
  python herramientas/sincronizar-cartera.py              sincroniza
  python herramientas/sincronizar-cartera.py --simular    muestra qué cambiaría, sin escribir
  python herramientas/sincronizar-cartera.py --si-cambio  solo si alguna nota cambió desde
                                                          la última vez (lo usa el hook)

Necesita, fuera de la bóveda y del repo, en ~/.config/bolsillo/:
  clave-servicio.json  clave privada de la cuenta de servicio de Firebase (secreta)
  config.json          {"uid": "<tu UID de Authentication>"}
"""
import argparse
import json
import re
import sys
from pathlib import Path

from cartera_boveda import BOVEDA_POR_DEFECTO, carpeta_posiciones, leer_posiciones

CONFIG = Path.home() / '.config' / 'bolsillo'
CLAVE = CONFIG / 'clave-servicio.json'
AJUSTES = CONFIG / 'config.json'
ESTADO = CONFIG / 'ultima-sincronizacion.json'
CAMPOS = ('ticker', 'nombre', 'tipo', 'moneda', 'cantidad', 'precioCompra', 'precioActual',
          'precioFecha', 'valorManual')


def ultima_modificacion(boveda):
    return max((p.stat().st_mtime for p in carpeta_posiciones(boveda).glob('*.md')), default=0)


def leer_estado():
    try:
        return json.loads(ESTADO.read_text(encoding='utf-8'))['mtime']
    except (OSError, ValueError, KeyError):
        return 0


def vendida(p):
    return p['cantidad'] == 0 and p['valorManual'] is None


def sincronizar(posiciones, simular):
    import firebase_admin
    from firebase_admin import credentials, firestore

    uid = json.loads(AJUSTES.read_text(encoding='utf-8'))['uid']
    firebase_admin.initialize_app(credentials.Certificate(str(CLAVE)))
    db = firestore.client()
    coleccion = db.collection('usuarios').document(uid).collection('posiciones')

    existentes = {d.id: d.to_dict() for d in coleccion.stream()}
    por_ticker = {str(v.get('ticker', '')).upper(): k for k, v in existentes.items()}
    lote = db.batch()
    cambios = []

    for p in posiciones:
        doc_id = por_ticker.get(p['ticker']) or 'boveda-' + re.sub(r'[^A-Za-z0-9_-]', '-', p['ticker'])
        nuevo = {**{k: p[k] for k in CAMPOS}, 'origen': 'boveda'}
        viejo = existentes.get(doc_id)
        if viejo is None or any(viejo.get(k) != v for k, v in nuevo.items()):
            cambios.append(('nueva' if viejo is None else 'actualizada', p['ticker']))
            lote.set(coleccion.document(doc_id), nuevo, merge=True)

    tickers = {p['ticker'] for p in posiciones}
    for doc_id, v in existentes.items():
        ticker = str(v.get('ticker', '')).upper()
        if v.get('origen') == 'boveda' and ticker not in tickers:
            cambios.append(('borrada', ticker))
            lote.delete(coleccion.document(doc_id))

    if cambios and not simular:
        lote.commit()
    return cambios


def main():
    for flujo in (sys.stdout, sys.stderr):
        flujo.reconfigure(encoding='utf-8')  # la consola de Windows usa cp1252
    parser = argparse.ArgumentParser(description='Sincroniza la cartera de la bóveda con Bolsillo.')
    parser.add_argument('--boveda', default=str(BOVEDA_POR_DEFECTO))
    parser.add_argument('--simular', action='store_true')
    parser.add_argument('--si-cambio', action='store_true')
    args = parser.parse_args()
    boveda = Path(args.boveda)
    configurado = CLAVE.exists() and AJUSTES.exists()

    if args.si_cambio:
        # Desde el hook: sin configuración o sin cambios, salir en silencio.
        if not configurado or ultima_modificacion(boveda) <= leer_estado():
            return 0

    posiciones = [p for p in leer_posiciones(boveda) if not vendida(p)]

    if not configurado:
        if not args.simular:
            print(f'Falta la configuración en {CONFIG} (clave-servicio.json y config.json).', file=sys.stderr)
            return 1
        print(f'Simulación sin conexión: se enviarían {len(posiciones)} posiciones.')
        for p in posiciones:
            print(f"  {p['ticker']:<6} {p['tipo']:<11} cantidad={p['cantidad']} precio={p['precioActual']}")
        return 0

    mtime = ultima_modificacion(boveda)
    try:
        cambios = sincronizar(posiciones, args.simular)
    except Exception as err:  # sin conexión, clave inválida, etc.: se reintenta la próxima vez
        print(f'Bolsillo: no se pudo sincronizar la cartera ({err.__class__.__name__}: {err}).', file=sys.stderr)
        return 0 if args.si_cambio else 1

    if not args.simular:
        ESTADO.write_text(json.dumps({'mtime': mtime}), encoding='utf-8')
    prefijo = 'Simulación: ' if args.simular else 'Bolsillo: '
    if not cambios:
        print(f'{prefijo}la cartera de la app ya estaba al día.')
    else:
        resumen = ', '.join(f'{t} {estado}' for estado, t in cambios)
        print(f'{prefijo}{len(cambios)} cambios en la cartera ({resumen}).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
