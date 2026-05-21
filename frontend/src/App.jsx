import { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [keyword, setKeyword] = useState('');
  const [courses, setCourses] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeUserId, setActiveUserId] = useState(3); // Default to user 3 (Văn Bảo)
  const [walletBalance, setWalletBalance] = useState(0);
  const [message, setMessage] = useState('');

  // Registration form state
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');

  // Fetch all users
  const fetchUsers = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/users/list');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
      }
    } catch (err) {
      console.error("Lỗi lấy danh sách người dùng:", err);
    }
  };

  // Fetch wallet balance
  const fetchWalletBalance = async (uid) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/wallets/balance/${uid}`);
      const data = await res.json();
      if (data.success) {
        setWalletBalance(data.balance);
      } else {
        setWalletBalance(0);
      }
    } catch (err) {
      console.error("Lỗi lấy số dư ví:", err);
      setWalletBalance(0);
    }
  };

  // 1. Search API Call
  // Using a ref to debounce search requests
  const debounceTimeout = useRef(null);

  const handleSearch = (e) => {
    const val = e.target.value;
    setKeyword(val);

    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    debounceTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/courses/search?keyword=${val}`);
        const data = await res.json();
        if (data.success) {
          setCourses(data.data);
        }
      } catch (err) {
        console.error(err);
      }
    }, 300); // 300ms delay
  };

  // 2. Initial Load
  useEffect(() => {
    handleSearch({ target: { value: '' } });
    fetchUsers();
    fetchWalletBalance(activeUserId);
  }, []);

  // 3. Update active user
  const handleUserChange = (e) => {
    const uid = parseInt(e.target.value);
    setActiveUserId(uid);
    fetchWalletBalance(uid);
  };

  // 4. Register new user (triggers auto wallet creation in Postgres)
  const handleRegister = async (e) => {
    e.preventDefault();
    if (!newFullName || !newEmail) {
      alert("Vui lòng điền đầy đủ Tên và Email!");
      return;
    }

    try {
      const res = await fetch('http://127.0.0.1:8000/api/users/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: newEmail,
          full_name: newFullName
        })
      });

      const data = await res.json();

      if (data.success) {
        setMessage(data.message);
        setNewFullName('');
        setNewEmail('');
        await fetchUsers(); // Tải lại danh sách user
        setActiveUserId(data.user.id); // Tự động switch sang user mới tạo
        fetchWalletBalance(data.user.id);
      } else {
        setMessage(`Lỗi đăng ký: ${data.message}`);
      }

      setTimeout(() => setMessage(''), 5000);

    } catch (err) {
      console.error(err);
      setMessage("Lỗi kết nối đến Backend!");
    }
  };

  // 5. Payment API Call
  const handlePayment = async (courseId, price) => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/wallets/pay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          course_id: courseId,
          price: price,
          user_id: activeUserId
        })
      });

      const data = await res.json();

      if (data.success) {
        setMessage(data.message);
        fetchWalletBalance(activeUserId);
      } else {
        setMessage(`Lỗi từ DB Trigger: ${data.message}`);
      }

      setTimeout(() => {
        setMessage('');
      }, 5000);

    } catch (err) {
      console.error(err);
      setMessage("Lỗi kết nối đến Backend!");
    }
  };

  // 6. Topup API Call
  const handleTopup = async () => {
    try {
      const amount = 200000;
      const res = await fetch('http://127.0.0.1:8000/api/wallets/topup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: activeUserId,
          amount: amount
        })
      });

      const data = await res.json();

      if (data.success) {
        setMessage(data.message);
        fetchWalletBalance(activeUserId);
      } else {
        setMessage("Nạp tiền thất bại.");
      }

      setTimeout(() => {
        setMessage('');
      }, 3000);

    } catch (err) {
      console.error(err);
      setMessage("Lỗi kết nối đến Backend!");
    }
  };

  return (
    <div className="ude-container">
      <header className="ude-header">
        <div className="header-left">
          <h1>UdeLearning Showcase</h1>
          <div className="user-selector-container">
            <label htmlFor="user-select">Chọn tài khoản: </label>
            <select id="user-select" value={activeUserId} onChange={handleUserChange} className="user-select">
              {users.map(u => (
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
            <strong>{walletBalance.toLocaleString('vi-VN')} VND</strong>
          </div>
          <button onClick={handleTopup} className="topup-btn">
            Nạp 200K (Trigger)
          </button>
        </div>
      </header>

      {message && <div className={`message-toast ${message.includes('Lỗi') || message.includes('thất bại') ? 'error' : 'success'}`}>{message}</div>}

      <div className="showcase-grid">
        <div className="main-content">
          <section className="search-section">
            <h2>Nhập để tìm kiếm khoá học </h2>

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
                courses.map(course => (
                  <div key={course.id} className="course-card">
                    <h3>{course.title}</h3>
                    <p className="desc">{course.description}</p>
                    <div className="course-footer">
                      <span className="price">{Number(course.price).toLocaleString('vi-VN')} đ</span>
                      <button onClick={() => handlePayment(course.id, course.price)} className="buy-btn">
                        Mua ngay
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
            <h3>Đăng ký Thành viên mới</h3>
            <p className="register-subtitle">Demo Trigger tự động khởi tạo ví tiền khi insert User.</p>
            <form onSubmit={handleRegister} className="register-form">
              <input
                type="text"
                placeholder="Họ và tên..."
                value={newFullName}
                onChange={e => setNewFullName(e.target.value)}
                className="form-input"
                required
              />
              <input
                type="email"
                placeholder="Email..."
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="form-input"
                required
              />
              <button type="submit" className="register-btn">Đăng ký ngay</button>
            </form>
          </section>

          <div className="trigger-note">
            <strong>Chi tiết Demo DB: </strong>
            <ul>
              <li>
                <strong>Trigger Đăng ký (Đơn giản):</strong> Khi insert người dùng mới, Trigger <code>trg_create_wallet_for_user</code> chạy <code>AFTER INSERT</code> tự động tạo một Ví trống (0 VND) trong bảng <code>wallets</code>. Bạn có thể đăng ký thử để kiểm tra ví tự động xuất hiện!
              </li>
              <li>
                <strong>Trigger Nạp tiền:</strong> Nhấn "Nạp 200K" tạo bản ghi <code>wallet_topups</code> ở trạng thái 'paid', kích hoạt <code>trg_apply_wallet_topup</code> tự cộng tiền vào ví.
              </li>
              <li>
                <strong>Trigger Thanh toán & Phân chia (Phức tạp):</strong> Mua khóa học kích hoạt <code>trg_process_wallet_payment</code> (trừ tiền) và <code>trg_handle_payment_paid</code> (đăng ký học, chia doanh thu giảng viên 70/30, ghi log).
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;


