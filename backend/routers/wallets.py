from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/wallets", tags=["Wallets"])

class PaymentRequest(BaseModel):
    course_id: int
    price: float
    user_id: int = 3 # Mặc định dùng sinh viên Văn Bảo (ID 3) để chạy Demo

@router.post("/pay")
async def pay_with_wallet(request: Request, payload: PaymentRequest):
    pool = request.app.state.pool
    
    async with pool.acquire() as conn:
        # Sử dụng database transaction để đảm bảo tính toàn vẹn dữ liệu
        async with conn.transaction():
            try:
                # 1. Tạo đơn hàng (Order) ở trạng thái 'pending'
                query_order = """
                    INSERT INTO orders (user_id, subtotal_amount, discount_amount, total_amount, currency, status)
                    VALUES ($1, $2, 0.00, $2, 'VND', 'pending')
                    RETURNING id;
                """
                order_id = await conn.fetchval(query_order, payload.user_id, payload.price)
                
                # 2. Tạo chi tiết đơn hàng (Order Item)
                query_item = """
                    INSERT INTO order_items (order_id, course_id, price)
                    VALUES ($1, $2, $3);
                """
                await conn.execute(query_item, order_id, payload.course_id, payload.price)
                
                # 3. Tạo thanh toán (Payment) ở trạng thái 'paid'.
                # Bước này sẽ kích hoạt trigger trg_process_wallet_payment (trừ tiền)
                # và trg_handle_payment_paid (mở khóa học, ghi log, tính doanh thu giảng viên)
                query_payment = """
                    INSERT INTO payments (order_id, method, amount, status)
                    VALUES ($1, 'wallet', $2, 'paid')
                    RETURNING id;
                """
                payment_id = await conn.fetchval(query_payment, order_id, payload.price)
                
                return {
                    "success": True, 
                    "message": "Thanh toán thành công! Trực tiếp trừ tiền ví và mở khóa học.", 
                    "order_id": order_id,
                    "payment_id": payment_id
                }
            except Exception as e:
                # Nếu có lỗi (Ví dụ: Không đủ tiền, mua trùng), transaction sẽ rollback tự động
                raise e

@router.get("/balance/{user_id}")
async def get_wallet_balance(request: Request, user_id: int):
    pool = request.app.state.pool
    query = "SELECT balance FROM wallets WHERE user_id = $1 AND is_active = TRUE"
    balance = await pool.fetchval(query, user_id)
    if balance is None:
        return {"success": False, "message": "Không tìm thấy ví cho người dùng này."}
    return {"success": True, "balance": float(balance)}

class TopupRequest(BaseModel):
    user_id: int
    amount: float

@router.post("/topup")
async def topup_wallet(request: Request, payload: TopupRequest):
    pool = request.app.state.pool
    
    query_topup = """
        INSERT INTO wallet_topups (user_id, amount, status, method)
        VALUES ($1, $2, 'paid', 'bank_transfer')
        RETURNING id;
    """
    
    async with pool.acquire() as conn:
        topup_id = await conn.fetchval(query_topup, payload.user_id, payload.amount)
        return {"success": True, "message": f"Nạp {payload.amount} thành công!", "topup_id": topup_id}

