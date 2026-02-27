
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function listUsers() {
    try {
        const res = await pool.query(`SELECT id, email, role, created_at FROM users`);
        if (res.rows.length === 0) {
            console.log("No users found in database.");
        } else {
            console.log("Users found:");
            res.rows.forEach(u => {
                console.log(`- Email: ${u.email}, Role: ${u.role}, ID: ${u.id}`);
            });
        }
    } catch (e) {
        console.error("Error fetching users:", e);
    } finally {
        await pool.end();
    }
}

listUsers();
