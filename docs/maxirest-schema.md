# Esquema de la base Maxirest — Bar Ideal (Tandil)

Relevamiento de solo lectura de la base MariaDB de **Maxirest**, el POS que usa **Bar Ideal** (razón social "El Nuevo Ideal de Tandil SRL", Rodríguez 499, Tandil, Buenos Aires — dato sacado de `mxpae`). Volcado hecho el **2026-07-05**: 211 tablas, cada una con su `DESCRIBE` (columnas), `COUNT(*)` y hasta 8 filas de muestra. De esas 211 tablas, **101 tienen datos** y **110 están vacías**.

Convención de nombres: prefijo `mx` = tabla histórica/maestra de Maxirest. Prefijo `mxtu` = **tabla del turno actual** (turno = jornada/shift en curso). Las `mxtu*` son un buffer en vivo: cuando cierra el turno, sus filas se "vuelcan" a la tabla histórica equivalente (ej. `mxtufac` → `mxfac`) y la `mxtu*` se vacía para el turno siguiente. Los IDs de las tablas `mxtu*` **continúan la secuencia** de la tabla histórica (ej. `mxfac` termina en id 113678~113679 y `mxtufac` arranca en 113680), lo que confirma que es la misma secuencia lógica partida en dos tablas físicas por rendimiento.

Aclaración sobre "turno" en esta base: no es el mozo/empleado, es la jornada de facturación (columna `turno` con valores `'1'`, `'2'`, etc., ligada a franjas horarias del día — hay `turno1`/`turno2`/`turno3` configurados en `mxpae` como "Mañana"/"Tarde").

---

## Tablas centrales del negocio

### mxfac (113.678 filas) — Facturación histórica cerrada
Encabezado de cada comprobante de venta (factura/ticket) ya cerrado. Columnas clave: `fecha`, `turno`, `fecha_ent`/`hora_ent`/`hora_sal` (entrada y salida de la mesa), `cod_cpb` (tipo de comprobante: `B`=factura B, etc.), `prefijo`+`numero` (numeración fiscal), `mesa`, `cod_emp` (empleado/mozo que atendió), `cod_cli` (cliente, casi siempre 0 = consumidor final), `cod_usu` (usuario/cajero que facturó), `cod_dto`+`imp_dto` (descuento aplicado), `total`, `neto1`/`tasa1`/`iva1` (+ neto2/3, tasa2/3 para múltiples alícuotas de IVA), `cae` (código de autorización AFIP, casi siempre vacío en la muestra — se completa vía `mxcae`). PK `id` autoincremental que sigue en `mxtufac`.

### mxtufac (185 filas) — Facturación del turno/día en vivo
Mismo esquema que `mxfac` (le faltan columnas `var1/var2/var3` y sobra alguna variante menor). Es el "buffer" del día actual: en la muestra la fecha es 2026-07-05 (hoy) con id continuando desde 113680. **Es la fuente para el módulo "en vivo" del dashboard.**

### mxite (521.859 filas) / mxtuite (849 filas) — Ítems de cada comprobante
Detalle línea por línea de lo vendido en cada factura. Se relaciona con `mxfac`/`mxtufac` por `cod_cpb + prefijo + numero + fecha`, y con `mxart` por `cod_art`. Columnas: `cantidad`, `precio`, `cod_dto`+`imp_dto` (descuento a nivel ítem), `padre`/`hijo`/`tipo_rel` (para ítems compuestos, ej. un combo con sus componentes), `remito` (bit, si el ítem se remitió). **Nota de calidad**: la primera línea de cada comprobante suele tener `cod_art=0` y `precio` simbólico (ej. 1.00) — parece un registro de encabezado/apertura de mesa, no un producto real; hay que filtrarlo al calcular ranking de productos.

### mxart (790 filas) — Maestro de artículos/productos
Catálogo de productos del menú. Columnas relevantes: `codigo` (clave usada en `cod_art` de otras tablas), `nombre`, `precio1`..`precio4` (listas de precio, ej. mostrador/delivery/otro canal) y sus versiones `precio1m..4m` para "media porción" (`media` bit), `costo`, `cod_rua` (rubro/categoría — FK a `mxrua`), `cod_sua` (subrubro — FK a `mxsua`), `discont` (bit: producto descontinuado/dado de baja, distinto de "descuento"), `bot_grupo`/`bot_fila`/`bot_colum` (posición en la grilla de botonera táctil), `sinstock`/`usastock`/`cantstk` (control de stock del producto). No tiene columna de fecha de alta, pero sí `fecha_update`.

