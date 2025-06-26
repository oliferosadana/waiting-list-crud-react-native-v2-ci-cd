// server.js
require('dotenv').config(); // Untuk memuat variabel lingkungan dari .env (hanya untuk lokal/dev)

const express = require('express');
const mysql = require('mysql2/promise'); // Menggunakan versi promise dari mysql2
const cors = require('cors');
const http = require('http'); // Diperlukan untuk integrasi Socket.io
const { Server } = require('socket.io'); // Mengimpor Server dari socket.io

const app = express();
const server = http.createServer(app); // Membuat server HTTP dari aplikasi Express
const io = new Server(server, { // Menginisialisasi Socket.io dengan server HTTP
    cors: {
        // Sesuaikan ini dengan domain/origin frontend Anda.
        // Di produksi, jangan gunakan "*" atau "null". Gunakan domain spesifik Anda.
        // Contoh: ["https://yourdomain.com", "http://localhost:3000"]
        origin: ["http://localhost:3003", "http://localhost:8080", "null"],
        methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
        credentials: true // Penting jika Anda menggunakan cookie atau header otorisasi
    }
});

const PORT = process.env.PORT || 3003;

// Konfigurasi Database dari Variabel Lingkungan
// Catatan: Untuk produksi, jangan berikan nilai default yang sensitif di sini.
// Pastikan variabel lingkungan ini diatur di lingkungan deployment (misalnya di docker-compose.yml).
const DB_HOST = process.env.DB_HOST || 'localhost'; // Akan menjadi 'mysql' di Docker Compose
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || ''; // Ganti dengan default yang aman atau kosongkan
const DB_NAME = process.env.DB_NAME || 'waiting_list_db';

// Variabel Admin dari Variabel Lingkungan
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin'; // Ganti dengan default yang aman
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin1q2w3e'; // Ganti dengan default yang aman

// Middleware
app.use(cors()); // Mengizinkan Cross-Origin Resource Sharing
app.use(express.json()); // Untuk parsing JSON body dari request

let pool; // Ganti 'connection' menjadi 'pool' untuk manajemen koneksi yang lebih baik

// Fungsi untuk menginisialisasi koneksi database dan tabel
async function initializeDatabase() {
    try {
        // Menggunakan mysql.createPool untuk koneksi yang efisien
        pool = mysql.createPool({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASSWORD,
            database: DB_NAME,
            waitForConnections: true, // Apakah akan menunggu koneksi jika pool penuh
            connectionLimit: 10,     // Jumlah koneksi maksimum di pool
            queueLimit: 0            // Jumlah permintaan yang diantrekan jika pool penuh (0 = tak terbatas)
        });
        console.log('Database pool created and connected to MySQL.');

        // Uji koneksi ke database
        const [testRows] = await pool.execute('SELECT 1 + 1 AS solution');
        console.log('Database test query result (1+1):', testRows[0].solution);

        // Membuat tabel 'users' jika belum ada
        await pool.execute(`
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

        // Menambahkan pengguna admin default jika belum ada
        const [adminCheck] = await pool.execute('SELECT COUNT(*) AS count FROM users WHERE nama = ? AND status = ?', ['Admin', 'admin']);
        if (adminCheck[0].count === 0) {
            await pool.execute('INSERT INTO users (nama, nowa, status, reg, regTime) VALUES (?, ?, ?, ?, ?)', ['Admin', 'N/A', 'admin', 'offline', new Date().toISOString()]);
            console.log('Pengguna admin default ditambahkan ke database.');
        }

    } catch (error) {
        console.error('Error saat menghubungkan atau menginisialisasi database:', error.message);
        // Penting: Jika database tidak bisa terhubung, aplikasi tidak bisa jalan.
        // Lebih baik keluar dari proses atau mencoba lagi.
        process.exit(1);
    }
}

// Penanganan koneksi Socket.io
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

// Panggil fungsi inisialisasi database, lalu jalankan server setelahnya
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
            const [rows] = await pool.execute('SELECT * FROM users'); // Menggunakan pool.execute
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
            const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]); // Menggunakan pool.execute
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
            const [result] = await pool.execute('INSERT INTO users (nama, nowa, status, reg, regTime) VALUES (?, ?, ?, ?, ?)', [nama, nowa, finalStatus, reg, regTime]); // Menggunakan pool.execute
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
            const [result] = await pool.execute(`UPDATE users SET ${setClause} WHERE id = ?`, [...values, id]); // Menggunakan pool.execute

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
            const [result] = await pool.execute('UPDATE users SET nama = ?, nowa = ?, status = ?, reg = ?, regTime = ? WHERE id = ?',
                                                     [nama, nowa, status, reg, regTime, id]); // Menggunakan pool.execute

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
            const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [id]); // Menggunakan pool.execute
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
