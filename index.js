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
                    console.log(req.session.user);
                    res.json({ message: "เข้าสู่ระบบสำเร็จ" });
                }
            });
        }
    });
});

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


// const express = require('express');
// const cors = require('cors');
// const session = require('express-session'); // Import express-session
// const db = require('./server.js');  // Import PostgreSQL connection

// const app = express();
// const port = 3000;

// app.use(cors({ origin: "http://localhost:5173", credentials: true }));

// app.use(express.json());

// app.use(session({
//     secret: 'secret',
//     resave: false,
//     saveUninitialized: false,
//     cookie: { 
//         secure: false,
//     }
// }));

// app.get('/api/create', async (req, res) => {
//     let sql = `ALTER TABLE eiei ADD COULMN password VARCHAR(255)`;

//     try {
//         await db.query(sql);
//         console.log('✅ Table created (or already exists)');
//         res.json({ message: "Table created successfully" });
//     } catch (err) {
//         console.error('❌ Error creating table:', err);
//         res.status(500).json({ error: err.message });
//     }
// });

// app.post('/api/register', async (req, res) => {
//     let { username, email, password } = req.body;

//     let sql = `INSERT INTO eiei (name, email, password) VALUES ('${username}', '${email}', '${password}')`;
//     console.log(sql);

//     try {
//         await db.query(sql);
//         res.json({ message: "ลงทะเบียนสำเร็จ" });
//     } catch (err) {
//         console.error('❌ Error registering user:', err);
//         res.status(500).json({ error: err.message });
//     }
// });

// app.post('/api/login', async (req, res) => {
//     let { email, password } = req.body;
    
//     let sql = `SELECT * FROM eiei WHERE email = '${email}'`;
//     console.log(sql);
    
//     try {
//         let result = await db.query(sql);
//         console.log(result.rows[0]);
        
//         if (result.rows.length === 0) {
//             console.log("ไม่พบบัญชีผู้ใช้");
//             res.json({ message: "ไม่พบบัญชีผู้ใช้" });
//         } else if (result.rows[0].password !== password) {
//             console.log("รหัสผ่านไม่ถูกต้อง");
//             res.json({ message: "รหัสผ่านไม่ถูกต้อง" });
//         } else {
//             req.session.user = result.rows[0];
//             console.log("Session ID:", req.sessionID);
//             console.log(req.session);
//             console.log('✅ User logged in');
//             res.json({ message: "เข้าสู่ระบบสำเร็จ" });
//         }
//         console.log(req.session.user);
//     } catch (err) {
//         console.error('❌ Error logging in:', err);
//         res.status(500).json({ error: err.message });
//     }
// });

// app.get('/api/session', (req, res) => {
//     console.log("Session ID:", req.sessionID);
//     console.log(req.session);
//     console.log(req.session.user);
//     if (req.session.user) {
//         res.json(req.session.user);
//     } else {
//         res.json({ message: "ไม่ได้เข้าสู่ระบบ" });
//     }
// });

// app.get('/test', (req, res) => {
//     console.log("Session ID:", req.sessionID);
//     if (!req.session.viewCount) {
//         req.session.viewCount = 1;
//     } else {
//         req.session.viewCount += 1;
//     }
//     res.send(`Views: ${req.session.viewCount}`);
//     console.log(req.session);
// });

// app.get('/api/logout', (req, res) => {
//     req.session.destroy();
//     console.log('✅ User logged out');
//     res.json({ message: "ออกจากระบบสำเร็จ" });
// });

// // if login success can show home page else can't show
// // app.get('/api/home', (req, res) => {
// //     if (req.session.user) {
// //         // res.redirect('http://localhost:5173');
// //     } else {
// //         res.redirect('http://localhost:5173/login');
// //     }
// // });

// // app.get('/api/list', async (req, res) => {
// //     let sql = `SELECT * FROM eiei`;

// //     try {
// //         let result = await db.query(sql);
// //         console.log('✅ Fetched data from PostgreSQL');
// //         res.json(result.rows);
// //     } catch (err) {
// //         console.error('❌ Error fetching data:', err);
// //         res.status(500).json({ error: err.message });
// //     }
// // });

// app.get('/api/eiei', (req, res) => {
//     res.json({ message: 'Sleep...' });
// });

// app.post('/api/eiei2', (req, res) => {
//     res.send('Hello World');
// });

// app.listen(port, () => {
//     console.log(`🚀 Server running at http://localhost:${port}`);
// });
