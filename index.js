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
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({limit: '10mb', extended: true }));

app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false,
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
    let { room_number, size, price, status } = req.body;
    let sql = `INSERT INTO rooms (property_id, room_number, size, price, status) VALUES (?, ?, ?, ?, ?)`;

    db.run(sql, [req.session.user.property.id, room_number, size, price, status], function (err, room) {
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
            } else if (rentals[0].status === 'waiting') {
                req.session.user.rental = rentals[0];
                let sql2 = `SELECT * FROM rooms WHERE id = ?`;

                db.get(sql2, [rentals[0].room_id], (err, room) => {
                    if (err) {
                        console.error('❌ Error fetching room:', err.message);
                        res.status(500).json({ error: err.message });
                    } else {
                        req.session.user.room = room;
                        res.redirect('http://localhost:5173/landing/waiting');
                    }
                });
            } else if (rentals[0].status === 'active') {
                req.session.user.rental = rentals[0];
                let sql2 = `SELECT * FROM rooms WHERE id = ?`;

                db.get(sql2, [rentals[0].room_id], (err, room) => {
                    if (err) {
                        console.error('❌ Error fetching room:', err.message);
                        res.status(500).json({ error: err.message });
                    } else {
                        req.session.user.room = room;
                        res.redirect('http://localhost:5173/tenant/dashboard');
                    }
                });
            } else if (rentals[0].status === 'terminated') {
                res.redirect('http://localhost:5173/landing/selectProperty');
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
    if (req.session.user.role === 'host') {
        let sql = `SELECT * FROM rooms WHERE property_id = ?`;

        db.all(sql, [req.session.user.property.id], (err, rooms) => {
            if (err) {
                console.error('❌ Error fetching rooms:', err.message);
                res.status(500).json({ error: err.message });
            } else {
                res.json(rooms);
            }
        });
    } else if (req.session.user.role === 'tenant') {
        let { property_id } = req.query;
        let sql = `SELECT * FROM rooms WHERE property_id = ? AND status = 'available'`;

        db.all(sql, [property_id], (err, rooms) => {
            if (err) {
                console.error('❌ Error fetching rooms:', err.message);
                res.status(500).json({ error: err.message });
            } else {
                res.json(rooms);
            }
        });
    }
});

