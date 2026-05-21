import asyncpg
import os
import re
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://root:root@localhost:5432/udelearning")

# --- BẮT ĐẦU: MONKEY PATCH ĐỂ IN CÂU LỆNH SQL ---
# Ghi đè các hàm của asyncpg để tự động in câu lệnh SQL ra terminal
methods_to_patch = ['execute', 'fetch', 'fetchrow', 'fetchval']
for method_name in methods_to_patch:
    original_method = getattr(asyncpg.Connection, method_name)
    
    def make_logged_method(orig_method):
        async def logged_method(self, query, *args, **kwargs):
            # Xóa khoảng trắng thừa để in cho gọn
            clean_query = " ".join(query.split())
            print(f"\n📝 [SQL GỬI ĐẾN DB] {clean_query}")
            if args:
                print(f"   [Tham số] {args}")
            return await orig_method(self, query, *args, **kwargs)
        return logged_method
        
    setattr(asyncpg.Connection, method_name, make_logged_method(original_method))
# --- KẾT THÚC: MONKEY PATCH ---

# --- BẮT ĐẦU: LOG LISTENER ĐỂ IN TRIGGER ---
def db_log_listener(con, msg):
    # Trích xuất tên hàm Trigger từ context
    trigger_name = "N/A"
    if hasattr(msg, 'context') and msg.context:
        match = re.search(r'function\s+([^\(]+)', msg.context)
        if match:
            trigger_name = match.group(1)
        else:
            trigger_name = msg.context.split('\n')[0]
            
    print(f"🐘 [TRIGGER THỰC THI] Hàm: {trigger_name} | {msg.severity}: {msg.message}")

async def setup_connection(conn):
    conn.add_log_listener(db_log_listener)
# --- KẾT THÚC: LOG LISTENER ---

async def get_db_pool():
    # Create a connection pool to be used across all API requests
    return await asyncpg.create_pool(DATABASE_URL, setup=setup_connection)
