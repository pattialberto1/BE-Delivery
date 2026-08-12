# Pruebas del esquema

Corren las migraciones contra un PostgreSQL limpio y verifican que las reglas
de negocio de la base funcionen: constraints, triggers, vistas y auditoría.

Sirven para no descubrir un error de SQL en medio del montaje, con el local
esperando.

## Correrlas

Hace falta PostgreSQL instalado (no el de Supabase, uno local cualquiera).

```bash
# 1. Levantar un servidor temporal
export PGDATA=/var/tmp/pgprueba
initdb -D "$PGDATA" -U postgres --auth=trust
pg_ctl -D "$PGDATA" -o '-k /var/tmp -p 5433' -l /var/tmp/pg.log start

# 2. Simular lo que Supabase trae de fábrica (esquemas auth y storage)
psql -h /var/tmp -p 5433 -U postgres -v ON_ERROR_STOP=1 \
  -f supabase/pruebas/00_supabase_simulado.sql

# 3. Correr las migraciones, en orden
for f in supabase/migrations/*.sql; do
  psql -h /var/tmp -p 5433 -U postgres -v ON_ERROR_STOP=1 -f "$f"
done

# 4. Probar las reglas
psql -h /var/tmp -p 5433 -U postgres -v ON_ERROR_STOP=1 \
  -f supabase/pruebas/01_reglas.sql
```

Los diez bloques deben imprimir `OK`.

## Qué comprueban

| # | Comprueba |
|---|---|
| 1 | La tarifa de la zona queda copiada dentro de la orden |
| 2 | La misma factura no se puede cargar dos veces en un día |
| 3 | Un pago móvil sin cuenta receptora se rechaza |
| 4 | El efectivo no necesita referencia |
| 5 | Dos referencias **cortas** iguales conviven — con 4 dígitos chocan solas |
| 6 | Dos referencias **completas** iguales sí se rechazan |
| 7 | La vista convierte los bolívares a dólares y calcula el descuadre |
| 8 | La liquidación agrupa las carreras por repartidor |
| 9 | Un día cerrado queda congelado |
| 10 | La auditoría registra quién hizo cada cosa |

## Lo que NO cubren

Las pruebas corren como superusuario, así que **RLS no se evalúa**: los permisos
por rol quedan sin verificar aquí. Eso se prueba en la app, entrando como cajera
y confirmando que no puede cerrar la jornada ni ver Configuración.
