-- Required for zone polygons (ST_GeomFromText, ST_Contains, etc.)
CREATE EXTENSION IF NOT EXISTS postgis;

-- PG15+ revokes CREATE on public; Prisma needs postgres to own/use public (avoids P1010 on fresh volumes)
ALTER SCHEMA public OWNER TO postgres;
GRANT USAGE, CREATE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO public;
