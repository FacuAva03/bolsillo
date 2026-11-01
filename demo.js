// Datos de ejemplo para el modo demo (?demo): seis meses de movimientos y una cartera inventada.
// Son siempre los mismos (azar con semilla) y las fechas se arman a partir de hoy.

function azarConSemilla(semilla) {
  let s = semilla;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function datosDemo(hoy = new Date()) {
  const azar = azarConSemilla(2026);
  const entre = (min, max) => Math.round((min + azar() * (max - min)) / 100) * 100;
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hoyISO = iso(hoy);
  const movimientos = [];

  const mov = (tipo, monto, categoria, fecha, extra = {}) => {
    if (fecha > hoyISO) return;
    movimientos.push({
      id: crypto.randomUUID(), tipo, monto, moneda: 'ARS', categoria, fecha,
      medio: '', nota: '', creado: Date.parse(`${fecha}T12:00`), ...extra,
    });
  };

  for (let i = 5; i >= 0; i--) {
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const dia = n => iso(new Date(inicio.getFullYear(), inicio.getMonth(), n));
    const ajuste = 1 + (5 - i) * 0.025; // los montos suben un poco cada mes
    const redondo = n => Math.round((n * ajuste) / 1000) * 1000;

    mov('ingreso', redondo(780000), 'Sueldo', dia(1), { nota: 'Sueldo del mes' });
    if (i % 2 === 0) mov('ingreso', [300, 150, 220][i / 2], 'Webs / clientes', dia(14), { moneda: 'USD', nota: 'Landing para un cliente' });
    if (i % 3 === 1) mov('ingreso', entre(60000, 120000), 'Freelance', dia(20), { nota: 'Arreglo de una web' });

    mov('gasto', redondo(250000), 'Casa', dia(2), { medio: 'Transferencia', nota: 'Alquiler' });
    mov('gasto', 38000, 'Gimnasio', dia(3), { medio: 'Débito', nota: 'Cuota del mes' });
    // Suscripciones en dólares con el cambio que tomó la tarjeta (dólar tarjeta, más caro que el MEP).
    const cambioTarjeta = Math.round(1890 * ajuste);
    mov('gasto', 12.99, 'Suscripciones', dia(5), { moneda: 'USD', cambio: cambioTarjeta, medio: 'Crédito', nota: 'Netflix' });
    mov('gasto', 20, 'Suscripciones', dia(7), { moneda: 'USD', cambio: cambioTarjeta, medio: 'Crédito', nota: 'ChatGPT' });
    mov('gasto', 4999, 'Suscripciones', dia(5), { medio: 'Crédito', nota: 'Spotify' });
    mov('gasto', entre(38000, 52000), 'Servicios', dia(8), { medio: 'Débito', nota: 'Luz, gas e internet' });
    mov('gasto', entre(20000, 35000), 'Transporte', dia(10), { medio: 'Mercado Pago', nota: 'SUBE y nafta' });
    for (const n of [4, 11, 18, 25]) mov('gasto', entre(28000, 55000), 'Súper', dia(n), { medio: 'Débito' });
    for (const n of [6, 13, 21, 27]) mov('gasto', entre(9000, 26000), 'Comida', dia(n), { medio: 'Mercado Pago', nota: 'Delivery' });
    for (const n of [9, 23]) mov('gasto', entre(12000, 30000), 'Salidas', dia(n), { medio: 'Efectivo' });
    if (i === 2) mov('gasto', 85000, 'Ropa', dia(16), { medio: 'Crédito', nota: 'Zapatillas' });
    if (i === 4) mov('gasto', 45, 'Estudio', dia(12), { moneda: 'USD', medio: 'Crédito', nota: 'Curso online' });
  }
  mov('gasto', 31500, 'Súper', hoyISO, { medio: 'Débito', nota: 'Compra grande' });

  const posiciones = [
    ['AAPL', 'Apple', 'CEDEAR', 'ARS', 6, 21500, 28900],
    ['MELI', 'MercadoLibre', 'CEDEAR', 'ARS', 8, 24100, 23300],
    ['NVDA', 'Nvidia', 'CEDEAR', 'ARS', 10, 9800, 14700],
    ['SPY', 'ETF S&P 500', 'CEDEAR ETF', 'ARS', 12, 19800, 22400],
    ['QQQ', 'ETF Nasdaq-100', 'CEDEAR ETF', 'ARS', 6, 15500, 18100],
    ['GGAL', 'Grupo Galicia', 'Acción', 'ARS', 20, 6100, 5560],
    ['YPFD', 'YPF', 'Acción', 'ARS', 4, 38000, 44500],
    ['BTC', 'Bitcoin', 'Cripto', 'USD', 0.004, 68000, 81000],
    ['ETH', 'Ethereum', 'Cripto', 'USD', 0.08, 2900, 2650],
    ['ARS', 'Liquidez en pesos', 'Liquidez', 'ARS', 320000, 1, 1],
  ].map(([ticker, nombre, tipo, moneda, cantidad, precioCompra, precioActual]) => ({
    id: crypto.randomUUID(), ticker, nombre, tipo, moneda, cantidad, precioCompra, precioActual,
    precioFecha: hoyISO, valorManual: null,
  }));

  return { movimientos, posiciones };
}
