
async function testLogin() {
    try {
        const res = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'demo-eval@example.com',
                password: 'password' // We need to check what the seed password is. The seed script inserts a hash directly? No, it inserts using `pool.query`.
                // Wait, the seed script inserts:
                // INSERT INTO users (..., email, role) VALUES (..., "demo-eval@example.com", "admin")
                // It DOES NOT insert a password hash?
                // Let's check schema/storage again.
            })
        });

        console.log('Status:', res.status);
        const text = await res.text();
        console.log('Body:', text);
    } catch (e) {
        console.error('Error:', e);
    }
}

testLogin();