### mxcm2 (527.796 filas) / mxtucm2 (854 filas) — Comandas (pedidos a cocina/barra)
Registra cada pedido enviado a elaborar: `fecha`, `turno`, `hora_ped` (con segundos, muy preciso), `mesa`, `mozo` (FK a `mxemp`), `cod_art`, `cantidad`, `cubiertos`, `origen` (canal de pedido, ej. `'1'`/`'2'`), `duracion`. Es la tabla más granular con hora exacta y mesa — **candidata principal para el heatmap de horarios pico y ocupación por franja**, más precisa que `mxfac` porque registra el momento del pedido, no solo el cierre de la venta.

### mxctc (114.319 filas) / mxtuctc (186 filas) — Cobros de comprobantes (formas de pago)
Detalle de cómo se pagó cada comprobante: `cod_for` (forma de pago — FK a `mxfor`, ej. `'*'`=efectivo), `importe`, `numtarj`/`cupon`/`lote`/`cuotas` (datos de tarjeta si aplica), `cod_cli`, relacionado con `mxfac`/`mxctr` por `cod_cpb+prefijo+numero+fecha`. Permite abrir la facturación por medio de pago.

### mxctr (112.944 filas) / mxtuctr (182 filas) — Comprobantes de control / cierres de mesa
Parecido a `mxfac` pero es el comprobante de "control" (cod_cpb='C') que se genera al cerrar/controlar una mesa antes o en paralelo a la factura fiscal. Trae `mesa`, `cod_emp`, `cubiertos`, `total`, `referencia` (a veces dice literalmente `'Modificado'`). **Nota de calidad importante**: en `mxtuctr` la columna `fecha` aparece con el valor `1899-11-30T04:16:48.000Z` en varias filas de la muestra — es el epoch nulo típico de fechas DBF/Delphi mal migradas a datetime (no es una fecha real, hay que tratarla como NULL). Conviene no confiar en `fecha` de `mxtuctr` y usar la de `mxtufac`/`mxtuite` para esos casos, o cruzar por `numero`.

### mxcae (49.270 filas) — Respuestas de autorización AFIP (CAE)
Una fila por comprobante fiscal autorizado: `cod_cpb`+`prefijo`+`numero`, `cae` (número de autorización), `respuesta` (`'A'`=aprobado), `fecha_vto`, `neto1/tasa1/iva1` (+2/3), `txt_mensaje` con el QR en base64 (URL de verificación AFIP). Se relaciona con `mxfac` por comprobante. Tiene menos filas que `mxfac` (49k vs 113k) — no todos los comprobantes son fiscales electrónicos (hay controles internos `mxctr` que no facturan).

### mxaud (52.541 filas) / mxtuaud (20 filas) — Auditoría de acciones sobre mesas
Log de eventos manuales: anulaciones, aperturas, facturaciones parciales, etc. Columna `detalle` es texto libre con formato `"HH:MM USUARIO   Acción descriptiva"` (ej. `"11:34 CAJERO1    Facturación parcial de mesa por importe: 0.00"`). Útil para detectar anulaciones y descuentos manuales, pero requiere parseo de texto (no está normalizado en columnas). Relacionado por `mesa`, `cod_emp`, `fecha`.

### mxemp (90 filas) — Empleados
Nombre, apellido, `nombreusu`/`clave` (credenciales del sistema, hasheadas/ofuscadas), `nivel` (nivel de acceso), `tipo` (ej. `'G'`=gerente), `sueldo`, `fecha_ing`/`fecha_baja`, permisos `p1..p99` (strings ofuscados, no legibles en claro). Es la maestra de mozos/cajeros/supervisores — FK desde `mxfac.cod_emp`, `mxctr.cod_emp`, `mxcm2.mozo`, `mxaud.cod_emp`. **Nota**: muchos registros tienen `nombre=''` (vacío) con solo `nombreusu` cargado — cuidado al armar "nombre del empleado" para mostrar en un ranking, conviene fallback a `nombreusu`.

