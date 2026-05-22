from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import asyncpg
from contextlib import asynccontextmanager

from database import get_db_pool
from routers import courses, wallets, users, carts


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = await get_db_pool()
    yield
    await app.state.pool.close()


app = FastAPI(
    lifespan=lifespan,
    title="UdeLearning API"
)

# Enable CORS for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Production thì đổi domain cụ thể
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(courses.router)
app.include_router(wallets.router)
app.include_router(users.router)
app.include_router(carts.router)


# GLOBAL ERROR HANDLER for PostgreSQL Exceptions
@app.exception_handler(asyncpg.exceptions.RaiseError)
async def postgres_trigger_exception_handler(
    request: Request,
    exc: asyncpg.exceptions.RaiseError
):
    print(f"DB Trigger Exception: {exc.sqlstate} - {exc.message}")

    return JSONResponse(
        status_code=400,
        content={
            "success": False,
            "message": exc.message
        },
    )


# Generic exception handler for other database errors
@app.exception_handler(asyncpg.exceptions.PostgresError)
async def postgres_generic_exception_handler(
    request: Request,
    exc: asyncpg.exceptions.PostgresError
):
    print(f"DB Generic Exception: {exc.sqlstate} - {exc.message}")

    return JSONResponse(
        status_code=400,
        content={
            "success": False,
            "message": "Lỗi cơ sở dữ liệu: " + exc.message
        },
    )


@app.get("/")
def read_root():
    return {
        "message": "Welcome to UdeLearning API"
    }