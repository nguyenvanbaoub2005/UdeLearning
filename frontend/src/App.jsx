import { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [keyword, setKeyword] = useState('');
  const [courses, setCourses] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeUserId, setActiveUserId] = useState(3);
  const [walletBalance, setWalletBalance] = useState(0);
  const [message, setMessage] = useState('');
  const [cartItems, setCartItems] = useState([]);
  const [cartSubtotal, setCartSubtotal] = useState(0);
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [logs, setLogs] = useState([]);
  const debounceTimeout = useRef(null);

  const showMessage = (text, duration = 5000) => {
    setMessage(text);
    setTimeout(() => setMessage(''), duration);
  };
  const addLog = (text) => {
    const time = new Date().toLocaleTimeString('vi-VN');
    setLogs(prev => [`[${time}] ${text}`, ...prev].slice(0, 20));
  };
  const fetchUsers = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/users/list');
      const data = await res.json();
      if (data.success) setUsers(data.users);
    } catch (err) {
      console.error('Lỗi lấy danh sách người dùng:', err);
    }
  };

  const fetchWalletBalance = async (uid) => {
    addLog(`SELECT * FROM wallets WHERE user_id = ${uid}`);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/wallets/balance/${uid}`);
      const data = await res.json();
      setWalletBalance(data.success ? data.balance : 0);
    } catch (err) {
      console.error('Lỗi lấy số dư ví:', err);
      setWalletBalance(0);
    }
  };

  const fetchCart = async (uid = activeUserId) => {
    addLog(`SELECT ci.*, c.title FROM cart_items ci JOIN carts cart ON ci.cart_id = cart.id JOIN courses c ON c.id = ci.course_id WHERE cart.user_id = ${uid}`);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/cart/${uid}`);
      const data = await res.json();

      if (data.success) {
        setCartItems(data.items || []);
        setCartSubtotal(data.subtotal || 0);
      } else {
        setCartItems([]);
        setCartSubtotal(0);
      }
    } catch (err) {
      console.error('Lỗi lấy giỏ hàng:', err);
      setCartItems([]);
      setCartSubtotal(0);
    }
  };

  const handleSearch = (e) => {
    const val = e.target.value;
    addLog(`SELECT * FROM courses WHERE keyword LIKE '%${val}%'`);
    setKeyword(val);

    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

    debounceTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `http://127.0.0.1:8000/api/courses/search?keyword=${encodeURIComponent(val)}`
        );
        const data = await res.json();
        if (data.success) setCourses(data.data);
      } catch (err) {
        console.error(err);
      }
    }, 300);
  };

  useEffect(() => {
    handleSearch({ target: { value: '' } });
    fetchUsers();
    fetchWalletBalance(activeUserId);
    fetchCart(activeUserId);
  }, []);

  const handleUserChange = (e) => {
    const uid = parseInt(e.target.value, 10);
    addLog(`SWITCH USER -> user_id = ${uid}`);
    setActiveUserId(uid);
    fetchWalletBalance(uid);
    fetchCart(uid);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    addLog(`INSERT INTO users(email, full_name) VALUES ('${newEmail}', '${newFullName}') -> trigger tạo wallet`);

    if (!newFullName || !newEmail) {
      alert('Vui lòng điền đầy đủ Tên và Email!');
      return;
    }

    try {
      const res = await fetch('http://127.0.0.1:8000/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, full_name: newFullName }),
      });

      const data = await res.json();

      if (data.success) {
        showMessage(data.message);
        setNewFullName('');
        setNewEmail('');
        await fetchUsers();
        setActiveUserId(data.user.id);
        fetchWalletBalance(data.user.id);
        fetchCart(data.user.id);
      } else {
        showMessage(`Lỗi đăng ký: ${data.message}`);
      }
    } catch (err) {
      console.error(err);
      showMessage('Lỗi kết nối đến Backend!');
    }
  };

  const handleAddToCart = async (courseId) => {
    addLog(`INSERT INTO cart_items(cart_id, course_id, quantity, unit_price) SELECT cart.id, ${courseId}, 1, courses.price WHERE user_id = ${activeUserId}`);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/cart/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: activeUserId, course_id: courseId }),
      });

      const data = await res.json();
      showMessage(data.message || 'Đã thêm vào giỏ hàng.');

      if (data.success) fetchCart(activeUserId);
    } catch (err) {
      console.error(err);
      showMessage('Lỗi kết nối đến Backend!');
    }
  };

  const handleCheckoutCart = async () => {
    addLog(`CHECKOUT user_id=${activeUserId}: INSERT orders -> order_items -> payments(status='paid') -> triggers trừ ví/enroll/chia tiền`);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/cart/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: activeUserId }),
      });

      const data = await res.json();

      if (data.success) {
        const total = Number(data.total_amount || cartSubtotal);
        showMessage(`Thanh toán thành công ${total.toLocaleString('vi-VN')} đ`);
        fetchWalletBalance(activeUserId);
        fetchCart(activeUserId);
      } else {
        showMessage(data.message || 'Thanh toán thất bại.');
      }
    } catch (err) {
      console.error(err);
      showMessage('Lỗi kết nối đến Backend!');
    }
  };

  const handleTopup = async () => {
    try {
      const amount = 200000;
      addLog(`INSERT INTO wallet_topups(user_id=${activeUserId}, amount=${amount}, status='paid') -> trigger cộng tiền ví`);
      const res = await fetch('http://127.0.0.1:8000/api/wallets/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: activeUserId, amount }),
      });

      const data = await res.json();

      if (data.success) {
        showMessage(data.message, 3000);
        fetchWalletBalance(activeUserId);
      } else {
        showMessage('Nạp tiền thất bại.', 3000);
      }
    } catch (err) {
      console.error(err);
      showMessage('Lỗi kết nối đến Backend!');
    }
  };

  return (
    <div className="ude-container">
      <header className="ude-header">
        <div className="header-left">
          <h1>UdeLearning Showcase</h1>

          <div className="user-selector-container">
            <label htmlFor="user-select">Chọn tài khoản: </label>
            <select
              id="user-select"
              value={activeUserId}
              onChange={handleUserChange}
              className="user-select"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.email})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="wallet-card-container">
          <div className="wallet-card">
            <span>Ví: </span>
            <strong>{Number(walletBalance).toLocaleString('vi-VN')} VND</strong>
          </div>

          <button onClick={handleTopup} className="topup-btn">
            Nạp 200K (Trigger)
          </button>
        </div>
      </header>

      {message && (
        <div className={`message-toast ${message.includes('Lỗi') || message.includes('thất bại') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      <div className="showcase-grid">
        <div className="main-content">
          <section className="search-section">
            <h2>Nhập để tìm kiếm khoá học</h2>

            <input
              type="text"
              placeholder="Nhập tên khóa học..."
              value={keyword}
              onChange={handleSearch}
              className="search-input"
            />
          </section>

          <section className="courses-section">
            <h2>Danh sách khóa học</h2>

            <div className="courses-grid">
              {courses.length === 0 ? (
                <p>Không tìm thấy khóa học nào.</p>
              ) : (
                courses.map((course) => (
                  <div key={course.id} className="course-card">
                    <h3>{course.title}</h3>
                    <p className="desc">{course.description}</p>

                    <div className="course-footer">
                      <span className="price">
                        {Number(course.price).toLocaleString('vi-VN')} đ
                      </span>

                      <button
                        onClick={() => handleAddToCart(course.id)}
                        className="buy-btn"
                      >
                        Thêm vào giỏ
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="sidebar">
          <section className="register-section">
            <h3>Giỏ hàng của user #{activeUserId}</h3>

            {cartItems.length === 0 ? (
              <p>Giỏ hàng trống.</p>
            ) : (
              <>
                {cartItems.map((item) => (
                  <div
                    key={item.cart_item_id}
                    className="cart-item"
                    style={{ color: 'white', marginBottom: '12px' }}
                  >
                    <b>{item.title}</b>
                    <p>
                      {Number(item.unit_price).toLocaleString('vi-VN')} đ
                      {item.quantity > 1 ? ` x ${item.quantity}` : ''}
                    </p>
                  </div>
                ))}

                <h4>
                  Tổng: {Number(cartSubtotal).toLocaleString('vi-VN')} đ
                </h4>

                <button onClick={handleCheckoutCart} className="register-btn">
                  Thanh toán giỏ hàng
                </button>
              </>
            )}
          </section>

          <section className="register-section">
            <h3>Đăng ký Thành viên mới</h3>
            <p className="register-subtitle">
              Demo Trigger tự động khởi tạo ví tiền khi insert User.
            </p>

            <form onSubmit={handleRegister} className="register-form">
              <input
                type="text"
                placeholder="Họ và tên..."
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                className="form-input"
                required
              />

              <input
                type="email"
                placeholder="Email..."
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="form-input"
                required
              />

              <button type="submit" className="register-btn">
                Đăng ký ngay
              </button>
            </form>
          </section>

          <div className="trigger-note">
            <strong>SQL / Trigger Log:</strong>

            {logs.length === 0 ? (
              <p>Chưa có thao tác nào.</p>
            ) : (
              <ul>
                {logs.map((log, index) => (
                  <li key={index}>
                    <code>{log}</code>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="trigger-note">
            <strong>Chi tiết Demo DB: </strong>

            <ul>
              <li>
                <strong>Đăng ký:</strong> Insert <code>users</code> → trigger tạo <code>wallets</code>.
              </li>
              <li>
                <strong>Nạp tiền:</strong> Insert <code>wallet_topups</code> paid → trigger cộng ví.
              </li>
              <li>
                <strong>Checkout:</strong> Insert <code>orders</code>, <code>order_items</code>, <code>payments</code> → trigger trừ ví, enroll, chia tiền.
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