### mxcli (522 filas) — Clientes
Padrón de clientes registrados (más allá del "consumidor final" cod_cli=0 que predomina en las ventas). Trae `nombre`, `dni`, `cuit`, `telefono`/`celular`, `e_mail`, y **acumuladores ya calculados**: `vtas_acum` (cantidad de ventas) e `impo_acum` (importe acumulado histórico), más `vtas_parc`/`impo_parc` (parcial, desde `fecha_parc`). Esto da un ranking de clientes "gratis" sin tener que recalcular desde `mxfac` (aunque conviene verificar consistencia, porque la mayoría de las ventas van a cod_cli=0 y no quedan asociadas a un cliente real).

### mxpro (301 filas) — Proveedores
Maestro de proveedores: `nombre`, `razon`, `cuit`, `direccion`, `localidad`, `cod_cga` (rubro de compra — FK a `mxcga`), `dias_venc`, `cbu`. Datos de proveedores reales de Tandil (ej. "Avicola Los Pinos", "Bodega La Rural", "BEER TAN S.A."). Confirma que Bar Ideal **sí tiene un padrón de proveedores cargado y en uso**.

### mxgas (6.684 filas) — Comprobantes de compra/gastos a proveedores
Encabezado de facturas de compra recibidas: `cod_pro` (FK a `mxpro`), `cod_cpb` (`'A'`=factura A, `'G'`=genérico/gasto), `numero1`/`numero2` (numeración del comprobante del proveedor), `fecha`, `fecha_ing` (fecha de carga en el sistema), `total`, `neto`, IVA discriminado, `cod_cga` (rubro), `id_comprob` (número de comprobante formateado, ej. `'0003-00083792'`). **Esto contradice la sospecha de que las compras no se cargan**: la muestra tiene compras reales con proveedor, fecha e importe (ej. compras a proveedor id=1 por $80.720, $125.137, etc. en abril 2025). Limitación: el volcado solo trae 8 filas de muestra por tabla (las de menor id, cargadas cerca de abril 2025) — no se puede confirmar desde este archivo si las compras siguen cargándose hasta la fecha reciente (julio 2026) o se dejó de usar en algún momento intermedio; para eso hace falta consultar la base en vivo (MAX(fecha) de mxgas), fuera del alcance de este análisis de solo lectura del dump.

### mxitc (10.044 filas) — Ítems de compra
Detalle línea por línea de cada comprobante de compra (`mxgas`): `cod_ins` (insumo — FK a `mxins`), `cantidad`, `precio`, `preciotot`, IVA. Se relaciona con `mxgas` por `cod_pro+cod_cpb+numero1+numero2`.

### mxpag (6.684 filas) — Pagos a proveedores
Un pago por comprobante de compra (misma cardinalidad que `mxgas`, 6684 filas ambas): `cod_pro`, `numero1`/`numero2` (mismo comprobante), `fecha` (fecha real de pago, distinta de la fecha del comprobante), `importe`, `tipo`. Permite calcular si una compra está pagada y con qué demora.

### mxdto (3 filas) — Catálogo de tipos de descuento
Solo 3 registros configurados: `'Descuento'` tipo `%`, `'Descuento'` tipo `$`, y `'EFECTIVO'` tipo `%` valor 10.00 (descuento por pago en efectivo). Es la maestra de motivos de descuento — pero el detalle real de cuánto se descontó por comprobante está en `mxfac.imp_dto`/`cod_dto` y `mxite.imp_dto`/`cod_dto`, no acá.

### mxver (0 filas) — Vacía
Pese a estar en la lista de tablas prioritarias, `mxver` (maestro de versiones de sistema) no tiene filas cargadas en este volcado.

### mxvertere (20 filas) — Versión instalada por terminal
Relaciona `cod_ter` (terminal — FK a `mxter`) con `cod_ver` y `cantidad`. Tabla de control de versiones de software por PC, sin valor para el dashboard de negocio.

### mxvar (1.166 filas) — Variables/catálogo de percepciones e impuestos
Catálogo interno de conceptos usados en facturación (`tipo='PER'` para percepciones de IVA, Ingresos Brutos, Ganancias, etc.). Configuración fiscal, no transaccional.

