from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/cart", tags=["Cart"])


class AddCartRequest(BaseModel):
    user_id: int
    course_id: int


class CheckoutRequest(BaseModel):
    user_id: int
    coupon_code: str | None = None


@router.get("/{user_id}")
async def get_cart(request: Request, user_id: int):
    pool = request.app.state.pool

    query = """
    SELECT 
        ci.id AS cart_item_id,
        c.id AS course_id,
        c.title,
        ci.unit_price,
        ci.quantity,
        ci.unit_price * ci.quantity AS line_total
    FROM carts cart
    JOIN cart_items ci ON ci.cart_id = cart.id
    JOIN courses c ON c.id = ci.course_id
    WHERE cart.user_id = $1
      AND cart.status = 'active'
    ORDER BY ci.id DESC;
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, user_id)

    items = [dict(r) for r in rows]

    subtotal = sum(float(i["line_total"]) for i in items)

    return {
        "success": True,
        "items": items,
        "subtotal": subtotal
    }


@router.post("/add")
async def add_to_cart(request: Request, payload: AddCartRequest):
    pool = request.app.state.pool

    query = """
    INSERT INTO cart_items(cart_id, course_id, quantity, unit_price)
    SELECT cart.id, $2, 1, c.price
    FROM carts cart
    JOIN courses c ON c.id = $2
    WHERE cart.user_id = $1
      AND cart.status = 'active'
    ON CONFLICT (cart_id, course_id)
    DO UPDATE SET updated_at = NOW()
    RETURNING id;
    """

    async with pool.acquire() as conn:
        cart_item_id = await conn.fetchval(
            query,
            payload.user_id,
            payload.course_id
        )

    return {
        "success": True,
        "message": "Đã thêm khóa học vào giỏ hàng.",
        "cart_item_id": cart_item_id
    }
@router.post("/checkout")
async def checkout_cart(request: Request, payload: CheckoutRequest):
    pool = request.app.state.pool

    async with pool.acquire() as conn:
        async with conn.transaction():
            cart = await conn.fetchrow("""
                SELECT id
                FROM carts
                WHERE user_id = $1 AND status = 'active'
                FOR UPDATE;
            """, payload.user_id)

            if not cart:
                return {"success": False, "message": "Không tìm thấy giỏ hàng."}

            items = await conn.fetch("""
                SELECT ci.course_id, ci.unit_price, ci.quantity
                FROM cart_items ci
                WHERE ci.cart_id = $1
                FOR UPDATE;
            """, cart["id"])

            if not items:
                return {"success": False, "message": "Giỏ hàng đang trống."}

            subtotal = sum(i["unit_price"] * i["quantity"] for i in items)
            discount = 0
            coupon_id = None

            total = subtotal - discount

            order_id = await conn.fetchval("""
                INSERT INTO orders(
                    user_id, coupon_id, subtotal_amount,
                    discount_amount, total_amount,
                    currency, status
                )
                VALUES ($1, $2, $3, $4, $5, 'VND', 'pending')
                RETURNING id;
            """, payload.user_id, coupon_id, subtotal, discount, total)

            for item in items:
                await conn.execute("""
                    INSERT INTO order_items(order_id, course_id, price)
                    VALUES ($1, $2, $3);
                """, order_id, item["course_id"], item["unit_price"])

            payment_id = await conn.fetchval("""
                INSERT INTO payments(order_id, method, amount, status)
                VALUES ($1, 'wallet', $2, 'paid')
                RETURNING id;
            """, order_id, total)

            await conn.execute("""
                DELETE FROM cart_items WHERE cart_id = $1;
            """, cart["id"])

    return {
        "success": True,
        "message": "Checkout giỏ hàng thành công.",
        "order_id": order_id,
        "payment_id": payment_id,
        "total_amount": float(total)
    }