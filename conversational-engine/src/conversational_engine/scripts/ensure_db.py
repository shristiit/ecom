from __future__ import annotations

from psycopg import connect

from conversational_engine.config.settings import get_settings


def quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def admin_database_url(database_url: str) -> tuple[str, str]:
    if '://' not in database_url:
        raise ValueError('Invalid database URL')

    scheme, rest = database_url.split('://', 1)
    authority, _, tail = rest.partition('/')
    database_name, separator, query = tail.partition('?')
    if not database_name:
        raise ValueError('Database URL must include a database name')

    admin_rest = authority + '/postgres'
    if separator:
        admin_rest += '?' + query
    return f'{scheme}://{admin_rest}', database_name


def main() -> None:
    settings = get_settings()
    admin_url, database_name = admin_database_url(settings.database_url)

    if database_name == 'postgres':
        print('Database URL already points to postgres; skipping database creation')
        return

    with connect(admin_url, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute('SELECT 1 FROM pg_database WHERE datname = %s', (database_name,))
        if cur.fetchone():
            print(f'Database {database_name} already exists')
            return

        print(f'Creating database {database_name}')
        cur.execute(f'CREATE DATABASE {quote_identifier(database_name)}')
        print(f'Created database {database_name}')


if __name__ == '__main__':
    main()