### mxbigg (1.221 filas) — Cola de sincronización hacia "Big" (servicio externo, quizás Maxirest Cloud/BI)
`coleccion` (nombre del dataset a exportar, ej. `'maestros_venta'`, `'maestros_stock'`), `fecha`, `procesado` (bit), `date_create`. Es un log técnico de integración, sin datos de negocio en sí, pero confirma que hay sincronización de "maestros_venta" hacia otro sistema — potencialmente relevante si se quiere entender qué datos ya se exportan.

### mxmenemp (4.976 filas) — Permisos de menú por empleado
Relaciona `cod_emp` con `cod_menu` (ítem de menú del software — FK a `mxmen`) y un hash en `activo`. Configuración de permisos de UI, no de negocio.

### mxreg (5.292 filas) — Log de registro de cambios (auditoría técnica)
`archivo` (nombre de tabla afectada, ej. `'TUCTC'`, `'TUITE'`, `'TUFAC'`), `accion` (`'DELETE'`, `'ANULAC'`), `usuario`, `fecha`, `hora`. Es un log de bajo nivel de qué se borró/anuló en qué tabla — sirve para detectar anulaciones pero no trae el detalle del comprobante en columnas separadas (va en `referencia` como texto posicional).

### mxshell (6.511 filas) — Log de procesos internos del sistema
`processid`, `cod_ter`, `proceso` (ej. `'MCHKCOM'`), tiempos de inicio/fin. Puramente técnico/infraestructura, sin valor de negocio.

### mxverfiled (10.852 filas) — Contenido binario de archivos de actualización
`archivo` es `mediumtext` con contenido en base64 (paquetes de instalación/actualización del sistema, partidos en `parte`). Sin valor de negocio, es almacenamiento de binarios de actualización de software.

---

## Otras tablas de negocio con datos (resumen medio)

