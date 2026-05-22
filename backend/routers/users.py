from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import List

router = APIRouter(prefix="/api/users", tags=["Users"])

class UserRegisterRequest(BaseModel):
    email: str
    full_name: str

@router.post("/register")
async def register_user(request: Request, payload: UserRegisterRequest):
    pool = request.app.state.pool
    
    # Insert user (this will trigger trg_create_wallet_for_user)
    query = """
        INSERT INTO users (email, password_hash, full_name, status)
        VALUES ($1, 'hash_demo', $2, 'active')
        RETURNING id, email, full_name;
    """
    
    async with pool.acquire() as conn:
        record = await conn.fetchrow(query, payload.email, payload.full_name)
        return {
            "success": True, 
            "message": "Đăng ký thành viên thành công! Ví cá nhân được tự động tạo bởi Database Trigger.",
            "user": {
                "id": record["id"],
                "email": record["email"],
                "full_name": record["full_name"]
            }
        }

@router.get("/list")
async def list_users(request: Request):
    pool = request.app.state.pool
    query = "SELECT id, email, full_name FROM users ORDER BY id ASC LIMIT 200"
    
    async with pool.acquire() as conn:
        records = await conn.fetch(query)
        users = [dict(record) for record in records]
        return {"success": True, "users": users}
