import asyncio
import asyncpg
import sys

async def main():
    # Connect to default postgres db to create the new one
    try:
        conn = await asyncpg.connect("postgresql://root:root@localhost:5432/postgres")
        await conn.execute("CREATE DATABASE udelearning")
        await conn.close()
        print("Created database udelearning")
    except asyncpg.exceptions.DuplicateDatabaseError:
        print("Database udelearning already exists")
    except Exception as e:
        print(f"Error creating DB: {e}")
        
    # Connect to the new DB and run init_db.sql
    try:
        conn = await asyncpg.connect("postgresql://root:root@localhost:5432/udelearning")
        with open("init_db.sql", "r") as f:
            sql = f.read()
        await conn.execute(sql)
        await conn.close()
        print("Initialized database tables and triggers")
    except Exception as e:
        print(f"Error initializing DB: {e}")

asyncio.run(main())