- **mxmes (73 filas)**: layout físico del salón — `mesa`, `x`/`y`/`ancho`/`alto` (posición y tamaño en el plano gráfico), `mozo` asignado, `unificada` (mesas combinadas). Es el plano de mesas que dibuja Maxirest en pantalla; cruzando con `mxfac.mesa`/`mxctr.mesa` se puede saber cuántas mesas físicas hay y su capacidad aproximada.
- **mxape (14 filas)**: mesas **actualmente abiertas** (aperturas en curso) — `mesa`, `mozo`, `fecha_ape`, `hora`, `subtotal`, `total`, `cubiertos`, `estado`, `hora_cerr` (vacío si sigue abierta). Es el estado en vivo del salón — cuántas mesas están ocupadas ahora mismo y desde cuándo.
- **mxadi (66 filas)**: adicionales/pedidos pendientes de una mesa abierta (detalle en tiempo real antes de facturar) — `mesa`, `cod_art`, `cantidad`, `hora`, `agregados`/`sacados` (customización del pedido, ej. "sin cebolla"). Complementa a `mxape`.
- **mxres (4 filas)**: reservas de mesa — `cli_nom`, `cli_tel`, `fecha`, `hora`, `cubiertos`, `sena` (seña pagada), `observac`. Volumen bajo en la muestra pero estructuralmente es la tabla de reservas.
- **mxrlj (28 filas)**: "reloj"/tiempos de espera de mesa — `hora_llam` vs `hora_lleg`, útil para medir demora de atención pero con muy pocos datos.
- **mxctv (3 filas)**: tipos de circuito de venta (`nombre`: "Domicilio", etc. — salón/delivery/take away). Configuración, no transaccional, pero clave para filtrar `mxfac.cod_ctv` por canal de venta.
- **mxfor (7 filas)**: catálogo de formas de pago (`'*'`=Efectivo, y las demás tarjetas/transferencia). FK de `mxctc.cod_for`.
- **mxcga (79 filas)** / **mxrga (8 filas)** / **mxrui (21 filas)**: rubros de compra/gasto (categorías de proveedor, ej. "Almacen", "Mercaderias"). FK de `mxpro.cod_cga` y `mxgas.cod_cga`.
- **mxrua (27 filas)** / **mxsua (9 filas)**: rubros y subrubros de artículos del menú (ej. "Entradas", "CLASICOS"). FK de `mxart.cod_rua`/`cod_sua` — clave para agrupar el ranking de productos por categoría.
- **mxins (34 filas)**: insumos (materia prima) — distinto de `mxart` (productos de venta). FK de `mxitc.cod_ins` y `mxrec.cod_ins`.
- **mxrec (133 filas)**: recetas — relaciona `cod_art` con `cod_ins` y `cantidad` (cuánto insumo consume cada plato). Útil para costeo, no para ventas.
- **mxstk (44 filas)**: stock por insumo y depósito, con `stock_ini`/`ventas`/`compras`/`movim` — pocas filas, parece snapshot puntual más que histórico completo.
- **mxmvs (55 filas)**: movimientos de stock/inventario (entradas, remitos). Volumen bajo respecto a lo esperable para un histórico completo — puede que el módulo de stock no se use intensivamente.
- **mxhor (602 filas)**: fichadas de entrada/salida de empleados (dos turnos por día: entrada/salida y entrada2/salida2), con `duracion`. Sirve para cruzar horas trabajadas por empleado si se quisiera, aunque no fue pedido.
- **mxteremp (1.769 filas)**: sesiones de empleado por terminal (`cod_emp`, `cod_ter`, `ip`, `fecha_ini`, `hora_ini`) — log de logins.
- **mxlog (3.377 filas)**: log de inicio/fin de sesión por PC (`cod_emp`, `pc`, `hora_ini`, `hora_fin`).
- **mxcal (360 filas)**: layout de "mapas" — parece configuración de sectores/planos adicionales, poco documentado en la muestra.
- **mxfer (11 filas)**: feriados (`nombre`: "Año nuevo", `fecha`, `tipo`). Sirve para excluir feriados en comparativas de días de semana.
- **mxarc (12 filas)**: definición de objetos del plano gráfico (mesas, barra) con formato posicional en `nombre` (ej. `"barra\x1385\x13320\x13..."`) — config visual del plano, no data de negocio.
- **mxmov (175 filas)** / **mxcjm (75 filas)**: movimientos de caja/banco (QR, débitos, créditos) — `detalle`, `importe`, `cobrado`. Contabilidad de caja, no ventas directas.
- **mxcaj (1 fila)**: apertura/cierre de caja, solo 1 registro en la muestra.
- **mxpaa (1 fila)**: parámetros del turno actual — singleton con estado del día en curso: `fecha` (2026-07-05, hoy), `saldocaja`, `cubisact`/`cubisant`/`cubistot` (cubiertos del turno actual/anterior/total del día), `usuario`, `last_mod` (hora del último movimiento). Es un snapshot en vivo útil para un dashboard de "hoy".
- **mxpae (1 fila)**: configuración global del sistema — nombre de fábrica, CUIT, alícuotas de IVA, moneda, endpoints de AFIP. Sirve para tomar datos de cabecera del negocio (razón social, CUIT) pero es pura configuración.
- **mxeml (1 fila)**: configuración SMTP para envío de mails, usa la casilla `baridealtandil@gmail.com`.
- **mxpaygw (1 fila)**: configuración de gateway de pago Mercado Pago.
- **mxdoc (26 filas)**, **mxpais (240 filas)**: catálogos de tipo de documento y países — soporte de `mxcli`.
- **mxcat (9 filas)**: categorías/roles de empleado (Mozo, etc.) con permisos ofuscados — parecido a `mxemp` pero a nivel de rol.
- **mxmen (418 filas)** / **mxmensis (862 filas)** / **mxset (407 filas)** / **mxconf (73 filas)** / **mxacc (146 filas)** / **mxayudam (133 filas)** / **mxmed (30 filas)** / **mxtec (37 filas)** / **mximpres (37 filas)** / **mxgra (28 filas)** / **mxnum (15 filas)** / **mxori (80 filas)** / **mxcpb (1.196 filas)** / **mxdpar (5 filas)** / **mxlogdel (362 filas)** / **mxlogver (22 filas)** / **mxmon (22 filas)** / **mxaudtemp (21 filas)** / **mxtablalog (7 filas)** / **mxarecp (6 filas)** / **mxmensaje (6 filas)** / **mxtiponot (6 filas)** / **mxnotif (48 filas)** / **mxverfile (8 filas)** / **mxcpf (14 filas)** / **mxage (1 fila)** / **mxauth (1 fila)** / **mxban (1 fila)** / **mxbloqueo (1 fila)** / **mxcla (1 fila)** / **mxdato (1 fila)** / **mxdep (1 fila)** / **mxnotpurg (1 fila)** / **mxarec (3 filas)** / **mxcba (3 filas)** / **mxcmo (3 filas)** / **mxsrv (2 filas)** / **mxprd (9 filas)** / **mxgeo (9 filas)** / **mxter (8 filas)**: configuración interna del software (menús, ayuda, teclas, impresoras, terminales, catálogos de percepciones, logs técnicos, notificaciones del sistema). Sin relevancia directa para el dashboard de estadísticas de negocio — se listan solo para dejar constancia de que fueron relevadas.

