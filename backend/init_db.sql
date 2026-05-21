-- init_db.sql – tạo bảng và trigger cho dự án UdeLearning

-- 1. Bảng users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
);

-- 2. Bảng wallets
CREATE TABLE IF NOT EXISTS wallets (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(user_id)
);

-- 3. Bảng courses
CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(12,2) NOT NULL,
    rating_avg NUMERIC(3,2) DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    instructor_id INT -- optional, reference to users
);

-- 4. Bảng orders
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    subtotal_amount NUMERIC(12,2) NOT NULL,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Bảng order_items
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    course_id INT NOT NULL REFERENCES courses(id),
    price NUMERIC(12,2) NOT NULL
);

-- 6. Bảng payments
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    method VARCHAR(20) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Bảng wallet_topups
CREATE TABLE IF NOT EXISTS wallet_topups (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    amount NUMERIC(12,2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    method VARCHAR(30),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Bảng user_courses (để mở khóa khóa học)
CREATE TABLE IF NOT EXISTS user_courses (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, course_id)
);

-- 9. Bảng revenue_logs (lưu phần chia doanh thu)
CREATE TABLE IF NOT EXISTS revenue_logs (
    id SERIAL PRIMARY KEY,
    payment_id INT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    instructor_id INT NOT NULL,
    instructor_amount NUMERIC(12,2) NOT NULL,
    platform_amount NUMERIC(12,2) NOT NULL,
    logged_at TIMESTAMPTZ DEFAULT now()
);

-- -------------------------------------------------
-- Trigger Functions & Triggers
-- -------------------------------------------------

-- 1. Tạo ví tự động khi tạo người dùng
CREATE OR REPLACE FUNCTION fn_create_wallet_for_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO wallets (user_id, balance, is_active)
    VALUES (NEW.id, 0, TRUE);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_wallet_for_user
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION fn_create_wallet_for_user();

-- 2. Trừ tiền ví khi thanh toán (BEFORE INSERT để kiểm tra số dư)
CREATE OR REPLACE FUNCTION fn_process_wallet_payment()
RETURNS TRIGGER AS $$
DECLARE
    wallet_balance NUMERIC;
BEGIN
    SELECT balance INTO wallet_balance FROM wallets WHERE user_id = NEW.user_id AND is_active;
    IF wallet_balance IS NULL THEN
        RAISE EXCEPTION 'Wallet not found for user %', NEW.user_id;
    END IF;
    IF wallet_balance < NEW.amount THEN
        RAISE EXCEPTION 'Insufficient funds in wallet for user %', NEW.user_id;
    END IF;
    UPDATE wallets SET balance = balance - NEW.amount WHERE user_id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_process_wallet_payment
BEFORE INSERT ON payments
FOR EACH ROW
EXECUTE FUNCTION fn_process_wallet_payment();

-- 3. Khi payment.status = 'paid' mở khóa khóa học và ghi doanh thu
CREATE OR REPLACE FUNCTION fn_handle_payment_paid()
RETURNS TRIGGER AS $$
DECLARE
    instructor_id INT;
    course_price NUMERIC;
    instructor_share NUMERIC;
    platform_share NUMERIC;
BEGIN
    -- Mở khóa khóa học
    INSERT INTO user_courses (user_id, course_id)
    SELECT NEW.user_id, o.id
    FROM orders o
    WHERE o.id = NEW.order_id
    ON CONFLICT DO NOTHING;

    -- Lấy thông tin khóa học để tính chia doanh thu
    SELECT c.instructor_id, c.price INTO instructor_id, course_price
    FROM courses c
    JOIN order_items oi ON oi.course_id = c.id
    WHERE oi.order_id = NEW.order_id;

    IF instructor_id IS NOT NULL THEN
        instructor_share := course_price * 0.7;
        platform_share := course_price * 0.3;
        INSERT INTO revenue_logs (payment_id, instructor_id, instructor_amount, platform_amount)
        VALUES (NEW.id, instructor_id, instructor_share, platform_share);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_handle_payment_paid
AFTER INSERT ON payments
FOR EACH ROW
WHEN (NEW.status = 'paid')
EXECUTE FUNCTION fn_handle_payment_paid();

-- 4. Áp dụng nạp tiền vào ví khi wallet_topups.status = 'paid'
CREATE OR REPLACE FUNCTION fn_apply_wallet_topup()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE wallets SET balance = balance + NEW.amount WHERE user_id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_apply_wallet_topup
AFTER INSERT ON wallet_topups
FOR EACH ROW
WHEN (NEW.status = 'paid')
EXECUTE FUNCTION fn_apply_wallet_topup();

-- -------------------------------------------------
-- Indexes for full‑text search (used by courses router)
-- -------------------------------------------------
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS textsearchable_index_col tsvector;

CREATE OR REPLACE FUNCTION f_immutable_unaccent(text) RETURNS text IMMUTABLE LANGUAGE sql AS $$
    SELECT unaccent($1);
$$;

CREATE INDEX IF NOT EXISTS idx_courses_fulltext ON courses USING GIN (textsearchable_index_col);

-- Populate tsvector column (run once after data import)
UPDATE courses SET textsearchable_index_col = to_tsvector('simple', f_immutable_unaccent(title || ' ' || description));
