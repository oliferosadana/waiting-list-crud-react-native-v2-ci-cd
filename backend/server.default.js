// server.js
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const http = require('http'); // Impor modul http
const { Server } = require('socket.io'); // Impor Server dari socket.io

const app = express();
const server = http.createServer(app); // Buat server HTTP dari aplikasi Express
const io = new Server(server, { // Inisialisasi Socket.io dengan server HTTP
    cors: {
        origin: ["http://localhost:3003", "http://localhost:8080", "null"], // Sesuaikan dengan origin frontend Anda
        methods: ["GET", "POST", "PATCH", "PUT", "DELETE"]
    }
});

const PORT = process.env.PORT || 3003;

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'superuser';
const DB_PASSWORD = process.env.DB_PASSWORD || '@Admin2w6y1q1q';
const DB_NAME = process.env.DB_NAME || 'waiting_list_db';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

app.use(cors());
app.use(express.json());

let connection;

async function initializeDatabase() {
    try {
        connection = await mysql.createConnection({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD,
            database: DB_NAME
        });
        console.log('Terhubung ke database MySQL.');

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nama VARCHAR(255) NOT NULL,
                nowa VARCHAR(255) NOT NULL,
                status VARCHAR(50) NOT NULL,
                reg VARCHAR(50) NOT NULL,
                regTime VARCHAR(255)
            );
        `);
        console.log('Tabel "users" sudah ada atau berhasil dibuat.');

        const [rows] = await connection.execute('SELECT COUNT(*) AS count FROM users WHERE nama = ? AND status = ?', ['Admin', 'admin']);
        if (rows[0].count === 0) {
            await connection.execute('INSERT INTO users (nama, nowa, status, reg, regTime) VALUES (?, ?, ?, ?, ?)', ['Admin', 'N/A', 'admin', 'offline', new Date().toISOString()]);
            console.log('Pengguna admin default ditambahkan ke database.');
        }

    } catch (error) {
        console.error('Error saat menghubungkan atau menginisialisasi database:', error.message);
        process.exit(1);
    }
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Pengguna terhubung via Socket.io:', socket.id);

    // Dengar event 'new_registration' dari halaman registrasi
    socket.on('new_registration', (data) => {
        console.log('Menerima notifikasi pendaftaran baru:', data);
        // Setelah menerima notifikasi, pancarkan event ke semua klien untuk memperbarui data
        io.emit('data_updated');
    });

    socket.on('disconnect', () => {
        console.log('Pengguna terputus dari Socket.io:', socket.id);
    });
});


initializeDatabase().then(() => {
    // Endpoint Login
    app.post('/api/login', (req, res) => {
        const { username, password } = req.body;
        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            console.log(`Login berhasil untuk pengguna: ${username}`);
            return res.json({ success: true, message: 'Login berhasil!' });
        } else {
            console.warn(`Login gagal untuk pengguna: ${username}`);
            return res.status(401).json({ success: false, message: 'Nama pengguna atau kata sandi salah.' });
        }
    });

    // Endpoint untuk mendapatkan semua pengguna
    app.get('/api/users', async (req, res) => {
        try {
            const [rows] = await connection.execute('SELECT * FROM users');
            res.json(rows);
        } catch (error) {
            console.error('Error saat mengambil data pengguna:', error.message);
            res.status(500).json({ message: 'Gagal mengambil data pengguna.' });
        }
    });

    // Endpoint untuk mendapatkan pengguna berdasarkan ID
    app.get('/api/users/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const [rows] = await connection.execute('SELECT * FROM users WHERE id = ?', [id]);
            const user = rows[0];
            if (user) {
                res.json(user);
            } else {
                res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
            }
        } catch (error) {
            console.error(`Error saat mengambil pengguna dengan ID ${id}:`, error.message);
            res.status(500).json({ message: 'Gagal mengambil pengguna.' });
        }
    });

    // Endpoint untuk menambah pengguna baru
    app.post('/api/users', async (req, res) => {
        const { nama, nowa, status, reg, regTime } = req.body;
        if (!nama || !nowa || !status || !reg || !regTime) {
            return res.status(400).json({ message: 'Data yang dibutuhkan tidak lengkap.' });
        }
        try {
            const finalStatus = nowa.startsWith('62') ? status : 'pending';
            const [result] = await connection.execute('INSERT INTO users (nama, nowa, status, reg, regTime) VALUES (?, ?, ?, ?, ?)', [nama, nowa, finalStatus, reg, regTime]);
            res.status(201).json({ id: result.insertId, message: 'Pengguna berhasil ditambahkan.' });
            io.emit('data_updated'); // Pancarkan event setelah data berubah
        } catch (error) {
            console.error('Error saat menambahkan pengguna:', error.message);
            res.status(500).json({ message: 'Gagal menambahkan pengguna.' });
        }
    });

    // Endpoint untuk memperbarui pengguna (PATCH)
    app.patch('/api/users/:id', async (req, res) => {
        const { id } = req.params;
        const updates = req.body;
        const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updates);

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: 'Tidak ada data untuk diperbarui.' });
        }

        try {
            const [result] = await connection.execute(`UPDATE users SET ${setClause} WHERE id = ?`, [...values, id]);

            if (result.affectedRows > 0) {
                res.json({ message: 'Pengguna berhasil diperbarui.' });
                io.emit('data_updated'); // Pancarkan event setelah data berubah
            } else {
                res.status(404).json({ message: 'Pengguna tidak ditemukan atau tidak ada perubahan.' });
            }
        } catch (error) {
            console.error(`Error saat memperbarui pengguna dengan ID ${id}:`, error.message);
            res.status(500).json({ message: 'Gagal memperbarui pengguna.' });
        }
    });

    // Endpoint untuk memperbarui pengguna (PUT)
    app.put('/api/users/:id', async (req, res) => {
        const { id } = req.params;
        const { nama, nowa, status, reg, regTime } = req.body;

        if (!nama || !nowa || !status || !reg || !regTime) {
            return res.status(400).json({ message: 'Data yang dibutuhkan tidak lengkap untuk PUT.' });
        }

        try {
            const [result] = await connection.execute('UPDATE users SET nama = ?, nowa = ?, status = ?, reg = ?, regTime = ? WHERE id = ?',
                                                     [nama, nowa, status, reg, regTime, id]);

            if (result.affectedRows > 0) {
                res.json({ message: 'Pengguna berhasil diperbarui.' });
                io.emit('data_updated'); // Pancarkan event setelah data berubah
            } else {
                res.status(404).json({ message: 'Pengguna tidak ditemukan atau tidak ada perubahan.' });
            }
        } catch (error) {
            console.error(`Error saat memperbarui pengguna dengan ID ${id}:`, error.message);
            res.status(500).json({ message: 'Gagal memperbarui pengguna.' });
        }
    });

    // Endpoint untuk menghapus pengguna
    app.delete('/api/users/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const [result] = await connection.execute('DELETE FROM users WHERE id = ?', [id]);
            if (result.affectedRows > 0) {
                res.json({ message: 'Pengguna berhasil dihapus.' });
                io.emit('data_updated'); // Pancarkan event setelah data berubah
            } else {
                res.status(404).json({ message: 'Pengguna tidak ditemukan.' });
            }
        } catch (error) {
            console.error(`Error saat menghapus pengguna dengan ID ${id}:`, error.message);
            res.status(500).json({ message: 'Gagal menghapus pengguna.' });
        }
    });

    // Mulai server (gunakan server http, bukan app express langsung)
    server.listen(PORT, () => {
        console.log(`Server Express.js berjalan di http://localhost:${PORT}`);
        console.log(`Socket.io berjalan.`);
    });
}).catch(error => {
    console.error('Gagal memulai server karena error database:', error);
});