---

## Notas de calidad de datos generales

- **Fechas "nulas" con valor 1899-11-30T04:16:48.000Z**: aparece sistemáticamente en columnas de fecha no completadas (`fecha_nac`, `fecha_ing`, `fecha_baja`, `fecha_desde`, `fecha_nac`, y puntualmente en `fecha` de `mxtuctr`). Es el resultado de convertir un campo DBF/Delphi vacío a `DATETIME` de MySQL — **tratar como NULL, nunca como fecha real**.
- **Campos "bit(1)"** llegan en el JSON como `{'type':'Buffer','data':[0]}` o `[1]}` — hay que decodificarlos como booleano (0/1) al procesar, no como buffer.
- **Encoding**: se ven caracteres corruptos en textos con tildes dentro de blobs binarios (ej. `mxter.detalle`, que es un XML/base64 con info de hardware) — no afecta a las tablas de negocio en sí, los nombres de productos y clientes en la muestra tienen tildes/ñ correctos (ej. "Buñuelos fritos", "Croquetas de jamon crudo").
- **cod_cli = 0 como "consumidor final"**: la gran mayoría de `mxfac`/`mxite` no tiene cliente real asociado (cod_cli=0, nom_cli vacío) — el análisis de clientes real solo aplica a una fracción de las ventas (las asociadas a los 522 registros de `mxcli`).
- **Fila de encabezado en mxite/mxadi con cod_art=0**: revisar antes de rankear productos, ya que no es un producto real sino un placeholder de apertura de mesa/cubierto.
- **mxemp con nombre vacío**: usar `nombreusu` como fallback para mostrar el nombre del empleado en rankings.

---

## Tablas vacías (110)

Sin filas en este volcado — se listan solo el nombre, agrupadas por afinidad de prefijo/tema:

**Lealtad / fidelización / partners**
`mxloyalty`, `mxloyaltyd`, `mxloyaltyf`, `mxfid`, `mxpartner`

**POS / hardware de cobro / gateways**
`mxpos`, `mxposconf`, `mxposdif`, `mxposgw`, `mxposlog`, `mxforgw`, `mxforpos`, `mxtergw`, `mxpaghue`, `mxpaghue`, `mxtel`

**Turno actual (mxtu*) sin uso / no aplicable a este negocio**
`mxtucaj`, `mxtuelec`, `mxtuipa`, `mxtumvs`, `mxtupadi`, `mxtupape`, `mxtupdto`, `mxtusta`

**Rendiciones de caja (turno / histórico)**
`mxrcj`, `mxrcjc`, `mxrcjm`, `mxren`, `mxrenest`, `mxrenmov`, `mxturcjc`, `mxturcjm`, `mxturen`, `mxturenest`, `mxturenmov`, `mxrmovtip`

**Delivery / pedidos web / apps**
`mxappnoti`, `mxapp`, `mxapc`, `mxord`, `mxkds`, `mxpadped`, `mxdpu`, `mxdparctv`

**Eventos / promociones**
`mxeve`, `mxeverem`, `mxevc`, `mxevi`, `mxevl`, `mxevp`, `mxevs`, `mxeva`, `mxeop`

**Facturación electrónica / fiscal (variantes no usadas)**
`mxfae`, `mxfach`, `mxfiscal`, `mxctvfuc`, `mxrelcpb`, `mxtipimp`