app.get('/api/get/room', (req, res) => {
    let { room_id } = req.query;
    let sql = `SELECT * FROM rooms WHERE id = ?`;

    db.get(sql, [room_id], (err, room) => {
        if (err) {
            console.error('❌ Error fetching room:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            res.json(room);
        }
    });
});

app.put('/api/update/room', (req, res) => {
    let { id, size, price } = req.body;
    let sql = `UPDATE rooms SET size = ?, price = ? WHERE id = ?`;

    db.run(sql, [size, price, id], function (err) {
        if (err) {
            console.error('❌ Error updating room:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            res.json({ message: "อัพเดทห้องสำเร็จ" });
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
            let sql2 = `SELECT * FROM rooms WHERE id = ?`;

            db.get(sql2, [room_id], (err, room) => {
                if (err) {
                    console.error('❌ Error fetching room:', err.message);
                    res.status(500).json({ error: err.message });
                } else {
                    req.session.user.room = room;
                    // ส่งข้อความไปหา Host
                    let sql3 = `SELECT user_id FROM hosts WHERE id = (SELECT host_id FROM properties WHERE id = ?)`;

                    db.get(sql3, [room.property_id], (err, host) => {
                        if (err) {
                            console.error('❌ Error fetching host:', err.message);
                            res.status(500).json({ error: err.message });
                        } else {
                            createNotification(host.user_id, `คำขอเช่าห้องใหม่จาก ${req.session.user.profile.name}`);
                            res.json({ message: "สร้างสัญญาเช่าสำเร็จ" });
                        }
                    });
                }
            });
        }
    });
});

app.get('/api/get/rental-contracts', (req, res) => {
    let sql = `
        SELECT
            rental_contracts.id AS rental_id,
            rental_contracts.tenant_id,
            rental_contracts.room_id,
            rental_contracts.start_date,
            rental_contracts.end_date,
            rental_contracts.status,
            rental_contracts.created_at,
            rooms.property_id,
            rooms.room_number,
            rooms.size,
            rooms.price,
            tenants.name AS tenant_name,
            tenants.phone AS tenant_phone
        FROM rental_contracts
        JOIN rooms ON rental_contracts.room_id = rooms.id
        JOIN tenants ON rental_contracts.tenant_id = tenants.id
        WHERE rooms.property_id = (
            SELECT id FROM properties WHERE host_id = ?
        )`;

    db.all(sql, [req.session.user.profile.id], (err, rentals) => {
        if (err) {
            console.error('❌ Error fetching rentals:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            res.json(rentals);
        }
    });
});

app.put('/api/status/rental-contract', (req, res) => {
    let { id, status, room_id } = req.body;

    let sql = `UPDATE rental_contracts SET status = ? WHERE id = ?`;

    db.run(sql, [status, id], function (err) {
        if (err) {
            console.error('❌ Error updating rental status:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            if (status === 'active') {
                let sql2 = `UPDATE rooms SET status = 'occupied' WHERE id = ?`;

                db.run(sql2, [room_id], function (err) {
                    if (err) {
                        console.error('❌ Error updating room status:', err.message);
                        res.status(500).json({ error: err.message });
                    }
                    
                    let sql3 = `SELECT user_id FROM tenants WHERE id = (SELECT tenant_id FROM rental_contracts WHERE id = ?)`;

                    db.get(sql3, [id], (err, user_id) => {
                        if (err) {
                            console.error('❌ Error fetching tenant:', err.message);
                            res.status(500).json({ error: err.message });
                        } else {
                            createNotification(user_id.user_id, `ยินดีต้อนรับ! สัญญาเช่าของคุณได้รับการอนุมัติ`);
                        }
                    });
                });
            }
            res.json({ message: "อัพเดทสถานะสัญญาเช่าสำเร็จ" });
        }
    });
});

app.post('/api/create/maintenance-request', (req, res) => {
    let { type, description } = req.body;

    let sql = `INSERT INTO maintenance_requests (tenant_id, room_id, description, status, type) VALUES (?, ?, ?, ?, ?)`;

    db.run(sql, [req.session.user.profile.id, req.session.user.room.id, description, 'pending', type], function (err) {
        if (err) {
            console.error('❌ Error creating maintenance request:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            let sql2 = `SELECT user_id FROM hosts WHERE id = (SELECT host_id FROM properties WHERE id = (SELECT property_id FROM rooms WHERE id = ?))`;

            db.get(sql2, [req.session.user.room.id], (err, host) => {
                if (err) {
                    console.error('❌ Error fetching host:', err.message);
                    res.status(500).json({ error: err.message });
                } else {
                    createNotification(host.user_id, `คำขอซ่อมบำรุงใหม่จากห้อง ${req.session.user.room.room_number}`);
                    res.json({ message: "ส่งคำขอซ่อมบำรุงสำเร็จ" });
                }
            });
        }
    });
});

app.get('/api/get/expenses', (req, res) => {
    let { room_id } = req.query;

    let sql = `SELECT * FROM rooms WHERE id = ?`;

    db.get(sql, [room_id], (err, room) => {
        if (err) {
            console.error('❌ Error fetching room:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            let sql2 = `SELECT * FROM properties WHERE id = ?`;

            if (room) {
                db.get(sql2, [room.property_id], (err, property) => {
                    if (err) {
                        console.error('❌ Error fetching property:', err.message);
                        res.status(500).json({ error: err.message });
                    } else {
                        res.json({
                            room_number: room.room_number,
                            price: room.price,
                            water_rate: property.water_rate,
                            electricity_rate: property.electricity_rate
                        });
                    }
                });
            } else {
                res.status(400).json({ error: 'Invalid room ID' });
            }
        }
    });
});

app.post('/api/create/bill', (req, res) => {
    let { room_id, month_year, rent_amount, water_usage, electricity_usage, water_fee, electricity_fee, other_fees, total_amount} = req.body;

    let sql = `SELECT * FROM rental_contracts WHERE room_id = ? AND status = 'active'`;

    db.get(sql, [room_id], (err, rental) => {
        if (err) {
            console.error('❌ Error fetching rental:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            let sql2 = `INSERT INTO bills (rental_contract_id, month_year, rent_amount, water_usage, electricity_usage, water_fee, electricity_fee, other_fees, total_amount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            db.run(sql2, [rental.id, month_year, rent_amount, water_usage, electricity_usage, water_fee, electricity_fee, other_fees, total_amount, 'pending'], function (err) {
                if (err) {
                    console.error('❌ Error creating bill:', err.message);
                    res.status(500).json({ error: err.message });
                } else {
                    let sql3 = `SELECT user_id FROM tenants WHERE id = ?`;

                    db.get(sql3, [rental.tenant_id], (err, tenant) => {
                        if (err) {
                            console.error('❌ Error fetching tenant:', err.message);
                            res.status(500).json({ error: err.message });
                        } else {
                            createNotification(tenant.user_id, `ค่าเช่าเดือน ${month_year} มาแล้ว`);
                            res.json({ message: "สร้างบิลสำเร็จ" });
                        }
                    });
                }
            });
        }
    });
});

app.get('/api/get/bills', (req, res) => {
    let sql;
    let params;

    if (req.session.user.role === 'host') {
        sql = `SELECT bills.*, rooms.room_number FROM bills JOIN rental_contracts ON bills.rental_contract_id = rental_contracts.id JOIN rooms ON rental_contracts.room_id = rooms.id WHERE rooms.property_id IN (SELECT id FROM properties WHERE host_id = ?) ORDER BY month_year DESC`;
        params = [req.session.user.profile.id];
    } else if (req.session.user.role === 'tenant') {
        sql = `SELECT bills.*, rooms.room_number FROM bills JOIN rental_contracts ON bills.rental_contract_id = rental_contracts.id JOIN rooms ON rental_contracts.room_id = rooms.id WHERE rental_contracts.tenant_id = ? ORDER BY month_year DESC`;
        params = [req.session.user.profile.id];
    }

    db.all(sql, params, (err, bills) => {
        if (err) {
            console.error('❌ Error fetching bills:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            res.json(bills);
        }
    });
});

app.get('/api/get/bill', (req, res) => {
    let sql = `SELECT * FROM bills WHERE id = ?`;

    db.get(sql, [req.query.bill_id], (err, bill) => {
        if (err) {
            console.error('❌ Error fetching bill:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            res.json(bill);
        }
    });
});

app.get('/api/get/bill-paymentmethod', (req, res) => {
    let sql = `SELECT * FROM bills WHERE id = ?`;

    db.get(sql, [req.query.bill_id], (err, bill) => {
        if (err) {
            console.error('❌ Error fetching bill:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            if (!bill){
                res.status(400).json({ error: 'Invalid bill ID' });
            }

            let sql2 = `SELECT * FROM properties WHERE id = (SELECT property_id FROM rooms WHERE id = (SELECT room_id FROM rental_contracts WHERE id = ?))`;

            db.get(sql2, [bill.rental_contract_id], (err, property) => {
                if (err) {
                    console.error('❌ Error fetching property:', err.message);
                    res.status(500).json({ error: err.message });
                } else {
                    res.json({ bill, property });
                }
            });
        }
    });
});

app.put('/api/pay/bill', (req, res) => {
    let { bill_id } = req.body;

    let sql = `UPDATE bills SET status = 'paid' WHERE id = ?`;

    db.run(sql, [bill_id], function (err) {
        if (err) {
            console.error('❌ Error paying bill:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            res.json({ message: "ชำระเงินสำเร็จ" });
        }
    });
});

app.post('/api/create/payment', (req, res) => {
    let { bill_id, amount, payment_method, proof_of_payment } = req.body;

    let sql = `INSERT INTO payments (bill_id, tenant_id, amount, payment_method, proof_of_payment, status) VALUES (?, ?, ?, ?, ?, ?)`;

    db.run(sql, [bill_id, req.session.user.profile.id, amount, payment_method, proof_of_payment, 'pending'], function (err) {
        if (err) {
            console.error('❌ Error creating payment:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            let sql2 = `SELECT user_id FROM hosts WHERE id = (SELECT host_id FROM properties WHERE id = (SELECT property_id FROM rooms WHERE id = ?))`;

            db.get(sql2, [req.session.user.room.id], (err, host) => {
                if (err) {
                    console.error('❌ Error fetching host:', err.message);
                    res.status(500).json({ error: err.message });
                } else {
                    createNotification(host.user_id, `มีการชำระเงินใหม่จากห้อง ${req.session.user.room.room_number} จำนวน ${amount} บาท`);
                    res.json({ message: "สร้างการชำระเงินสำเร็จ" });
                }
            });
        }
    });
});

app.get('/api/get/maintenance-requests', (req, res) => {
    let sql;
    let params;

    if (req.session.user.role === 'host') {
        // เอาเลขห้องด้วย room_number
        sql = `SELECT maintenance_requests.*, rooms.room_number FROM maintenance_requests JOIN rooms ON maintenance_requests.room_id = rooms.id WHERE rooms.property_id IN (SELECT id FROM properties WHERE host_id = ?)`;
        params = [req.session.user.profile.id];
    }
    else if (req.session.user.role === 'tenant') {
        sql = `SELECT * FROM maintenance_requests WHERE room_id = ?`;
        params = [req.session.user.room.id];
    }

    db.all(sql, params, (err, requests) => {
        if (err) {
            console.error('❌ Error fetching maintenance requests:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            res.json(requests);
        }
    });
});

app.put('/api/status/maintenance-request', (req, res) => {
    let { id, status } = req.body;

    let sql = `UPDATE maintenance_requests SET status = ? WHERE id = ?`;

    db.run(sql, [status, id], function (err) {
        if (err) {
            console.error('❌ Error updating maintenance request status:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            let sql2 = `SELECT user_id FROM tenants WHERE id = (SELECT tenant_id FROM rental_contracts WHERE room_id = (SELECT room_id FROM maintenance_requests WHERE id = ?))`;

            db.get(sql2, [id], (err, tenant) => {
                if (err) {
                    console.error('❌ Error fetching tenant:', err.message);
                    res.status(500).json({ error: err.message });
                } else {
                    let mes = '';
                    if (status === 'in_progress') {
                        mes = "คำขอซ่อมบำรุงของคุณได้รับการดำเนินการ";
                    } else if (status === 'completed') {
                        mes = "คำขอซ่อมบำรุงของคุณได้รับการดำเนินการเสร็จสิ้น";
                    }
                    createNotification(tenant.user_id, mes);
                    res.json({ message: "อัพเดทสถานะคำขอซ่อมบำรุงสำเร็จ" });
                }
            });
        }
    });
});

app.get('/api/get/payment', (req, res) => {
    let room_id = req.query.room_id;
    let sql = `SELECT * FROM payments WHERE bill_id IN (SELECT id FROM bills WHERE rental_contract_id IN (SELECT id FROM rental_contracts WHERE room_id = ?)) AND status = 'pending' ORDER BY created_at DESC`;

    db.all(sql, [room_id], (err, payments) => {
        if (err) {
            console.error('❌ Error fetching payments:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            res.json(payments);
        }
    });
});

app.put('/api/status/payment', (req, res) => {
    let { id, status } = req.body;

    let sql = `UPDATE payments SET status = ? WHERE id = ?`;

    db.run(sql, [status, id], function (err) {
        if (err) {
            console.error('❌ Error updating payment status:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            let sql2 = `SELECT user_id FROM tenants WHERE id = (SELECT tenant_id FROM rental_contracts WHERE id = (SELECT rental_contract_id FROM bills WHERE id = (SELECT bill_id FROM payments WHERE id = ?)))`;

            db.get(sql2, [id], (err, tenant) => {
                if (err) {
                    console.error('❌ Error fetching tenant:', err.message);
                    res.status(500).json({ error: err.message });
                } else {
                    let mes = '';
                    if (status === 'approved') {
                        mes = "การชำระเงินของคุณได้รับการอนุมัติ";
                    } else if (status === 'rejected') {
                        mes = "การชำระเงินของคุณถูกปฏิเสธ";
                    }
                    createNotification(tenant.user_id, mes);
                    res.json({ message: "อัพเดทสถานะการชำระเงินสำเร็จ" });
                }
            });
        }
    });
});

app.get('/api/get/notifications', (req, res) => {
    let sql = `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 8`;

    db.all(sql, [req.session.user.id], (err, notifications) => {
        if (err) {
            console.error('❌ Error fetching notifications:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            res.json(notifications);
        }
    });
});

app.put('/api/read/notification', (req, res) => {
    let params = req.body;
    let sql = `UPDATE notifications SET status = 'read' WHERE id = ?`;

    db.run(sql, [params.id], function (err) {
        if (err) {
            console.error('❌ Error updating notification status:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            res.json({ message: "อัพเดทสถานะการแจ้งเตือนสำเร็จ" });
        }
    });
});

app.put('/api/update/profile', (req, res) => {
    let { name, email, password, phone } = req.body;

    let sql;

    if (req.session.user.role === 'host') {
        sql = `UPDATE hosts SET name = ?, phone = ? WHERE id = ?`;
    } else if (req.session.user.role === 'tenant') {
        sql = `UPDATE tenants SET name = ?, phone = ? WHERE id = ?`;
    }

    db.run(sql, [name, phone, req.session.user.profile.id], function (err) {
        if (err) {
            console.error('❌ Error updating profile:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            let sql2 = `UPDATE users SET email = ?, password = ? WHERE id = ?`;

            db.run(sql2, [email, password, req.session.user.id], function (err) {
                if (err) {
                    console.error('❌ Error updating user:', err.message);
                    res.status(500).json({ error: err.message });
                } else {
                    req.session.user.email = email;
                    req.session.user.profile.name = name;
                    req.session.user.profile.phone = phone;
                    req.session.user.password = password;
                    res.json({ message: "อัพเดทโปรไฟล์สำเร็จ" });
                }
            });
        }
    });
});

app.put('/api/update/property', (req, res) => {
    let { bank_name, bank_account_number, address } = req.body;

    let sql = `UPDATE properties SET bank_name = ?, bank_account_number = ?, address = ? WHERE id = ?`;

    db.run(sql, [bank_name, bank_account_number, address, req.session.user.property.id], function (err) {
        if (err) {
            console.error('❌ Error updating property:', err.message);
            res.status(500).json({ error: err.message });
        } else {
            req.session.user.property.bank_name = bank_name;
            req.session.user.property.bank_account_number = bank_account_number;
            req.session.user.property.address = address;
            res.json({ message: "อัพเดท Property สำเร็จ" });
        }
    });
});

const createNotification = (user_id, message) => {
    let sql = `INSERT INTO notifications (user_id, message) VALUES (?, ?)`;

    db.run(sql, [user_id, message], function (err) {
        if (err) {
            console.error('❌ Error creating notification:', err.message);
        }
    });
}

app.get('/', (req, res) => {
    console.log('🔐 Session:', req.session);
    res.send(req.session);
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
