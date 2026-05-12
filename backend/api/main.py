from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import get_pool, close_pool
from app.routers import specimens, meta, images, downloads


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: warm the connection pool
    await get_pool()
    yield
    # Shutdown: close connections cleanly
    await close_pool()


app = FastAPI(
    title="Herbarium API",
    description="Backend API for the SRGH Herbarium specimen collection",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow the frontend dev server and production origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(specimens.router)
app.include_router(meta.router)
app.include_router(images.router)
app.include_router(downloads.router)


@app.get("/health")
async def health():
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
    return {"status": "ok"}