**Clientes (variantes/complementos no usados)**
`mxcliper`, `mxcobrel`, `mxclu`

**Auditoría / logs / sincronización (variantes no usadas)**
`mxnotilog`, `mxnotter`, `mxmlg`, `mxmlglst`, `mxmovdet`, `mxdsn`, `mxutilfild`, `mxutilfile`, `mxdif`, `mxdis`, `mxdisdet`

**Configuración / catálogos no utilizados**
`mxadirel`, `mxagg`, `mxartcb`, `mxasi`, `mxaut`, `mxayuda`, `mxcle`, `mxctg`, `mxesp`, `mxexc`, `mxgrs`, `mxinspre`, `mxinv`, `mxipa`, `mxipp`, `mxmenfav`, `mxmvsan`, `mxmvsobs`, `mxpadi`, `mxpape`, `mxpdto`, `mxper`, `mxpla`, `mxprm`, `mxrep`, `mxsec`, `mxser`, `mxsev`, `mxsoc`, `mxsop`, `mxsta`, `mxsuc`, `mxturlj`, `mxvec`, `mxver`, `mxweb`

---

## Viabilidad de métricas

### 1. Ventas: facturación por período, comparativas, proyección mensual — ✅ viable
Tablas: `mxfac` (histórico) + `mxtufac` (turno actual). Columnas `fecha`, `total`, `neto1/2/3`+`iva1/2/3`, `cod_cpb` para filtrar tipo de comprobante. Se puede agrupar por día/semana/mes/turno sin problema, comparar períodos y proyectar. Único cuidado: sumar `mxfac` + `mxtufac` para tener el total real incluyendo hoy, y no confundir `total` (con IVA) con `neto1` (sin IVA) al hacer comparativas.

### 2. Ocupación de mesas: mesas ocupadas por día y franja horaria, heatmap, días pico — ✅ viable (con matices)
Candidatas confirmadas:
- `mxcm2`/`mxtucm2` (comandas): tiene `fecha`, `hora_ped` con segundos, `mesa`, `mozo`, `cubiertos` — la mejor fuente para el heatmap de horarios pico, porque registra el momento exacto del pedido, no solo el cierre.
- `mxfac`/`mxtufac`: tiene `hora_ent`/`hora_sal` por mesa, que da la duración de la ocupación (para calcular rotación de mesas).
- `mxape` (14 filas, solo mesas abiertas ahora): útil para "ocupación en vivo" pero no para histórico, porque se vacía al cerrar la mesa.
- `mxmes` (73 filas): plano físico de mesas (posición, tamaño) — sirve para saber cuántas mesas hay y su distribución, no para ocupación en el tiempo.
- `mxctr`/`mxtuctr`: alternativa a `mxfac` con `mesa`/`cubiertos`, pero **con el defecto de fechas corruptas (1899-11-30) detectado en `mxtuctr`** — preferir `mxfac`/`mxtufac` o `mxcm2` como fuente de fecha/hora antes que `mxctr` para evitar ese problema.
Limitación: no hay una tabla de "historial de ocupación de mesa" limpia y dedicada (tipo check-in/check-out) — hay que reconstruirla combinando `hora_ent`/`hora_sal` de `mxfac` con `mesa`, lo cual funciona pero requiere cruzar por texto de mesa (`char(8)`, con espacios de padding, ej. `'   1'`, hay que hacer `TRIM()`).

### 3. Productos: ranking de más/menos vendidos, filtrable por fecha/franja — ✅ viable
`mxite`/`mxtuite` (detalle de ítems vendidos, con `cantidad`, `precio`, `fecha`, `cod_art`) relacionado con `mxart` (nombre, categoría vía `cod_rua`/`cod_sua`). Se puede filtrar por fecha, día de semana (derivado de `fecha`) y franja horaria cruzando con `hora_ped` de `mxcm2` (por número de comprobante) o `hora_ent` de `mxfac`. Único cuidado: excluir la fila `cod_art=0` que aparece como encabezado/placeholder en varias líneas de `mxite`.

