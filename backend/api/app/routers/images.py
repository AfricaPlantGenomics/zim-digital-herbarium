from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from asyncpg import Pool

from app.database import get_pool

router = APIRouter(prefix="/images", tags=["images"])


async def pool_dep() -> Pool:
    return await get_pool()


@router.get("/{plant_id}/first")
async def get_first_image(plant_id: str, pool: Pool = Depends(pool_dep)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT filename FROM specimen_images WHERE plant_id = $1 ORDER BY rotation LIMIT 1",
            plant_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail=f"No images for '{plant_id}'")
    return RedirectResponse(url=f"/images/fullsize/{row['filename']}", status_code=302)


@router.get("/{plant_id}/{rotation}")
async def get_image(plant_id: str, rotation: str, pool: Pool = Depends(pool_dep)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT filename FROM specimen_images WHERE plant_id = $1 AND rotation = $2",
            plant_id, rotation,
        )
    if not row:
        raise HTTPException(status_code=404, detail=f"No '{rotation}' image for '{plant_id}'")
    return RedirectResponse(url=f"/images/fullsize/{row['filename']}", status_code=302)


@router.get("/{plant_id}")
async def list_images(plant_id: str, pool: Pool = Depends(pool_dep)):
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT rotation, filename, file_size FROM specimen_images WHERE plant_id = $1 ORDER BY rotation",
            plant_id,
        )
    if not rows:
        raise HTTPException(status_code=404, detail=f"No images for '{plant_id}'")
    return [
        {
            "plant_id": plant_id,
            "rotation": row["rotation"],
            "filename": row["filename"],
            "file_size": row["file_size"],
            "url": f"/images/fullsize/{row['filename']}",
            "thumb_url": f"/images/thumbs/{plant_id}.jpg",
        }
        for row in rows
    ]
