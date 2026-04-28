"""Database session management"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    """FastAPI dependency — yields one session per request"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Inisialisasi database — jalankan schema.sql jika tabel belum ada"""
    import pathlib, asyncpg
    schema_path = pathlib.Path(__file__).parents[3] / "database" / "schema.sql"
    if not schema_path.exists():
        log.warning(f"Schema file tidak ditemukan: {schema_path}")
        return
    schema_sql = schema_path.read_text()
    # Gunakan koneksi asyncpg langsung karena SQLAlchemy tidak suka multi-statement
    raw_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    try:
        conn = await asyncpg.connect(raw_url)
        await conn.execute(schema_sql)
        await conn.close()
        log.info("Database schema initialized")
    except Exception as e:
        log.error(f"Failed init DB: {e}")