### 4. Personal/camareros: ranking de ventas por empleado, comparable entre períodos — ✅ viable
`mxemp` (maestro de empleados) relacionado con `mxfac.cod_emp` (mozo que atendió) y `mxctc`/`mxctr` para ver si además cobró. También se puede cruzar `mxcm2.mozo` para ranking de "más comandas tomadas" además de "más facturación". Cuidado con `mxemp.nombre` vacío en varios registros — usar `nombreusu` como fallback. También hay `mxhor` (fichadas) si se quisiera cruzar ventas por hora efectivamente trabajada, aunque no fue pedido explícitamente.

### 5. Descuentos: importe y % por motivo y por encargado, comparativas — ⚠️ viable con interpretación parcial
`mxfac.cod_dto`+`imp_dto` (descuento a nivel de todo el comprobante) y `mxite.cod_dto`+`imp_dto` (descuento a nivel de línea) dan el importe. El motivo/nombre del descuento sale de `mxdto` (catálogo), pero **solo tiene 3 tipos configurados** ('Descuento %', 'Descuento $', 'EFECTIVO'), así que la granularidad de "motivo" es baja — no hay categorías de descuento ricas (ej. "descuento por cumpleaños", "descuento gerencial") más allá de esos 3 códigos. El "encargado" que aplicó el descuento no está en `mxfac`/`mxite` directamente (no hay columna tipo `cod_emp_dto`) — para saber quién autorizó un descuento hay que recurrir a `mxaud.detalle` (texto libre tipo "11:34 CAJERO1 ..."), que requiere parseo de texto y no es 100% confiable como fuente estructurada. Conclusión: el importe y % de descuento es sólido, pero "por motivo" y "por encargado" quedan limitados por la pobreza del catálogo `mxdto` y la falta de columna estructurada de responsable.

### 6. Compras/proveedores: ranking, deudas, comparativas mes vs mes — ✅ viable
Se **descarta la sospecha del usuario de que no se cargan compras**: `mxpro` (301 proveedores reales de Tandil/zona), `mxgas` (6.684 comprobantes de compra con proveedor, fecha, importe, tipo de comprobante fiscal) e `mxitc` (10.044 líneas de detalle) muestran compras reales y bien estructuradas, con proveedores identificables (Avicola Los Pinos, Bodega La Rural, BEER TAN S.A., etc.). `mxpag` (6.684 filas, misma cardinalidad que `mxgas`) permite calcular pagos y así derivar deuda pendiente (comprobante sin pago asociado, o suma pagos < total del comprobante).
**Vigencia confirmada con query en vivo (2026-07-05)**: `mxgas.fecha` llega hasta 2026-07-01 y el volumen mensual es constante y activo (entre 370 y 610 comprobantes/mes durante todo el último año, sin caídas ni abandono). Se sigue cargando con normalidad. Nota: `MIN(fecha)` de `mxgas` da `1899-11-30` (el mismo epoch nulo de fechas DBF vacías descrito arriba) — hay registros viejos con fecha no cargada, hay que filtrarlos con `WHERE fecha > '1900-01-01'` o similar al calcular históricos.

### 7. En vivo: facturación del día actual en tiempo real — ✅ viable
`mxtufac` (185 filas, turno actual) confirmado con fecha de hoy (2026-07-05) en la muestra. Complementable con `mxtuite` (ítems del turno), `mxtuctc` (cobros del turno), `mxtuctr` (controles del turno) y el singleton `mxpaa` que ya trae un snapshot agregado del día (`cubisact`/`cubisant`/`cubistot`, `saldocaja`, `last_mod`) — potencialmente el atajo más simple para un contador "en vivo" sin tener que sumar filas.

---

### Resumen de viabilidad

| Métrica | Estado |
|---|---|
| Ventas (facturación, comparativas, proyección) | ✅ |
| Ocupación de mesas / heatmap horarios | ✅ (con reconstrucción vía mxcm2/mxfac, cuidado con mxctr) |
| Ranking de productos | ✅ |
| Ranking de personal/camareros | ✅ |
| Descuentos por motivo/encargado | ⚠️ (catálogo de motivos pobre, sin columna de responsable estructurada) |
| Compras/proveedores | ✅ (vigencia confirmada hasta 2026-07-01, carga constante y activa) |
| En vivo (turno actual) | ✅ |
