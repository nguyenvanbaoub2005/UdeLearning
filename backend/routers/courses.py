from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/courses", tags=["Courses"])

@router.get("/search")
async def search_courses(request: Request, keyword: str = ""):
    pool = request.app.state.pool
    
    if not keyword.strip():
        # If no keyword, return all published courses
        query = """
            SELECT id, title, description, price, rating_avg 
            FROM courses 
            WHERE status = 'published'
            LIMIT 10;
        """
        async with pool.acquire() as conn:
            records = await conn.fetch(query)
            return {"success": True, "data": [dict(r) for r in records]}

    # Transform "lap trinh" -> "lap:* & trinh:*" cho tìm kiếm từng phần (prefix matching)
    words = keyword.split()
    ts_query = ' & '.join([f"{w}:*" for w in words])
    
    # Ưu tiên:
    # 1. Khớp title (ILIKE) -> đưa lên đầu
    # 2. Khớp description (FTS hoặc ILIKE) -> xếp sau
    query = """
        SELECT id, title, description, price, rating_avg 
        FROM courses 
        WHERE (
            textsearchable_index_col @@ to_tsquery('simple', f_immutable_unaccent($1))
            OR unaccent(title) ILIKE unaccent('%' || $2 || '%')
            OR unaccent(description) ILIKE unaccent('%' || $2 || '%')
        )
        AND status = 'published'
        ORDER BY 
            (unaccent(title) ILIKE unaccent('%' || $2 || '%')) DESC,
            id ASC
        LIMIT 10;
    """
    
    async with pool.acquire() as conn:
        records = await conn.fetch(query, ts_query, keyword)
        return {"success": True, "data": [dict(r) for r in records]}
