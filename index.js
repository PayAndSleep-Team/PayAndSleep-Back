const express = require('express');
const cors = require('cors');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = 3000;

// Connect to SQLite database
let db = new sqlite3.Database('payandsleep.db', (err) => {    
    if (err) {
        return console.error(err.message);
    }
    console.log('Connected to the SQlite database.');
  });

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

app.post('/api/register', (req, res) => {
    let { email, password, role, name, phone } = req.body;

    let sql = `INSERT INTO users (email, password, role) VALUES (?, ?, ?)`;

    db.run(sql, [email, password, role], function (err) {
        if (err) {
            console.error('❌ Error registering user:', err.message);
            return res.status(500).json({ error: err.message });
        }

        const user_id = this.lastID;

        let sql2;
        let params;

        if (role === 'host') {
            sql2 = `INSERT INTO hosts (user_id, name, phone) VALUES (?, ?, ?)`;
            params = [user_id, name, phone];
        } else if (role === 'tenant') {
            sql2 = `INSERT INTO tenants (user_id, name, phone) VALUES (?, ?, ?)`;
            params = [user_id, name, phone];
        }

        if (sql2) {
            db.run(sql2, params, function (err) {
                if (err) {
                    console.error(`❌ Error registering ${role}:`, err.message);
                    return res.status(500).json({ error: err.message });
                }

                res.json({ message: "ลงทะเบียนสำเร็จ" });
            });
        } else {
            res.status(400).json({ error: 'Invalid role specified' });
        }
    });
});

app.post('/api/login', (req, res) => {
    let { email, password } = req.body;
    let sql = `SELECT * FROM users WHERE email = ?`;

    db.get(sql, [email], (err, user) => {
        if (err) {
            console.error('❌ Error logging in:', err.message);
            res.status(500).json({ error: err.message });
        } else if (!user) {
            res.json({ message: "ไม่พบบัญชีผู้ใช้" });
        } else if (user.password !== password) {
            res.json({ message: "รหัสผ่านไม่ถูกต้อง" });
        } else {
            if (user.role === 'host') {
                sql = `SELECT * FROM hosts WHERE user_id = ?`;
            } else if (user.role === 'tenant') {
                sql = `SELECT * FROM tenants WHERE user_id = ?`;
            }

            db.get(sql, [user.id], (err, profile) => {
                if (err) {
                    console.error('❌ Error fetching profile:', err.message);
                    res.status(500).json({ error: err.message });
                } else {
                    user.profile = profile;
                    req.session.user = user;
                    console.log('✅ User logged in');
                    res.json({ message: "เข้าสู่ระบบสำเร็จ" });
                }
            });
        }
    });
});

app.get('/api/host/property', (req, res) => {
    let sql = `SELECT * FROM properties WHERE host_id = ?`;

    db.all(sql, [req.session.user.profile.id], (err, properties) => {
        if (err) {
            console.error('❌ Error fetching properties:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            if (properties.length === 0) {
                res.redirect('http://localhost:5173/landing/create-property');
            } else {
                req.session.user.property = properties[0];
                res.redirect('http://localhost:5173/host/dashboard');
            }
        }
    });
});

app.post('/api/create/property', (req, res) => {
    let { name, address, water_rate, electricity_rate, bank_name, bank_account_number, account_holder_name, promptpay_number } = req.body;
    let sql = `INSERT INTO properties (host_id, name, address, water_rate, electricity_rate, bank_name, bank_account_number, account_holder_name, promptpay_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.run(sql, [req.session.user.profile.id, name, address, water_rate, electricity_rate, bank_name, bank_account_number, account_holder_name, promptpay_number], function (err, property) {
        if (err) {
            console.error('❌ Error creating property:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            req.session.user.property = property;
            res.json({ message: "สร้าง Property สำเร็จ" });
        }
    });
});

app.post('/api/create/room', (req, res) => {
    let { room_number, size, price } = req.body;
    let sql = `INSERT INTO rooms (property_id, room_number, size, price, status) VALUES (?, ?, ?, ?, ?)`;

    db.run(sql, [req.session.user.property.id, room_number, size, price, 'available'], function (err, room) {
        if (err) {
            console.error('❌ Error creating room:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            res.json({ message: "สร้าง Room สำเร็จ" });
        }
    });
});

app.get('/api/tenant/rental-contract', (req, res) => {
    let sql = `SELECT * FROM rental_contracts WHERE tenant_id = ?`;

    db.all(sql, [req.session.user.profile.id], (err, rentals) => {
        if (err) {
            console.error('❌ Error fetching rentals:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            if (rentals.length === 0) {
                res.redirect('http://localhost:5173/landing/selectProperty');
            } else {
                req.session.user.rental = rentals[0];
                res.redirect('http://localhost:5173/tenant/dashboard');
            }
        }
    });
});

app.get('/api/get/property', (req, res) => {
    let sql = `SELECT * FROM properties`;

    db.all(sql, (err, properties) => {
        if (err) {
            console.error('❌ Error fetching properties:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            res.json(properties);
        }
    });
});

app.get('/api/get/rooms', (req, res) => {
    let { property_id } = req.query;
    let sql = `SELECT * FROM rooms WHERE property_id = ?`;

    db.all(sql, [property_id], (err, rooms) => {
        if (err) {
            console.error('❌ Error fetching rooms:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            res.json(rooms);
        }
    });
});

app.post('/api/create/rental-contract', (req, res) => {
    let { room_id, start_date, end_date } = req.body;

    let sql = `INSERT INTO rental_contracts (tenant_id, room_id, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)`;

    db.run(sql, [req.session.user.profile.id, room_id, start_date, end_date, 'waiting'], function (err, rental) {
        if (err) {
            console.error('❌ Error creating rental:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            req.session.user.rental = rental;
            res.json({ message: "สร้างสัญญาเช่าสำเร็จ" });
        }
    });
});

app.get('/', (req, res) => {
    console.log(req.session);
})

app.get('/api/session', (req, res) => {
    if (req.session.user) {
        res.json(req.session.user);
    } else {
        res.json({ message: "ไม่ได้เข้าสู่ระบบ" });
    }
});

app.get('/api/logout', (req, res) => {
    req.session.destroy();
    console.log('✅ User logged out');
    res.json({ message: "ออกจากระบบสำเร็จ" });
});

app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});
